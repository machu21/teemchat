/**
 * Utility for generating deterministic, collision-resistant guest identity tags
 * based on client IP addresses and optional client-session seeds.
 */

export interface GuestIdentity {
  ipTag: string;
  username: string;
  displayName: string;
}

export function generateIpTag(ip: string, instanceSeed?: string): string {
  // Normalize loopback / local IPs
  const cleanIp = (!ip || ip === '::1' || ip === '127.0.0.1' || ip.includes('localhost')) ? '127.0.0.1' : ip.trim();
  
  // FNV-1a 32-bit hash
  let hash = 0x811c9dc5;
  const str = instanceSeed && instanceSeed.trim() ? `${cleanIp}:${instanceSeed.trim()}` : cleanIp;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  
  // Convert to 4-character uppercase hex (e.g. 7B4D)
  const hex = ((hash >>> 0) % 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return hex;
}

export function formatGuestHandles(ipTag: string): {
  username: string;
  displayName: string;
} {
  const cleanTag = (ipTag || 'GUEST').toUpperCase();
  return {
    username: `guest_${cleanTag.toLowerCase()}`,
    displayName: `Explorer #${cleanTag}`,
  };
}

export async function getOrFetchGuestIdentity(): Promise<GuestIdentity> {
  if (typeof window === 'undefined') {
    const fallbackTag = Math.floor(Math.random() * 9000 + 1000).toString(16).toUpperCase();
    return {
      ipTag: fallbackTag,
      ...formatGuestHandles(fallbackTag),
    };
  }

  try {
    const cached = sessionStorage.getItem('teem_guest_identity');
    if (cached) {
      const parsed = JSON.parse(cached) as GuestIdentity;
      if (parsed && parsed.username && parsed.displayName) {
        return parsed;
      }
    }

    let instance = sessionStorage.getItem('teem_instance_seed');
    if (!instance) {
      instance = Math.random().toString(36).substring(2, 6).toUpperCase();
      sessionStorage.setItem('teem_instance_seed', instance);
    }

    const res = await fetch(`/api/auth/guest-identity?instance=${encodeURIComponent(instance)}`);
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '60';
      console.warn(`Guest creation rate limit reached. Retry after ${retryAfter} seconds.`);
    }
    if (res.ok) {
      const data = await res.json();
      if (data && data.username && data.displayName) {
        const identity: GuestIdentity = {
          ipTag: data.ipTag,
          username: data.username,
          displayName: data.displayName,
        };
        sessionStorage.setItem('teem_guest_identity', JSON.stringify(identity));
        return identity;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch guest identity from server, using local fallback:', e);
  }

  // Fallback
  const fallbackTag = Math.floor(Math.random() * 9000 + 1000).toString(16).toUpperCase();
  const identity: GuestIdentity = {
    ipTag: fallbackTag,
    ...formatGuestHandles(fallbackTag),
  };
  return identity;
}
