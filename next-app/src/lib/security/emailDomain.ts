import { promises as dns } from 'node:dns';

const LOOKUP_TIMEOUT_MS = 3000;

/** DNS "this name has no such record / does not exist" codes. Anything else is inconclusive. */
const MISSING_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), LOOKUP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function isMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === 'string' && MISSING_CODES.has(code);
}

/**
 * Whether the email's domain can receive mail at all (catches typos such as
 * `gmial.com`). It cannot tell whether the mailbox exists or who owns it.
 *
 * Returns false only on a definite "no": the domain does not exist, publishes a
 * null MX (RFC 7505), or has neither MX nor A/AAAA records. DNS timeouts and
 * server errors return true so a flaky resolver never blocks sign-up.
 */
export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const at = email.lastIndexOf('@');
  const domain = at > 0 ? email.slice(at + 1).trim().toLowerCase() : '';
  if (!domain || !domain.includes('.')) return false;

  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length === 0) return false;
    // Null MX: a single record pointing at "." (Node reports it as an empty exchange).
    return !mx.every((r) => r.exchange === '' || r.exchange === '.');
  } catch (err) {
    if (!isMissing(err)) return true;
  }

  // No MX records: mail falls back to the domain's own address (RFC 5321 implicit MX).
  const fallback = await Promise.allSettled([
    withTimeout(dns.resolve4(domain)),
    withTimeout(dns.resolve6(domain)),
  ]);
  if (fallback.some((r) => r.status === 'fulfilled' && r.value.length > 0)) return true;
  return !fallback.every((r) => r.status === 'rejected' && isMissing(r.reason));
}
