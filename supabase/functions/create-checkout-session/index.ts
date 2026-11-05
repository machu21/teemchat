/// <reference path="../global.d.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// AI Companion add-on: $5/month or $45/year (25% off). Set STRIPE_PRICE_AI_MONTHLY /
// STRIPE_PRICE_AI_YEARLY to Stripe Price IDs to manage prices from the Stripe dashboard.
const AI_ADDON_PLANS = {
  month: { planId: "ai_addon_monthly", priceEnv: "STRIPE_PRICE_AI_MONTHLY", unitAmount: 500 },
  year: { planId: "ai_addon_yearly", priceEnv: "STRIPE_PRICE_AI_YEARLY", unitAmount: 4500 },
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user via Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guests are temporary accounts; they must register before buying.
    const isGuest =
      Boolean(user.is_anonymous) ||
      Boolean(user.app_metadata?.is_guest) ||
      Boolean(user.user_metadata?.is_guest) ||
      Boolean(user.email?.endsWith("@guest.teemchat.local"));
    if (isGuest) {
      return new Response(JSON.stringify({ error: "Create an account before buying the AI add-on." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const interval: "month" | "year" = body.interval === "year" ? "year" : "month";
    const plan = AI_ADDON_PLANS[interval];

    // Only redirect back to our own app, never to a URL supplied by the caller's choosing.
    const allowedOrigins = (Deno.env.get("ALLOWED_REDIRECT_ORIGINS") ?? "https://www.teemchat.chat,https://teemchat.chat")
      .split(",")
      .map((o: string) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    const requestOrigin = req.headers.get("origin") ?? "";
    const appOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

    const resolveRedirect = (candidate: unknown, fallbackPath: string): URL => {
      if (typeof candidate === "string") {
        try {
          const url = new URL(candidate, appOrigin);
          if (allowedOrigins.includes(url.origin)) return url;
        } catch {
          // fall through to default
        }
      }
      return new URL(fallbackPath, appOrigin);
    };

    const successUrl = resolveRedirect(body.successUrl, "/dashboard?billing=success");
    const cancelUrl = resolveRedirect(body.cancelUrl, "/dashboard?billing=cancel");
    // Stripe substitutes this placeholder; keep the braces unencoded.
    const successUrlWithSession =
      `${successUrl.toString()}${successUrl.search ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;

    // Check if user already has a Stripe customer ID stored
    const { data: subData } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, has_ai_addon")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      subData?.has_ai_addon &&
      subData.stripe_subscription_id &&
      ["active", "trialing", "past_due"].includes(subData.status)
    ) {
      return new Response(JSON.stringify({ error: "You already have the AI add-on." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let customerId = subData?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
    }

    // Recurring Checkout Session for the AI Companion add-on.
    // Uses the Stripe Price ID when configured, otherwise an inline price.
    const priceId = Deno.env.get(plan.priceEnv);
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: "TeemChat AI Companion add-on",
              description: "60 AI companion messages every 5 hours, persistent memory and custom persona.",
            },
            unit_amount: plan.unitAmount,
            recurring: { interval },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [lineItem],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        planId: plan.planId,
        product: "ai_addon",
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planId: plan.planId,
          product: "ai_addon",
        },
      },
      success_url: successUrlWithSession,
      cancel_url: cancelUrl.toString(),
    });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
