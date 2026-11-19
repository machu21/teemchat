/// <reference path="../global.d.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

type PlanName = "free" | "plus" | "host" | "team";

function resolveMembershipPlan(subscription: any): PlanName {
  if (subscription?.status === "canceled") return "free";

  const price = subscription?.items?.data?.[0]?.price;
  const priceId = typeof price?.id === "string" ? price.id : null;
  if (priceId) {
    const plusIds = [
      Deno.env.get("STRIPE_PRICE_PLUS_MONTHLY"),
      Deno.env.get("STRIPE_PRICE_PLUS_YEARLY"),
    ].filter(Boolean);
    const hostIds = [
      Deno.env.get("STRIPE_PRICE_HOST_MONTHLY"),
      Deno.env.get("STRIPE_PRICE_HOST_YEARLY"),
    ].filter(Boolean);
    if (plusIds.includes(priceId)) return "plus";
    if (hostIds.includes(priceId)) return "host";
  }

  const unitAmount = price?.unit_amount;
  if (unitAmount === 400 || unitAmount === 3600) return "plus";
  if (unitAmount === 1200 || unitAmount === 10800) return "host";

  const metaPlan = subscription?.metadata?.plan;
  if (metaPlan === "plus" || metaPlan === "host" || metaPlan === "team") {
    return metaPlan;
  }
  return "plus";
}

function resolveMembershipInterval(subscription: any): "month" | "year" | null {
  const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "month" || interval === "year") return interval;
  return null;
}

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

    const membershipFields = (subscription: StripeSubscription, existingFounding = false) => ({
      membership_plan: resolveMembershipPlan(subscription),
      membership_status: subscription.status,
      membership_interval: resolveMembershipInterval(subscription),
      membership_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      membership_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      is_founding_member: existingFounding || subscription.metadata?.foundingMember === "true",
      updated_at: new Date().toISOString(),
    });

    const isMembershipSubscription = async (subscription: StripeSubscription): Promise<boolean> => {
      if (subscription?.metadata?.product === "membership") return true;
      if (subscription?.metadata?.product === "ai_addon") return false;
      const { data } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id")
        .eq("membership_stripe_subscription_id", subscription.id)
        .maybeSingle();
      return Boolean(data);
    };

    const applySubscriptionUpdate = async (subscription: StripeSubscription) => {
      const membership = await isMembershipSubscription(subscription);
      if (membership) {
        const { data: existing } = await supabaseAdmin
          .from("user_subscriptions")
          .select("is_founding_member")
          .eq("membership_stripe_subscription_id", subscription.id)
          .maybeSingle();
        const { error } = await supabaseAdmin
          .from("user_subscriptions")
          .update(membershipFields(subscription, Boolean(existing?.is_founding_member)))
          .eq("membership_stripe_subscription_id", subscription.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from("user_subscriptions")
          .update(addonFields(subscription))
          .eq("stripe_subscription_id", subscription.id);
        if (error) throw error;
      }
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeSession;
        const userId = session.client_reference_id || session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const product =
            session.metadata?.product === "membership" || subscription.metadata?.product === "membership"
              ? "membership"
              : "ai_addon";

          const { data: existingRow } = await supabaseAdmin
            .from("user_subscriptions")
            .select("id, is_founding_member")
            .eq("user_id", userId)
            .maybeSingle();

          if (product === "membership") {
            const fields = {
              stripe_customer_id: customerId,
              membership_stripe_subscription_id: subscriptionId,
              ...membershipFields(subscription, Boolean(existingRow?.is_founding_member)),
            };

            if (existingRow) {
              const { error } = await supabaseAdmin
                .from("user_subscriptions")
                .update(fields)
                .eq("user_id", userId);
              if (error) throw error;
            } else {
              const { error } = await supabaseAdmin
                .from("user_subscriptions")
                .insert({
                  user_id: userId,
                  plan_id: session.metadata?.planId || "plus_monthly",
                  status: "canceled",
                  has_ai_addon: false,
                  has_ai_unlimited: false,
                  ...fields,
                });
              if (error) throw error;
            }
          } else {
            const fields = {
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan_id: session.metadata?.planId || "ai_addon_monthly",
              ...addonFields(subscription),
            };

            if (existingRow) {
              const { error } = await supabaseAdmin
                .from("user_subscriptions")
                .update(fields)
                .eq("user_id", userId);
              if (error) throw error;
            } else {
              const { error } = await supabaseAdmin
                .from("user_subscriptions")
                .insert({
                  user_id: userId,
                  ...fields,
                });
              if (error) throw error;
            }
          }
        }
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscriptionUpdate(subscription);
        }

        // Record or update the invoice log in billing_invoices
        try {
          let userId = invoice.metadata?.userId || invoice.subscription_details?.metadata?.userId;
          if (!userId && subscriptionId) {
            const { data: sub } = await supabaseAdmin
              .from("user_subscriptions")
              .select("user_id")
              .or(`stripe_subscription_id.eq.${subscriptionId},membership_stripe_subscription_id.eq.${subscriptionId}`)
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
        await applySubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscription;
        const membership = await isMembershipSubscription(subscription);
        if (membership) {
          const { error } = await supabaseAdmin
            .from("user_subscriptions")
            .update({
              membership_status: "canceled",
              membership_plan: "free",
              membership_cancel_at_period_end: false,
              updated_at: new Date().toISOString(),
            })
            .eq("membership_stripe_subscription_id", subscription.id);
          if (error) throw error;
        } else {
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
        }
        break;
      }

      default:
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
