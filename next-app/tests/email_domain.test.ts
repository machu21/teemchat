import { describe, it, expect, beforeEach, vi } from 'vitest';

const resolveMx = vi.fn();
const resolve4 = vi.fn();
const resolve6 = vi.fn();

vi.mock('node:dns', () => ({
  promises: {
    resolveMx: (d: string) => resolveMx(d),
    resolve4: (d: string) => resolve4(d),
    resolve6: (d: string) => resolve6(d),
  },
}));

import { emailDomainAcceptsMail } from '../src/lib/security/emailDomain';

const dnsError = (code: string) => Object.assign(new Error(code), { code });

describe('emailDomainAcceptsMail', () => {
  beforeEach(() => {
    resolveMx.mockReset();
    resolve4.mockReset().mockRejectedValue(dnsError('ENODATA'));
    resolve6.mockReset().mockRejectedValue(dnsError('ENODATA'));
  });

  it('accepts a domain with MX records', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mx.example.org', priority: 10 }]);
    await expect(emailDomainAcceptsMail('a@example.org')).resolves.toBe(true);
    expect(resolveMx).toHaveBeenCalledWith('example.org');
  });

  it('rejects a domain that does not exist', async () => {
    resolveMx.mockRejectedValue(dnsError('ENOTFOUND'));
    resolve4.mockRejectedValue(dnsError('ENOTFOUND'));
    resolve6.mockRejectedValue(dnsError('ENOTFOUND'));
    await expect(emailDomainAcceptsMail('a@gmial.con')).resolves.toBe(false);
  });

  it('rejects a null MX (domain that says it takes no mail)', async () => {
    resolveMx.mockResolvedValue([{ exchange: '', priority: 0 }]);
    await expect(emailDomainAcceptsMail('a@nomail.example')).resolves.toBe(false);
  });

  it('accepts a domain with no MX but an A record (implicit MX)', async () => {
    resolveMx.mockRejectedValue(dnsError('ENODATA'));
    resolve4.mockResolvedValue(['192.0.2.1']);
    await expect(emailDomainAcceptsMail('a@a-only.example')).resolves.toBe(true);
  });

  it('fails open when DNS is unreachable', async () => {
    resolveMx.mockRejectedValue(dnsError('ECONNREFUSED'));
    await expect(emailDomainAcceptsMail('a@example.org')).resolves.toBe(true);
  });

  it('rejects a malformed address without a dotted domain', async () => {
    await expect(emailDomainAcceptsMail('a@localhost')).resolves.toBe(false);
    expect(resolveMx).not.toHaveBeenCalled();
  });
});
