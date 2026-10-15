/**
 * Anti-Bot & Email Security Utilities
 * Protects against disposable emails, alias-spamming, and automated form submissions.
 */

// Comprehensive set of high-frequency burner, temporary, and disposable email domains
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'airmail.news',
  'anonaddy.me',
  'binkmail.com',
  'bobmail.info',
  'burnermail.io',
  'chacuo.net',
  'crazymailing.com',
  'dayrep.com',
  'discard.email',
  'discardmail.com',
  'disposable.com',
  'disposablemail.com',
  'dispostable.com',
  'drdrb.net',
  'emailondeck.com',
  'emailtemporanea.net',
  'fakeinbox.com',
  'fakermail.com',
  'fakemailgenerator.com',
  'filzmail.com',
  'getairmail.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'incognitomail.org',
  'inboxkitten.com',
  'jetable.org',
  'jourrapide.com',
  'kasmail.com',
  'maildrop.cc',
  'mailforspam.com',
  'mailinator.com',
  'mailinator.net',
  'mailinator2.com',
  'mailnesia.com',
  'mailnull.com',
  'mohmal.com',
  'mytemp.email',
  'nada.ltd',
  'noclickemail.com',
  'owlymail.com',
  'pokemail.net',
  'safetymail.info',
  'sharklasers.com',
  'spam4.me',
  'spambox.us',
  'spamevader.com',
  'spamex.com',
  'spamfree24.org',
  'spamgourmet.com',
  'spamhole.com',
  'spaml.com',
  'superrito.com',
  'suremail.info',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempail.com',
  'tempinbox.com',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.org',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'zoemail.org',
]);

/**
 * Checks whether an email address uses a known disposable or burner email domain.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase().trim();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Normalizes email address by:
 * - Trimming whitespace
 * - Converting to lowercase
 * - Stripping plus-addressing aliases (e.g. `john+bot123@gmail.com` -> `john@gmail.com`)
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0) return trimmed;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  // Strip sub-addressing (+tag)
  const cleanLocal = local.split('+')[0];
  return `${cleanLocal}@${domain}`;
}

/**
 * Validates username format and guards against spam/bot patterns.
 */
export function validateUsername(username: string): { valid: boolean; reason?: string } {
  if (!username || typeof username !== 'string') {
    return { valid: false, reason: 'Username is required.' };
  }
  const clean = username.trim();
  if (clean.length < 3) {
    return { valid: false, reason: 'Username must be at least 3 characters long.' };
  }
  if (clean.length > 24) {
    return { valid: false, reason: 'Username cannot exceed 24 characters.' };
  }
  // Alphanumeric with underscores and hyphens only
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(clean)) {
    return { valid: false, reason: 'Username may only contain letters, numbers, hyphens, and underscores.' };
  }
  return { valid: true };
}

/**
 * Validates that form submission was not instantaneous (sub-second),
 * which is an indicator of automated bot scripts.
 */
export function validateFormTiming(
  renderedAt: number | undefined | null,
  now = Date.now(),
  minDurationMs = 1200
): { valid: boolean; reason?: string } {
  if (!renderedAt || typeof renderedAt !== 'number' || isNaN(renderedAt)) {
    return { valid: false, reason: 'Form security timestamp is missing.' };
  }
  const elapsed = now - renderedAt;
  if (elapsed < minDurationMs) {
    return { valid: false, reason: 'Form submission was too fast. Please take your time.' };
  }
  // Also check if timestamp is absurdly in the future (skew attack)
  if (elapsed < -5000) {
    return { valid: false, reason: 'Invalid form submission timestamp.' };
  }
  return { valid: true };
}
