/// <reference path="../global.d.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const AI_ADDON_PLANS = {
  month: { planId: "ai_addon_monthly", priceEnv: "STRIPE_PRICE_AI_MONTHLY", unitAmount: 500 },
  year: { planId: "ai_addon_yearly", priceEnv: "STRIPE_PRICE_AI_YEARLY", unitAmount: 4500 },
} as const;

const MEMBERSHIP_PLANS = {
  plus: {
    name: "TeemChat Plus",
    description: "10 permanent maps, up to 50 players per room, and call video & screen share.",
    month: { planId: "plus_monthly", priceEnv: "STRIPE_PRICE_PLUS_MONTHLY", unitAmount: 400 },
    year: { planId: "plus_yearly", priceEnv: "STRIPE_PRICE_PLUS_YEARLY", unitAmount: 3600 },
  },
  host: {
    name: "TeemChat Host",
    description: "25 permanent maps, up to 150 players per room, host moderation, and call video & screen share.",
    month: { planId: "host_monthly", priceEnv: "STRIPE_PRICE_HOST_MONTHLY", unitAmount: 1200 },
    year: { planId: "host_yearly", priceEnv: "STRIPE_PRICE_HOST_YEARLY", unitAmount: 10800 },
  },
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized user" }, 401);
    }

    // Guests are temporary accounts; they must register before buying.
    const isGuest =
      Boolean(user.is_anonymous) ||
      Boolean(user.app_metadata?.is_guest) ||
      Boolean(user.user_metadata?.is_guest) ||
      Boolean(user.email?.endsWith("@guest.teemchat.local"));
    if (isGuest) {
      return jsonResponse({ error: "Create an account before subscribing." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const product: "membership" | "ai_addon" = body.product === "membership" ? "membership" : "ai_addon";
    const interval: "month" | "year" = body.interval === "year" ? "year" : "month";

    if (product === "membership" && body.plan !== "plus" && body.plan !== "host") {
      return jsonResponse({ error: "Invalid plan. Choose plus or host." }, 400);
    }

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

    const { data: subData } = await supabase
      .from("user_subscriptions")
      .select(
        "stripe_customer_id, stripe_subscription_id, status, has_ai_addon, membership_stripe_subscription_id, membership_status"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (product === "ai_addon") {
      if (
        subData?.has_ai_addon &&
        subData.stripe_subscription_id &&
        ["active", "trialing", "past_due"].includes(subData.status)
      ) {
        return jsonResponse({ error: "You already have the AI add-on." }, 409);
      }
    } else {
      if (
        subData?.membership_stripe_subscription_id &&
        ["active", "trialing", "past_due"].includes(subData.membership_status ?? "")
      ) {
        return jsonResponse({ error: "You already have a plan. Use Manage billing to change it." }, 409);
      }
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

    let lineItem: Record<string, unknown>;
    let metadata: Record<string, string>;
    let foundingCouponToApply: string | null = null;

    if (product === "membership") {
      const planKey = body.plan as "plus" | "host";
      const planGroup = MEMBERSHIP_PLANS[planKey];
      const priceCfg = planGroup[interval];
      const priceId = Deno.env.get(priceCfg.priceEnv);

      lineItem = priceId
        ? { price: priceId, quantity: 1 }
        : {
            price_data: {
              currency: "usd",
              product_data: {
                name: planGroup.name,
                description: planGroup.description,
              },
              unit_amount: priceCfg.unitAmount,
              recurring: { interval },
            },
            quantity: 1,
          };

      if (planKey === "plus") {
        const couponId = Deno.env.get("STRIPE_FOUNDING_COUPON_ID")?.trim();
        const cutoffStr = Deno.env.get("FOUNDING_MEMBER_CUTOFF")?.trim();
        const offerEndsStr = Deno.env.get("FOUNDING_OFFER_ENDS")?.trim();
        if (couponId && cutoffStr && offerEndsStr) {
          const cutoffMs = Date.parse(cutoffStr);
          const endsMs = Date.parse(offerEndsStr);
          if (!Number.isNaN(cutoffMs) && !Number.isNaN(endsMs) && Date.now() < endsMs) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("created_at")
              .eq("id", user.id)
              .maybeSingle();
            const createdMs = profile?.created_at ? Date.parse(profile.created_at) : NaN;
            if (!Number.isNaN(createdMs) && createdMs < cutoffMs) {
              foundingCouponToApply = couponId;
            }
          }
        }
      }

      metadata = {
        userId: user.id,
        product: "membership",
        plan: planKey,
        planId: priceCfg.planId,
        foundingMember: foundingCouponToApply ? "true" : "false",
      };
    } else {
      const plan = AI_ADDON_PLANS[interval];
      const priceId = Deno.env.get(plan.priceEnv);
      lineItem = priceId
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

      metadata = {
        userId: user.id,
        product: "ai_addon",
        planId: plan.planId,
        foundingMember: "false",
      };
    }

    const sessionParams: Record<string, unknown> = {
      customer: customerId,
      mode: "subscription",
      line_items: [lineItem],
      client_reference_id: user.id,
      metadata,
      subscription_data: { metadata },
      success_url: successUrlWithSession,
      cancel_url: cancelUrl.toString(),
    };

    // Stripe rejects passing both `discounts` and `allow_promotion_codes`.
    if (foundingCouponToApply) {
      sessionParams.discounts = [{ coupon: foundingCouponToApply }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams as any);

    return jsonResponse({ url: session.url, sessionId: session.id }, 200);
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
