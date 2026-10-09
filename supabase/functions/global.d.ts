// Type definitions for Supabase Edge Functions (Deno runtime) for IDE TypeScript support

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  }
  export const env: Env;
}

declare module "https://deno.land/std@0.177.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number; onListen?: (params: { port: number; hostname: string }) => void }
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.39.8" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: any
  ): any;
}

declare module "https://esm.sh/stripe@14.14.0?target=deno" {
  export interface StripeEvent {
    id: string;
    type: string;
    data: {
      object: any;
    };
  }

  export class Stripe {
    constructor(apiKey: string, config?: any);
    customers: any;
    checkout: any;
    subscriptions: any;
    billingPortal: any;
    webhooks: any;
    static createFetchHttpClient(): any;
  }

  export default Stripe;
}

declare module "https://*" {
  const value: any;
  export default value;
  export const serve: any;
  export const createClient: any;
}
