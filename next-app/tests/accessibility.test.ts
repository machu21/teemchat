import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn(async () => ({ error: null }));
const maybeSingle = vi.fn(async () => ({
  data: { text_scale: '1.30', high_contrast: true, reduced_motion: false },
  error: null,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  },
}));

// Minimal DOM/storage stand-ins (vitest runs in the node environment)
const attrs = new Map<string, string>();
const store = new Map<string, string>();
let storageThrows = false;
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.document = {
  documentElement: {
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  },
};
g.localStorage = {
  getItem: (k: string) => {
    if (storageThrows) throw new Error('blocked');
    return store.get(k) ?? null;
  },
  setItem: (k: string, v: string) => {
    if (storageThrows) throw new Error('blocked');
    store.set(k, v);
  },
  removeItem: (k: string) => store.delete(k),
};

const { A11Y_STORAGE_KEY, DEFAULT_A11Y, sanitizeA11y, toTextScale, useAccessibilityStore } = await import(
  '../src/stores/accessibility'
);

const reset = () => {
  attrs.clear();
  store.clear();
  storageThrows = false;
  upsert.mockClear();
  useAccessibilityStore.setState({ ...DEFAULT_A11Y, hydrated: false });
};

afterAll(() => {
  delete g.window;
  delete g.document;
  delete g.localStorage;
});

describe('accessibility sanitizing', () => {
  it('snaps text scale to allowed values', () => {
    expect(toTextScale(1.15)).toBe(1.15);
    expect(toTextScale('1.30')).toBe(1.3);
    expect(toTextScale(2)).toBe(1);
    expect(toTextScale(NaN)).toBe(1);
    expect(toTextScale(undefined)).toBe(1);
  });

  it('falls back to defaults for junk', () => {
    expect(sanitizeA11y(null)).toEqual(DEFAULT_A11Y);
    expect(sanitizeA11y('x')).toEqual(DEFAULT_A11Y);
    expect(sanitizeA11y({ textScale: 9, highContrast: 'yes', reducedMotion: 1 })).toEqual(DEFAULT_A11Y);
  });
});

describe('accessibility store', () => {
  beforeEach(reset);

  it('setters update state, apply <html> attributes and persist', () => {
    const s = useAccessibilityStore.getState();
    s.setTextScale(1.3);
    s.setHighContrast(true);
    s.setReducedMotion(true);

    const now = useAccessibilityStore.getState();
    expect(now.textScale).toBe(1.3);
    expect(now.highContrast).toBe(true);
    expect(now.reducedMotion).toBe(true);
    expect(attrs.get('data-text-scale')).toBe('1.3');
    expect(attrs.get('data-contrast')).toBe('high');
    expect(attrs.get('data-reduced-motion')).toBe('true');
    expect(JSON.parse(store.get(A11Y_STORAGE_KEY)!)).toEqual({ textScale: 1.3, highContrast: true, reducedMotion: true });
  });

  it('turning settings off removes the attributes', () => {
    const s = useAccessibilityStore.getState();
    s.setTextScale(1.15);
    s.setHighContrast(true);
    s.setReducedMotion(true);
    s.reset();
    expect(attrs.has('data-text-scale')).toBe(false);
    expect(attrs.has('data-contrast')).toBe(false);
    expect(attrs.has('data-reduced-motion')).toBe(false);
    expect(useAccessibilityStore.getState().textScale).toBe(1);
  });

  it('hydrates saved prefs and applies them', () => {
    store.set(A11Y_STORAGE_KEY, JSON.stringify({ textScale: 1.15, highContrast: true, reducedMotion: false }));
    useAccessibilityStore.getState().hydrate();
    const s = useAccessibilityStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.textScale).toBe(1.15);
    expect(s.highContrast).toBe(true);
    expect(attrs.get('data-text-scale')).toBe('1.15');
    expect(attrs.get('data-contrast')).toBe('high');
  });

  it('falls back to defaults on corrupt storage', () => {
    store.set(A11Y_STORAGE_KEY, '{not json');
    useAccessibilityStore.getState().hydrate();
    const s = useAccessibilityStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.textScale).toBe(1);
    expect(s.highContrast).toBe(false);
    expect(s.reducedMotion).toBe(false);
  });

  it('survives blocked storage', () => {
    storageThrows = true;
    useAccessibilityStore.getState().hydrate();
    expect(useAccessibilityStore.getState().hydrated).toBe(true);
    expect(() => useAccessibilityStore.getState().setHighContrast(true)).not.toThrow();
    expect(attrs.get('data-contrast')).toBe('high');
  });

  it('only syncs to the server for real (UUID) user ids', async () => {
    const s = useAccessibilityStore.getState();
    await s.syncToServer('guest_abc');
    await s.syncToServer(null);
    expect(upsert).not.toHaveBeenCalled();
    s.setHighContrast(true);
    await useAccessibilityStore.getState().syncToServer('123e4567-e89b-12d3-a456-426614174000');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]).toBeDefined();
  });

  it('loads and sanitizes prefs from the server', async () => {
    await useAccessibilityStore.getState().loadFromServer('123e4567-e89b-12d3-a456-426614174000');
    const s = useAccessibilityStore.getState();
    expect(s.textScale).toBe(1.3);
    expect(s.highContrast).toBe(true);
    expect(attrs.get('data-contrast')).toBe('high');
  });
});
