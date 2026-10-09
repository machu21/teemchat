/// <reference path="../global.d.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature && endpointSecret) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  type StripeEvent = any;
  type StripeSession = any;
  type StripeInvoice = any;
  type StripeSubscription = any;

  const rawBody = await req.text();
  let event: StripeEvent;

  try {
    if (endpointSecret) {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature!, endpointSecret);
    } else {
      // In local dev without webhook secret set yet, parse raw payload
      event = JSON.parse(rawBody) as StripeEvent;
    }
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Create privileged Supabase admin client (Service Role key) to update user_subscriptions
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeSession;
        const userId = session.client_reference_id || session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          await supabaseAdmin.from("user_subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_id: session.metadata?.planId || "ai_unlimited_monthly",
            status: subscription.status,
            has_ai_unlimited: true,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as StripeInvoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await supabaseAdmin
            .from("user_subscriptions")
            .update({
              status: "active",
              has_ai_unlimited: true,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as StripeSubscription;
        const isActive = subscription.status === "active" || subscription.status === "trialing";

        await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: subscription.status,
            has_ai_unlimited: isActive,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscription;

        await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: "canceled",
            has_ai_unlimited: false,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      default:
        // Other events ignored
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error processing Stripe webhook:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
