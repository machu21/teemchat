/**
 * OWASP Top 10 (2025) security regression suite.
 *
 * One block per category. Each test pins a concrete control in this codebase
 * (route behaviour, schema, config or source), so removing the control fails CI.
 * Deeper per-feature cases live in the existing suites, referenced per category:
 *   tests/api/adversarial_probe.test.ts, tests/api/admin_adversarial_*.test.ts,
 *   tests/admin_adversarial_guard.test.ts, tests/api/login.test.ts,
 *   tests/api/register.test.ts, tests/crypto_service.test.ts, tests/rateLimit.test.ts,
 *   tests/api/livekit_token*.test.ts, tests/email_verification.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://owasp-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.ADMIN_SECRET_KEY = 'correct-admin-machine-key-0123456789';
  process.env.LIVEKIT_API_KEY = 'lk-test-key';
  process.env.LIVEKIT_API_SECRET = 'lk-test-secret';
});

// ── Supabase stub: an unauthenticated / non-admin world by default ──
// Hoisted because src/lib/supabase.ts calls createClient at import time.
const { authState, mockSignUp, stubClient } = vi.hoisted(() => {
  const authState: {
    user: { id: string; email: string } | null;
    profile: Record<string, unknown> | null;
    signInError: { message: string; code?: string } | null;
    signUpImpl: (() => unknown) | null;
  } = { user: null, profile: null, signInError: null, signUpImpl: null };

  function chain(): unknown {
    const result = () => Promise.resolve({ data: authState.profile, error: null, count: 0 });
    const handler: ProxyHandler<object> = {
      get(_t, prop) {
        if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
        if (prop === 'single' || prop === 'maybeSingle') return () => result();
        return () => proxy;
      },
    };
    const proxy: object = new Proxy({}, handler);
    return proxy;
  }

  const mockSignUp = vi.fn();
  const stubClient = {
    auth: {
      getUser: vi.fn(async () =>
        authState.user
          ? { data: { user: authState.user }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } }
      ),
      signInWithPassword: vi.fn(async () =>
        authState.signInError
          ? { data: { user: null, session: null }, error: authState.signInError }
          : { data: { user: authState.user, session: { access_token: 'a', refresh_token: 'r' } }, error: null }
      ),
      signUp: (...args: unknown[]) => (authState.signUpImpl ? authState.signUpImpl() : mockSignUp(...args)),
      admin: { deleteUser: vi.fn(async () => ({ error: null })) },
    },
    from: vi.fn(() => chain()),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ list: async () => ({ data: [] }), remove: async () => ({ error: null }) })) },
  };

  return { authState, mockSignUp, stubClient };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => stubClient) }));
vi.mock('@/lib/security/emailDomain', () => ({ emailDomainAcceptsMail: async () => true }));

import { POST as registerPOST } from '../../src/app/api/auth/register/route';
import { POST as loginPOST } from '../../src/app/api/auth/login/route';
import { GET as guestIdentityGET } from '../../src/app/api/auth/guest-identity/route';
import { POST as accountDeletePOST } from '../../src/app/api/account/delete/route';
import { GET as adminUsersGET, POST as adminUsersPOST } from '../../src/app/api/admin/users/route';
import { GET as adminMetricsGET } from '../../src/app/api/admin/metrics/route';
import { POST as livekitPOST } from '../../src/app/api/livekit/token/route';
import { POST as companionPOST } from '../../src/app/api/companion/chat/route';
import { POST as screenHelpPOST } from '../../src/app/api/companion/screen-help/route';
import { POST as meetingNotesPOST } from '../../src/app/api/meetings/notes/route';
import { defaultRateLimiter, RATE_LIMITS } from '../../src/lib/rateLimit';
import { validateUsername } from '../../src/lib/security/disposableEmails';
import * as guestIdentityLib from '../../src/lib/security/guestIdentity';
import {
  CryptoService,
  LEGACY_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  decodeBackupSalt,
  encodeBackupSalt,
} from '../../src/lib/services/cryptoService';
import nextConfig, { securityHeaders } from '../../next.config';

// ── Helpers ──
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const SCHEMA = read('supabase/schema.sql');
/** Schema with SQL line comments removed, so commented-out statements never count. */
const SCHEMA_CODE = SCHEMA.replace(/--[^\n]*/g, '');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const SRC_FILES = walk(path.join(APP_ROOT, 'src'));
const srcText = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => path.relative(APP_ROOT, f).replace(/\\/g, '/');

let ipCounter = 10;
const freshIp = () => `203.0.113.${ipCounter++ % 250}`;

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp(), ...headers },
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validSignup = (over: Record<string, unknown> = {}) => ({
  email: 'owasp.player@example.org',
  password: 'correct-horse-battery',
  username: 'owasp_player',
  displayName: 'Owasp Player',
  renderedAt: Date.now() - 4000,
  ...over,
});

/** Splits schema.sql into CREATE FUNCTION statements, honouring $$ / $tag$ bodies. */
function functionStatements(sql: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  const re = /create\s+or\s+replace\s+function\s+((?:public|private)\.\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const start = m.index;
    const open = /\$(\w*)\$/.exec(sql.slice(start));
    if (!open) continue;
    const bodyStart = start + open.index + open[0].length;
    const close = sql.indexOf(open[0], bodyStart);
    const end = sql.indexOf(';', close + open[0].length);
    out.push({ name: m[1].toLowerCase(), text: sql.slice(start, end + 1) });
    re.lastIndex = end + 1;
  }
  return out;
}

beforeEach(() => {
  defaultRateLimiter.reset();
  authState.user = null;
  authState.profile = null;
  authState.signInError = null;
  authState.signUpImpl = null;
  mockSignUp.mockReset().mockResolvedValue({
    data: { user: { id: 'usr-owasp', email: 'owasp.player@example.org' }, session: { access_token: 'a', refresh_token: 'r' } },
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
describe('A01:2025 Broken Access Control', () => {
  const protectedRoutes: [string, (r: NextRequest) => Promise<Response>, string][] = [
    ['account delete', accountDeletePOST, '/api/account/delete'],
    ['livekit token', livekitPOST, '/api/livekit/token'],
    ['companion chat', companionPOST, '/api/companion/chat'],
    ['screen help', screenHelpPOST, '/api/companion/screen-help'],
    ['meeting notes', meetingNotesPOST, '/api/meetings/notes'],
  ];

  it.each(protectedRoutes)('%s rejects requests with no token (401)', async (_n, handler, url) => {
    const res = await handler(jsonReq(url, { confirm: 'DELETE', roomName: 'space:x', message: 'hi', spaceId: 'x' }));
    expect(res.status).toBe(401);
  });

  it.each(protectedRoutes)('%s rejects a forged / expired token (401)', async (_n, handler, url) => {
    const res = await handler(
      jsonReq(url, { confirm: 'DELETE', roomName: 'space:x', message: 'hi', spaceId: 'x' }, { authorization: 'Bearer forged.jwt.token' })
    );
    expect(res.status).toBe(401);
  });

  it('admin API refuses anonymous callers', async () => {
    const res = await adminUsersGET(jsonReq('/api/admin/users', null, {}, 'GET'));
    expect(res.status).toBe(401);
  });

  it('admin API refuses a wrong machine key', async () => {
    const res = await adminMetricsGET(jsonReq('/api/admin/metrics', null, { 'x-admin-api-key': 'guess' }, 'GET'));
    expect(res.status).toBe(401);
  });

  it('admin API refuses a signed-in regular user (no vertical escalation)', async () => {
    authState.user = { id: '11111111-1111-1111-1111-111111111111', email: 'user@example.org' };
    authState.profile = { id: authState.user.id, system_role: 'user', status: 'available' };
    const res = await adminUsersPOST(
      jsonReq('/api/admin/users', { email: 'x@example.org', systemRole: 'superadmin' }, { authorization: 'Bearer user.jwt' })
    );
    expect(res.status).toBe(403);
  });

  it('every public table has Row Level Security enabled', () => {
    const tables = [...SCHEMA_CODE.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map((m) => m[1]);
    const rls = new Set(
      [...SCHEMA_CODE.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1])
    );
    expect(tables.length).toBeGreaterThan(20);
    expect(tables.filter((t) => !rls.has(t))).toEqual([]);
  });

  it('every SECURITY DEFINER function pins search_path (no schema hijacking)', () => {
    const altered = new Set(
      [...SCHEMA_CODE.matchAll(/alter\s+function\s+((?:public|private)\.\w+)\s*\([^)]*\)\s+set\s+search_path/gi)].map((m) =>
        m[1].toLowerCase()
      )
    );
    const latest = new Map<string, string>();
    for (const fn of functionStatements(SCHEMA_CODE)) latest.set(fn.name, fn.text);
    const definers = [...latest.values()].filter((text) => /security\s+definer/i.test(text));
    // Guard against a parser regression making this test pass vacuously.
    expect(definers.length).toBeGreaterThan(30);
    expect(latest.get('public.check_email_verification')).toMatch(/set search_path = public, auth, pg_temp/);
    const unsafe = [...latest]
      .filter(([, text]) => /security\s+definer/i.test(text) && !/set\s+search_path/i.test(text))
      .map(([name]) => name)
      .filter((name) => !altered.has(name));
    expect(unsafe).toEqual([]);
  });

  it('only intended functions stay executable by anonymous callers', () => {
    const ANON_ALLOWED = new Set(['public.resolve_space_invite', 'public.provision_guest_account']);
    const state = new Map<string, boolean>();
    const re = /(grant|revoke)\s+execute\s+on\s+function\s+((?:public|private)\.\w+)\s*\([^)]*\)\s+(?:to|from)\s+([^;]+);/gi;
    for (const m of SCHEMA_CODE.matchAll(re)) {
      const roles = m[3].toLowerCase();
      if (!/\banon\b|\bpublic\b/.test(roles)) continue;
      state.set(m[2].toLowerCase(), m[1].toLowerCase() === 'grant');
    }
    const exposed = [...state].filter(([, granted]) => granted).map(([fn]) => fn);
    expect(exposed.filter((fn) => !ANON_ALLOWED.has(fn))).toEqual([]);
  });

  it('users cannot mark their own email as verified (no client write policy)', () => {
    const policies = [...SCHEMA_CODE.matchAll(/create\s+policy\s+"[^"]+"\s+on\s+public\.email_verifications\s+for\s+(\w+)/gi)].map((m) =>
      m[1].toLowerCase()
    );
    expect(policies).toEqual(['select']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A02:2025 Security Misconfiguration', () => {
  const header = (key: string) => securityHeaders.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

  it('sends anti-clickjacking, nosniff, referrer and HSTS headers on every route', async () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(header('Content-Security-Policy')).toContain("object-src 'none'");
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{8,}/);
    const rules = await nextConfig.headers!();
    expect(rules.some((r) => r.source === '/:path*' && r.headers === securityHeaders)).toBe(true);
  });

  it('limits powerful browser features to our own origin', () => {
    const policy = header('Permissions-Policy') ?? '';
    expect(policy).toContain('microphone=(self)');
    expect(policy).toContain('camera=(self)');
    expect(policy).toContain('geolocation=()');
  });

  it('does not advertise the framework (X-Powered-By off)', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('never exposes server secrets through NEXT_PUBLIC_ variables', () => {
    const leaks = SRC_FILES.flatMap((f) =>
      [...srcText(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|API_KEY)[A-Z0-9_]*/g)].map((m) => `${rel(f)}: ${m[0]}`)
    );
    expect(leaks).toEqual([]);
  });

  it("server secrets are never referenced from 'use client' code", () => {
    const SECRETS = ['SUPABASE_SERVICE_ROLE_KEY', 'LIVEKIT_API_SECRET', 'STRIPE_SECRET_KEY', 'GEMINI_API_KEY', 'ADMIN_SECRET_KEY'];
    const offenders = SRC_FILES.filter((f) => /^\s*['"]use client['"]/.test(srcText(f)))
      .filter((f) => SECRETS.some((s) => srcText(f).includes(s)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('no real .env files are committed', () => {
    const tracked = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n');
    const envFiles = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/example/i.test(f));
    expect(envFiles).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A03:2025 Software Supply Chain Failures', () => {
  const lock = JSON.parse(read('package-lock.json')) as {
    lockfileVersion: number;
    packages: Record<string, { resolved?: string; integrity?: string; link?: boolean }>;
  };
  const pkg = JSON.parse(readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('a lockfile is committed so installs are reproducible', () => {
    const tracked = execSync('git ls-files package-lock.json', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    expect(tracked).toBe('package-lock.json');
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it('no dependency floats on latest/*, git, URL or local-file specs', () => {
    const specs = { ...pkg.dependencies, ...pkg.devDependencies };
    const risky = Object.entries(specs).filter(([, v]) => /^(latest|\*|x)$|^(git|github:|https?:|file:|link:)/i.test(v.trim()));
    expect(risky).toEqual([]);
  });

  it('every locked package comes from the npm registry with an integrity hash', () => {
    const remote = Object.entries(lock.packages).filter(([k, v]) => k.includes('node_modules/') && !v.link);
    expect(remote.length).toBeGreaterThan(50);
    const bad = remote.filter(
      ([, v]) => !v.resolved?.startsWith('https://registry.npmjs.org/') || !/^sha(256|384|512)-/.test(v.integrity ?? '')
    );
    expect(bad.map(([k]) => k)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A04:2025 Cryptographic Failures', () => {
  it('key backups use the current PBKDF2 work factor and record it', async () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const pair = await CryptoService.generateUserKeyPair();
    const backup = await CryptoService.wrapPrivateKey(pair.privateKeyPkcs8, 'long enough passphrase');
    expect(backup.salt.startsWith(`p${PBKDF2_ITERATIONS}:`)).toBe(true);
    expect(backup.encryptedPrivateKey).not.toContain(pair.privateKeyPkcs8.slice(0, 24));
    await expect(CryptoService.unwrapPrivateKey(backup, 'long enough passphrase')).resolves.toBe(pair.privateKeyPkcs8);
  }, 20_000);

  it('a wrong passphrase or tampered ciphertext fails (authenticated encryption)', async () => {
    const pair = await CryptoService.generateUserKeyPair();
    const backup = await CryptoService.wrapPrivateKey(pair.privateKeyPkcs8, 'right passphrase!');
    await expect(CryptoService.unwrapPrivateKey(backup, 'wrong passphrase!')).rejects.toThrow();
    const bytes = Buffer.from(backup.encryptedPrivateKey, 'base64');
    bytes[5] ^= 0xff;
    await expect(
      CryptoService.unwrapPrivateKey({ ...backup, encryptedPrivateKey: bytes.toString('base64') }, 'right passphrase!')
    ).rejects.toThrow();
  }, 20_000);

  it('older backups still restore, but a downgraded work factor is refused', () => {
    const salt = new Uint8Array(16).fill(7);
    expect(decodeBackupSalt(Buffer.from(salt).toString('base64')).iterations).toBe(LEGACY_PBKDF2_ITERATIONS);
    expect(decodeBackupSalt(encodeBackupSalt(salt)).iterations).toBe(PBKDF2_ITERATIONS);
    expect(() => decodeBackupSalt(`p1000:${Buffer.from(salt).toString('base64')}`)).toThrow();
  });

  it('every encryption uses a fresh random IV (same plaintext, different ciphertext)', async () => {
    const key = await CryptoService.generateRoomKey();
    const a = await CryptoService.encryptText('hello world', key);
    const b = await CryptoService.encryptText('hello world', key);
    expect(a).not.toBe(b);
    await expect(CryptoService.decryptText(a, key)).resolves.toBe('hello world');
  });

  it('crypto code never uses Math.random', () => {
    for (const f of ['src/lib/services/cryptoService.ts', 'src/lib/services/e2eeManager.ts']) {
      expect(readFileSync(path.join(APP_ROOT, f), 'utf8')).not.toMatch(/Math\.random/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A05:2025 Injection', () => {
  it.each([
    "admin'--",
    "x' OR '1'='1",
    'name),or(system_role.eq.superadmin',
    '<script>alert(1)</script>',
    '../../etc/passwd',
    'a b',
  ])('usernames reject injection payload %j', (payload) => {
    expect(validateUsername(payload).valid).toBe(false);
  });

  it('a hostile username never reaches Supabase Auth', async () => {
    const res = await registerPOST(jsonReq('/api/auth/register', validSignup({ username: "x' OR '1'='1" })));
    expect(res.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('raw HTML injection is limited to static, serialized markup', () => {
    const uses = SRC_FILES.filter((f) => srcText(f).includes('dangerouslySetInnerHTML')).map(rel).sort();
    expect(uses).toEqual(['src/app/layout.tsx', 'src/components/seo/JsonLd.tsx']);
    const jsonLd = readFileSync(path.join(APP_ROOT, 'src/components/seo/JsonLd.tsx'), 'utf8');
    for (const m of jsonLd.matchAll(/__html:\s*([^}]+)\}/g)) expect(m[1]).toMatch(/^JSON\.stringify\(/);
  });

  it('no dynamic code execution in app source', () => {
    const offenders = SRC_FILES.filter((f) => /\beval\s*\(|new\s+Function\s*\(/.test(srcText(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A06:2025 Insecure Design', () => {
  it('sign-up traps bots with a honeypot field', async () => {
    const res = await registerPOST(jsonReq('/api/auth/register', validSignup({ website_url: 'http://spam.example' })));
    expect(res.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('sign-up rejects forms submitted faster than a human can type', async () => {
    const res = await registerPOST(jsonReq('/api/auth/register', validSignup({ renderedAt: Date.now() })));
    expect(res.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('auth endpoints have tight rate limits', () => {
    for (const cfg of [RATE_LIMITS.AUTH_SIGNUP, RATE_LIMITS.AUTH_LOGIN]) {
      expect(cfg.max).toBeLessThanOrEqual(10);
    }
  });

  it('friend requests and DMs require a verified email at the database', () => {
    const policy = (name: string) => {
      const all = [...SCHEMA_CODE.matchAll(new RegExp(`create\\s+policy\\s+"${name}"[\\s\\S]*?;`, 'gi'))];
      return all[all.length - 1]?.[0] ?? '';
    };
    expect(policy('Users can send friend requests')).toContain('private.is_email_verified');
    expect(policy('Participants can send direct messages')).toContain('private.is_email_verified');
  });

  it('only an inbox-proving sign-in can verify an email, never the password sign-up', () => {
    const fn = functionStatements(SCHEMA_CODE).filter((f) => f.name === 'public.check_email_verification').pop()?.text ?? '';
    const list = /elem->>'method'\s+in\s+\(([^)]+)\)/i.exec(fn)?.[1] ?? '';
    expect(list).toContain("'otp'");
    expect(list).not.toMatch(/'password'|'email\/signup'/);
    expect(fn).toContain("auth.jwt() -> 'amr'");
  });

  it('unverified-account cleanup never deletes paid or staff accounts', () => {
    const fn = functionStatements(SCHEMA_CODE).filter((f) => f.name === 'public.cleanup_unverified_accounts').pop()?.text ?? '';
    expect(fn).toMatch(/is_paid,\s*false\)\s*=\s*false/);
    expect(fn).toMatch(/system_role\s+is\s+null/);
    expect(fn).toMatch(/limit\s+least\(/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A07:2025 Authentication Failures', () => {
  it.each([
    ['7 characters', '1234567'],
    ['over 128 characters', 'x'.repeat(129)],
  ])('sign-up rejects a password of %s', async (_label, password) => {
    const res = await registerPOST(jsonReq('/api/auth/register', validSignup({ password })));
    expect(res.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('sign-up accepts an 8+ character password', async () => {
    const res = await registerPOST(jsonReq('/api/auth/register', validSignup({ password: '8charsOK' })));
    expect(res.status).toBe(200);
  });

  it('locks an account after repeated failed logins (brute force)', async () => {
    authState.signInError = { message: 'Invalid login credentials' };
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await loginPOST(jsonReq('/api/auth/login', { email: 'victim@example.org', password: `guess-${i}` }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });

  it('a failed login does not say whether the email exists', async () => {
    authState.signInError = { message: 'Invalid login credentials' };
    const res = await loginPOST(jsonReq('/api/auth/login', { email: 'nobody@example.org', password: 'whatever-123' }));
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(JSON.stringify(data)).not.toMatch(/not found|no user|does not exist/i);
  });

  it('admin machine key comparison is constant-time', () => {
    const src = readFileSync(path.join(APP_ROOT, 'src/lib/admin/adminAuth.ts'), 'utf8');
    expect(src).toMatch(/timingSafeEqual|safeCompareKeys/);
    expect(src).not.toMatch(/apiKeyHeader\s*===\s*serverApiKey/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A08:2025 Software or Data Integrity Failures', () => {
  it('the Stripe webhook verifies the signature before trusting the event', () => {
    const src = read('supabase/functions/stripe-webhook/index.ts');
    expect(src).toContain('stripe-signature');
    expect(src).toMatch(/constructEvent(Async)?\(\s*rawBody,\s*signature,\s*endpointSecret/);
    expect(src).toMatch(/status:\s*400/);
  });

  it('JSON bodies cannot pollute Object.prototype', async () => {
    const res = await registerPOST(
      jsonReq('/api/auth/register', '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"polluted":1}}}')
    );
    expect(res.status).toBe(400);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('server-controlled claims come from the signed JWT, not request data', () => {
    const fn = functionStatements(SCHEMA_CODE).filter((f) => f.name === 'public.check_email_verification').pop()?.text ?? '';
    expect(fn).toMatch(/auth\.uid\(\)/);
    expect(fn).not.toMatch(/raw_user_meta_data/); // user-editable metadata is never trusted
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A09:2025 Security Logging and Alerting Failures', () => {
  it('server errors are logged, without the password', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authState.signUpImpl = () => {
      throw new Error('db exploded');
    };
    await registerPOST(jsonReq('/api/auth/register', validSignup({ password: 'Sup3r-Secret-Pass' })));
    expect(errSpy).toHaveBeenCalled();
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('Sup3r-Secret-Pass');
  });

  it('every admin mutation route writes an audit log entry', () => {
    const adminRoutes = SRC_FILES.filter((f) => rel(f).startsWith('src/app/api/admin/') && f.endsWith('route.ts'));
    const mutating = adminRoutes.filter((f) => /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)/.test(srcText(f)));
    expect(mutating.length).toBeGreaterThan(3);
    expect(mutating.filter((f) => !srcText(f).includes('logAdminAction(')).map(rel)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('A10:2025 Mishandling of Exceptional Conditions', () => {
  const INTERNAL = 'connection to 10.0.0.12:5432 refused (pg_hba.conf)';

  it('register 500s return a generic message, never internal details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authState.signUpImpl = () => {
      throw new Error(INTERNAL);
    };
    const res = await registerPOST(jsonReq('/api/auth/register', validSignup()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.12');
  });

  it('login 500s return a generic message, never internal details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubClient.auth.signInWithPassword.mockImplementationOnce(() => {
      throw new Error(INTERNAL);
    });
    const res = await loginPOST(jsonReq('/api/auth/login', { email: 'a@example.org', password: 'whatever-123' }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.12');
  });

  it('guest identity falls back without echoing the internal error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(guestIdentityLib, 'generateIpTag').mockImplementationOnce(() => {
      throw new Error(INTERNAL);
    });
    const res = await guestIdentityGET(jsonReq('/api/auth/guest-identity', null, {}, 'GET'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.12');
  });

  it('malformed JSON is a 400, not a crash', async () => {
    const res = await registerPOST(jsonReq('/api/auth/register', '{"email": "a@b.co", '));
    expect(res.status).toBe(400);
  });

  it('admin access fails closed when the service key is missing', async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    try {
      const { verifyAdminRequest } = await import('../../src/lib/admin/adminAuth');
      const result = await verifyAdminRequest(
        jsonReq('/api/admin/users', null, { 'x-admin-api-key': process.env.ADMIN_SECRET_KEY as string }, 'GET')
      );
      expect(result.ok).toBe(false);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });
});
