import { z } from 'zod';

export const SystemRoleSchema = z.enum(['user', 'moderator', 'admin', 'superadmin']);
export type SystemRole = z.infer<typeof SystemRoleSchema>;

export const CreateUserSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscores, dashes, and periods')
    .optional(),
  displayName: z.string().trim().min(1, 'Display name is required').max(50, 'Display name cannot exceed 50 characters').default('Explorer'),
  gender: z.enum(['male', 'female']).default('male'),
  tier: z.enum(['free', 'pro', 'enterprise']).default('free'),
  systemRole: SystemRoleSchema.default('user'),
  autoConfirm: z.boolean().default(true),
  hasAiCompanion: z.boolean().default(false),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .optional(),
  status: z.enum(['available', 'away', 'busy', 'focus', 'offline', 'banned']).optional(),
  statusMessage: z.string().trim().max(160).nullable().optional(),
  tier: z.enum(['free', 'pro', 'enterprise']).optional(),
  isPaid: z.boolean().optional(),
  systemRole: SystemRoleSchema.optional(),
  password: z.string().min(8).optional(),
  hasAiCompanion: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().trim().optional(),
  role: SystemRoleSchema.optional(),
  tier: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const SubscriptionOverrideSchema = z.object({
  status: z.enum(['active', 'trialing', 'past_due', 'canceled']),
  planId: z.string().trim().min(1).optional(),
  hasAiUnlimited: z.boolean().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});
export type SubscriptionOverrideInput = z.infer<typeof SubscriptionOverrideSchema>;

export const CreateInvoiceLogSchema = z.object({
  userId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'Invalid UUID'),
  stripeInvoiceId: z.string().trim().optional(),
  amountCents: z.number().int().min(0),
  currency: z.string().trim().default('usd'),
  status: z.enum(['paid', 'open', 'void', 'uncollectible']).default('paid'),
  invoicePdf: z.string().url().optional(),
  paidAt: z.string().datetime().optional(),
});
export type CreateInvoiceLogInput = z.infer<typeof CreateInvoiceLogSchema>;

export const WHITELISTED_CRUD_ENTITIES = [
  'spaces',
  'worlds',
  'space_settings',
  'space_members',
  'space_roles',
  'user_reports',
  'space_bans',
  'space_mutes',
  'ai_companions',
  'companion_memories',
  'space_playlists',
  'playlist_tracks',
  'world_objects',
  'billing_invoices',
  'user_subscriptions',
  'user_safety',
] as const;

export type WhitelistedCrudEntity = (typeof WHITELISTED_CRUD_ENTITIES)[number];

/** Tables keyed by something other than `id`. */
const CRUD_PRIMARY_KEYS: Partial<Record<WhitelistedCrudEntity, string>> = {
  space_settings: 'space_id',
  user_safety: 'user_id',
};

export function crudPrimaryKey(entity: WhitelistedCrudEntity): string {
  return CRUD_PRIMARY_KEYS[entity] ?? 'id';
}

export function isValidCrudEntity(entity: string): entity is WhitelistedCrudEntity {
  return (WHITELISTED_CRUD_ENTITIES as readonly string[]).includes(entity);
}
