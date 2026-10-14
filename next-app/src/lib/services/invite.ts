export class InviteLinkService {
  /**
   * Safely extracts an invite or room code from:
   * 1. Query parameters: ?space=xyz or ?invite=xyz or ?code=xyz
   * 2. Hash fragment: #/?space=xyz or #/space/xyz or #/join/xyz
   * 3. Path segments: /space/xyz or /join/xyz
   * 4. Plain alphanumeric space code input: e.g. "main-hq" or "ABC123"
   *
   * If the input is a URL or web address that does not contain a space code, returns null.
   */
  static extractCode(raw: string): string | null {
    const text = raw.trim();
    if (!text) return null;

    const isUrlLike =
      text.startsWith('http://') ||
      text.startsWith('https://') ||
      text.startsWith('/') ||
      text.includes('://') ||
      text.includes('localhost') ||
      text.includes('.vercel.app');

    if (isUrlLike) {
      try {
        const url = new URL(text.startsWith('http') ? text : `https://${text.replace(/^\/+/, '')}`);

        // 1. Direct query parameters
        const fromParam =
          url.searchParams.get('space') ||
          url.searchParams.get('invite') ||
          url.searchParams.get('code');
        if (fromParam && fromParam.trim()) {
          return fromParam.trim();
        }

        // 2. Hash fragment query params and path segments
        if (url.hash) {
          const hashStr = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
          if (hashStr.includes('?')) {
            const search = new URLSearchParams(hashStr.split('?')[1]);
            const p = search.get('space') || search.get('invite') || search.get('code');
            if (p && p.trim()) return p.trim();
          }
          const segments = hashStr.split('/').filter(Boolean);
          if (segments.length >= 2 && (segments[0] === 'space' || segments[0] === 'join')) {
            return segments[1].trim();
          }
        }

        // 3. Direct path segments
        const pathSegments = url.pathname.split('/').filter(Boolean);
        if (pathSegments.length >= 2 && (pathSegments[0] === 'space' || pathSegments[0] === 'join')) {
          return pathSegments[1].trim();
        }
      } catch (_) {}

      // If it's a URL but has no space code, return null
      return null;
    }

    // If it's a plain string space code without slashes or URL protocol
    if (!text.includes('/') && !text.includes('?') && !text.includes('&')) {
      return text;
    }

    return null;
  }

  static generateInviteUrl(spaceCode: string): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/space/${spaceCode}`;
    }
    return `https://teemchat.vercel.app/space/${spaceCode}`;
  }
}
