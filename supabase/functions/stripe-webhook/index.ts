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

  if (!endpointSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set; refusing unsigned webhook");
    return new Response("Webhook not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  type StripeEvent = any;
  type StripeSession = any;
  type StripeInvoice = any;
  type StripeSubscription = any;

  const rawBody = await req.text();
  let event: StripeEvent;

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Create privileged Supabase admin client (Service Role key) to update user_subscriptions
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    // AI add-on access follows the Stripe subscription status. past_due keeps the flag
    // while Stripe retries the card; has_active_ai_addon() only grants access for
    // active/trialing, so the 5-hour AI window pauses until the payment succeeds.
    const addonFields = (subscription: StripeSubscription) => ({
      status: subscription.status,
      has_ai_addon: ["active", "trialing", "past_due"].includes(subscription.status),
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeSession;
        const userId = session.client_reference_id || session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const { error } = await supabaseAdmin.from("user_subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_id: session.metadata?.planId || "ai_addon_monthly",
            ...addonFields(subscription),
          }, { onConflict: "user_id" });
          if (error) throw error;
        }
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const { error } = await supabaseAdmin
            .from("user_subscriptions")
            .update(addonFields(subscription))
            .eq("stripe_subscription_id", subscriptionId);
          if (error) throw error;
        }

        // Record or update the invoice log in billing_invoices
        try {
          let userId = invoice.metadata?.userId || invoice.subscription_details?.metadata?.userId;
          if (!userId && subscriptionId) {
            const { data: sub } = await supabaseAdmin
              .from("user_subscriptions")
              .select("user_id")
              .eq("stripe_subscription_id", subscriptionId)
              .maybeSingle();
            userId = sub?.user_id;
          }
          if (!userId && invoice.customer) {
            const { data: sub } = await supabaseAdmin
              .from("user_subscriptions")
              .select("user_id")
              .eq("stripe_customer_id", invoice.customer as string)
              .maybeSingle();
            userId = sub?.user_id;
          }

          if (userId && invoice.id) {
            await supabaseAdmin.from("billing_invoices").upsert({
              user_id: userId,
              stripe_invoice_id: invoice.id,
              amount_cents: invoice.amount_paid ?? invoice.total ?? 0,
              currency: invoice.currency ?? "usd",
              status: invoice.status === "paid" ? "paid" : "open",
              invoice_pdf: invoice.invoice_pdf || null,
              paid_at: invoice.status === "paid" ? new Date().toISOString() : null,
            }, { onConflict: "stripe_invoice_id" });
          }
        } catch (invoiceErr) {
          console.warn("Failed to record billing invoice:", invoiceErr);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as StripeSubscription;
        const { error } = await supabaseAdmin
          .from("user_subscriptions")
          .update(addonFields(subscription))
          .eq("stripe_subscription_id", subscription.id);
        if (error) throw error;
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscription;
        const { error } = await supabaseAdmin
          .from("user_subscriptions")
          .update({
            status: "canceled",
            has_ai_addon: false,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        if (error) throw error;
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
