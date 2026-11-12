'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from '@/app/page.module.css';
import { useSessionStore } from '@/stores/session';
import { useThemeStore } from '@/stores/theme';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoCard } from '@/components/neo/NeoCard';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { ThemeToggle } from '@/components/neo/ThemeToggle';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { AndroidLogo, AppleLogo } from '@/components/icons/BrandLogos';
import {
  ZapIcon,
  HeartIcon,
  ArrowUpIcon,
  CheckIcon,
  XIcon,
  MenuIcon,
  LinkIcon,
  SparklesIcon,
  MapIcon,
  GemIcon,
  SmartphoneIcon,
  KeyIcon,
  LockIcon,
  CompassIcon,
  AudioWavesIcon,
  BotIcon,
  PaletteIcon,
  UserMaleIcon,
  UserFemaleIcon,
  FlameIcon,
} from '@/components/icons/LandingIcons';
import { InviteLinkService } from '@/lib/services/invite';
import { Gender, defaultMaleAvatarConfig, defaultFemaleAvatarConfig } from '@/lib/models/avatar';
import { getOrFetchGuestIdentity, GuestIdentity } from '@/lib/security/guestIdentity';
import { useRouter } from 'next/navigation';
import { useIsNativeApp } from '@/lib/platform/nativeApp';
import { LEGAL } from '@/lib/constants/legal';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { validateBirthDate } from '@/lib/safety/ageBand';
import { AppIcon } from '@/components/icons/AppIcon';

const TYPEWRITER_PHRASES = [
  'cozy 2D spaces.',
  'campfire circles.',
  'pixel retreat cabins.',
  'virtual world avenues.',
];

interface LandingPageClientProps {
  /** 'app' renders the compact native-app entry screen (login + guest only). */
  variant?: 'web' | 'app';
}

export function LandingPageClient({ variant = 'web' }: LandingPageClientProps = {}) {
  const router = useRouter();
  // Fallback for older APK builds without the UA token: detect Capacitor client-side.
  const isNativeClient = useIsNativeApp();
  const appMode = variant === 'app' || isNativeClient;
  const { session, isGuest, signInGuest, signInWithPassword, signUpWithPassword, initSession } =
    useSessionStore();
  const { theme, initTheme } = useThemeStore();
  const isDark = theme === 'dark';

  // ── Modals & Auth State ──
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authErrorCode, setAuthErrorCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Anti-Bot Defense State ──
  const [honeypot, setHoneypot] = useState('');
  const [formRenderedAt, setFormRenderedAt] = useState<number>(() => Date.now());

  // ── Mobile Menu & Action States ──
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedSafariLink, setCopiedSafariLink] = useState(false);

  // ── Guest & Character Setup State ──
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(null);
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [signUpGender, setSignUpGender] = useState<Gender>('male');
  const [signUpBirthDate, setSignUpBirthDate] = useState('');

  // ── Deep Link State ──
  const [pendingCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return InviteLinkService.extractCode(window.location.href);
  });

  // ── Typewriter Animated Headline ──
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Interactive Space Customizer State ──
  const [spaceName, setSpaceName] = useState('Teemchat HQ');
  const [selectedCategory, setSelectedCategory] = useState('Gaming');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [showSimulatedChat, setShowSimulatedChat] = useState(false);

  const categories = ['Gaming', 'Work', 'School', 'Other'];
  const colorPalettes = [
    { name: 'Coral', base: '#E76F51', stripe: '#C75D42' },
    { name: 'Teal', base: '#2A9D8F', stripe: '#218075' },
    { name: 'TeemPurple', base: '#7C3AED', stripe: '#6228C4' },
    { name: 'Amber', base: '#FAB936', stripe: '#E09A20' },
    { name: 'Emerald', base: '#10B981', stripe: '#059669' },
  ];

  // ── Pricing State ──
  const [isPricingAnnual, setIsPricingAnnual] = useState(true);

  useEffect(() => {
    initSession();
    initTheme();
    getOrFetchGuestIdentity()
      .then((ident) => setGuestIdentity(ident))
      .catch(() => {});

    // Deep link from the dashboard "Create a Free Account" button
    if (new URLSearchParams(window.location.search).get('signup') === '1') {
      queueMicrotask(() => {
        setIsSignUp(true);
        setAuthModalOpen(true);
      });
    }
  }, [initSession, initTheme]);

  useEffect(() => {
    if (session) {
      if (pendingCode) {
        router.push(`/space/${pendingCode}`);
      } else if (!isGuest || appMode) {
        // The native app has no landing page, so returning guests go straight in too.
        router.push('/dashboard');
      }
    }
  }, [session, isGuest, pendingCode, router, appMode]);

  // Typewriter loop
  useEffect(() => {
    const current = TYPEWRITER_PHRASES[phraseIdx];
    let timer: NodeJS.Timeout;

    if (!isDeleting && displayedText.length < current.length) {
      timer = setTimeout(() => {
        setDisplayedText(current.slice(0, displayedText.length + 1));
      }, 70);
    } else if (!isDeleting && displayedText.length === current.length) {
      timer = setTimeout(() => setIsDeleting(true), 2000);
    } else if (isDeleting && displayedText.length > 0) {
      timer = setTimeout(() => {
        setDisplayedText(current.slice(0, displayedText.length - 1));
      }, 35);
    } else if (isDeleting && displayedText.length === 0) {
      timer = setTimeout(() => {
        setIsDeleting(false);
        setPhraseIdx((prev) => (prev + 1) % 4);
      }, 300);
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, phraseIdx]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openGuestModal = async (defaultName?: string) => {
    let identity = guestIdentity;
    if (!identity) {
      try {
        identity = await getOrFetchGuestIdentity();
        setGuestIdentity(identity);
      } catch {}
    }
    const name = defaultName !== undefined
      ? defaultName
      : (spaceName.trim() && spaceName !== 'Teemchat HQ'
          ? `${spaceName.trim()} Explorer`
          : (identity?.displayName || 'Explorer'));
    setGuestName(name);
    setCharacterModalOpen(true);
  };

  const handleConfirmGuest = async () => {
    setIsSubmitting(true);
    try {
      const chosenName = guestName.trim() || guestIdentity?.displayName || 'Explorer';
      await signInGuest(chosenName, guestGender, guestIdentity?.username);
      setCharacterModalOpen(false);
      const target = pendingCode ? `/space/${pendingCode}` : '/dashboard';
      router.push(target);
    } catch (err) {
      console.error('Guest entry error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthErrorCode('');
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        if (!username || !displayName) {
          setAuthError('Please fill in all fields.');
          return;
        }
        const birthDateError = validateBirthDate(signUpBirthDate);
        if (birthDateError) {
          setAuthError(birthDateError);
          return;
        }
        const res = await signUpWithPassword(
          email,
          password,
          username,
          displayName,
          signUpGender,
          {
            website_url: honeypot,
            renderedAt: formRenderedAt,
          },
          signUpBirthDate
        );
        if (res.error) {
          setAuthError(res.error);
          setAuthErrorCode(res.code || '');
          if (res.code === 'email_unconfirmed') {
            // Account exists now; the next step is logging in after confirming the email
            setIsSignUp(false);
            setPassword('');
          }
        } else {
          setAuthModalOpen(false);
          router.push('/dashboard');
        }
      } else {
        const res = await signInWithPassword(email, password);
        if (res.error) {
          setAuthError(res.error);
        } else {
          setAuthModalOpen(false);
          router.push('/dashboard');
        }
      }
    } catch {
      setAuthError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySafariLink = async () => {
    try {
      if (typeof window !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.origin);
        setCopiedSafariLink(true);
        setTimeout(() => setCopiedSafariLink(false), 2500);
      }
    } catch {
      // Ignore copy error
    }
  };

  const getInitials = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 'TC';
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  };

  const selectedPalette = colorPalettes[selectedColorIndex];
  const initials = getInitials(spaceName);

  const modals = (
    <>
        {/* ── Auth Modal ── */}
        <NeoModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          title={isSignUp ? 'Create your Account' : 'Welcome Back'}
        >
          <div className={styles.authTogglePill}>
            <button
              type="button"
              className={`${styles.authTab} ${!isSignUp ? styles.authTabActive : ''}`}
              onClick={() => {
                setIsSignUp(false);
                setAuthError('');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`${styles.authTab} ${isSignUp ? styles.authTabActive : ''}`}
              onClick={() => {
                setIsSignUp(true);
                setAuthError('');
                setFormRenderedAt(Date.now());
                setHoneypot('');
              }}
            >
              Create Account
            </button>
          </div>

          <GoogleAuthButton
            label={isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
            disabled={isSubmitting}
          />

          <form onSubmit={handleAuthSubmit} className={styles.authForm}>
            {/* Anti-Bot Honeypot: Invisible to human users, traps automated form fillers */}
            <div
              style={{
                position: 'absolute',
                left: '-9999px',
                top: '-9999px',
                opacity: 0,
                height: 0,
                width: 0,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
              aria-hidden="true"
            >
              <label htmlFor="company_site_field">Do not fill this</label>
              <input
                id="company_site_field"
                type="text"
                name="company_site_field"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {authError && (
              <div className={styles.errorAlert} role="alert">
                {authError}
                {isSignUp && authErrorCode === 'email_taken' && (
                  <button
                    type="button"
                    className={styles.errorAlertAction}
                    onClick={() => {
                      // Keep the typed email so the user can log in straight away
                      setIsSignUp(false);
                      setAuthError('');
                      setAuthErrorCode('');
                      setPassword('');
                    }}
                  >
                    Log in instead
                  </button>
                )}
              </div>
            )}

            {isSignUp && (
              <>
                <NeoInput
                  label="DISPLAY NAME"
                  placeholder="Alex Rivera"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
                <NeoInput
                  label="USERNAME"
                  placeholder="alex_rivera"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <NeoInput
                  label="DATE OF BIRTH"
                  id="signup-birth-date"
                  type="date"
                  value={signUpBirthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSignUpBirthDate(e.target.value)}
                  aria-describedby="signup-birth-date-hint"
                  required
                />
                <div id="signup-birth-date-hint" className={styles.birthDateHint}>
                  Kept private. Under-13 accounts get Family Mode automatically.
                </div>
                <div className={styles.genderSection}>
                  <div className={styles.genderLabel}>SELECT GENDER</div>
                  <div className={styles.genderRow}>
                    <button
                      type="button"
                      className={`${styles.genderCard} ${signUpGender === 'male' ? styles.genderCardMaleActive : ''}`}
                      onClick={() => setSignUpGender('male')}
                    >
                      <UserMaleIcon size={18} />
                      <span>Male</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.genderCard} ${signUpGender === 'female' ? styles.genderCardFemaleActive : ''}`}
                      onClick={() => setSignUpGender('female')}
                    >
                      <UserFemaleIcon size={18} />
                      <span>Female</span>
                    </button>
                  </div>
                </div>
                <div className={styles.signUpAvatarPreviewRow}>
                  <PixelAvatar
                    config={signUpGender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig}
                    size={42}
                  />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                      {signUpGender === 'female' ? 'Female Persona' : 'Male Persona'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Retro pixel avatar with tailored outfit &amp; styling
                    </div>
                  </div>
                </div>
              </>
            )}

            <NeoInput
              label="EMAIL ADDRESS"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <NeoInput
              label="PASSWORD"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <NeoButton type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting
                ? 'Processing...'
                : isSignUp
                  ? 'Create Persona & Enter'
                  : 'Sign In & Enter'}
            </NeoButton>

            <button
              type="button"
              className={styles.guestSkipLink}
              onClick={() => {
                setAuthModalOpen(false);
                openGuestModal();
              }}
            >
              Skip for now &amp; enter as Guest <AppIcon name="arrowRight" />
            </button>
          </form>
        </NeoModal>

        {/* ── Guest Character Selection Modal ── */}
        <NeoModal
          isOpen={characterModalOpen}
          onClose={() => setCharacterModalOpen(false)}
          title="Choose Your Character"
        >
          <div className={styles.characterModalContent}>
            <div className={styles.avatarPedestalCard}>
              <div className={styles.pedestalStage}>
                <PixelAvatar
                  config={guestGender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig}
                  size={72}
                />
              </div>
              <div className={styles.pedestalName}>{guestName.trim() || guestIdentity?.displayName || 'Explorer'}</div>
              {guestIdentity?.username && (
                <div className={styles.pedestalHandle}>@{guestIdentity.username}</div>
              )}
              <div className={styles.pedestalMeta}>
                {guestGender === 'female' ? 'Female Persona' : 'Male Persona'}
              </div>
            </div>

            <NeoInput
              label="EXPLORER NAME"
              placeholder={guestIdentity?.displayName || "Explorer"}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
            />

            <div className={styles.genderSection}>
              <div className={styles.genderLabel}>SELECT GENDER</div>
              <div className={styles.genderRow}>
                <button
                  type="button"
                  className={`${styles.genderCard} ${guestGender === 'male' ? styles.genderCardMaleActive : ''}`}
                  onClick={() => setGuestGender('male')}
                >
                  <UserMaleIcon size={18} />
                  <span>Male</span>
                </button>
                <button
                  type="button"
                  className={`${styles.genderCard} ${guestGender === 'female' ? styles.genderCardFemaleActive : ''}`}
                  onClick={() => setGuestGender('female')}
                >
                  <UserFemaleIcon size={18} />
                  <span>Female</span>
                </button>
              </div>
            </div>

            <NeoButton
              variant="primary"
              size="lg"
              onClick={handleConfirmGuest}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                'Entering World...'
              ) : (
                <>
                  <ZapIcon size={18} style={{ marginRight: 6 }} /> Enter Virtual World
                </>
              )}
            </NeoButton>
          </div>
        </NeoModal>
    </>
  );

  // ── Native App Entry Screen (APK / iOS): login + guest entry only ──
  if (appMode) {
    return (
      <div className={styles.appEntry}>
        <div className={styles.appEntryTop}>
          <ThemeToggle />
        </div>

        <main className={styles.appEntryMain}>
          <div className={styles.appEntryLogo}>
            <Image
              src={isDark ? '/images/teamchat_logo_dark.jpg' : '/images/teamchat_logo.jpg'}
              alt="TeemChat Logo"
              width={96}
              height={96}
              className={styles.logoImg}
              priority
            />
          </div>
          <h1 className={styles.appEntryTitle}>
            teemchat<span className={styles.logoDot}>.</span>
          </h1>
          <p className={styles.appEntryTagline}>Hang out in cozy 2D pixel spaces.</p>

          {pendingCode && (
            <div className={styles.appEntryInvite}>
              <LinkIcon size={16} />
              <span>
                Invited to <strong>{pendingCode}</strong>
              </span>
            </div>
          )}

          <div className={styles.appEntryActions}>
            <NeoButton
              variant="primary"
              size="lg"
              onClick={() => {
                setIsSignUp(false);
                setAuthError('');
                setAuthModalOpen(true);
              }}
            >
              <KeyIcon size={18} style={{ marginRight: 8 }} /> Log in
            </NeoButton>
            <NeoButton
              variant="secondary"
              size="lg"
              onClick={() => {
                setIsSignUp(true);
                setAuthError('');
                setFormRenderedAt(Date.now());
                setHoneypot('');
                setAuthModalOpen(true);
              }}
            >
              <SparklesIcon size={18} style={{ marginRight: 8 }} /> Create Account
            </NeoButton>
            <button
              type="button"
              className={styles.guestSkipLink}
              onClick={() => openGuestModal()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Entering...' : 'Continue as Guest'}
            </button>
          </div>
        </main>

        {modals}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Pending Invite Banner ── */}
      {pendingCode && (
        <div className={styles.inviteBanner}>
          <div className={styles.inviteBannerContent}>
            <LinkIcon size={16} />
            <span>
              You were invited to space: <strong>{pendingCode}</strong>! Hop right in to explore.
            </span>
          </div>
          <NeoButton
            size="sm"
            variant="secondary"
            onClick={() => {
              if (session) {
                router.push(`/space/${pendingCode}`);
              } else {
                openGuestModal();
              }
            }}
            disabled={isSubmitting}
          >
            <ZapIcon size={14} style={{ marginRight: 6 }} /> {session ? 'Join Space' : 'Enter as Guest'}
          </NeoButton>
        </div>
      )}

      {/* ── Top Navigation Bar ── */}
      <header className={styles.navbar}>
        <div className={styles.logo} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className={styles.logoCircle}>
            <Image
              src={isDark ? '/images/teamchat_logo_dark.jpg' : '/images/teamchat_logo.jpg'}
              alt="TeemChat Logo"
              width={40}
              height={40}
              className={styles.logoImg}
            />
          </div>
          <span className={styles.logoText}>
            teemchat<span className={styles.logoDot}>.</span>
          </span>
          <span className={styles.betaBadge}>BETA</span>
        </div>

        {/* Center Nav Links */}
        <nav className={styles.navLinks}>
          <a className={`${styles.navLink} ${styles.navLinkBold}`} role="button" tabIndex={0} onClick={() => scrollTo('try-it')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo('try-it'); } }}>
            Try it
          </a>
          <a className={styles.navLink} role="button" tabIndex={0} onClick={() => scrollTo('how-it-works')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo('how-it-works'); } }}>
            How it works
          </a>
          <a className={styles.navLink} role="button" tabIndex={0} onClick={() => scrollTo('features')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo('features'); } }}>
            Features
          </a>
          <a className={styles.navLink} role="button" tabIndex={0} onClick={() => scrollTo('pricing')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo('pricing'); } }}>
            Pricing
          </a>
          <a className={styles.navLink} role="button" tabIndex={0} onClick={() => scrollTo('download')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo('download'); } }}>
            Download
          </a>
        </nav>

        {/* Right Actions */}
        <div className={styles.navActions}>
          <ThemeToggle />
          <NeoButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsSignUp(false);
              setAuthModalOpen(true);
            }}
          >
            Log in
          </NeoButton>
          <NeoButton
            className={styles.navGuestBtn}
            variant="primary"
            size="sm"
            onClick={() => openGuestModal()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Entering...' : 'Enter as Guest'}
          </NeoButton>
          <button
            type="button"
            className={styles.hamburgerBtn}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Navigation Drawer ── */}
      {mobileMenuOpen && (
        <div className={styles.mobileMenuDrawer}>
          <nav className={styles.mobileNavLinks}>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('try-it');
                setMobileMenuOpen(false);
              }}
            >
              <SparklesIcon size={18} style={{ marginRight: 8 }} /> Try It Out
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('how-it-works');
                setMobileMenuOpen(false);
              }}
            >
              <MapIcon size={18} style={{ marginRight: 8 }} /> How It Works
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('features');
                setMobileMenuOpen(false);
              }}
            >
              <ZapIcon size={18} style={{ marginRight: 8 }} /> Features
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('pricing');
                setMobileMenuOpen(false);
              }}
            >
              <GemIcon size={18} style={{ marginRight: 8 }} /> Pricing
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('download');
                setMobileMenuOpen(false);
              }}
            >
              <SmartphoneIcon size={18} style={{ marginRight: 8 }} /> Download Apps
            </button>
          </nav>
          <div className={styles.mobileMenuActions}>
            <NeoButton
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => {
                setMobileMenuOpen(false);
                setIsSignUp(false);
                setAuthModalOpen(true);
              }}
            >
              <KeyIcon size={16} style={{ marginRight: 6 }} /> Log In / Sign Up
            </NeoButton>
            <NeoButton
              variant="primary"
              size="md"
              fullWidth
              onClick={() => {
                setMobileMenuOpen(false);
                openGuestModal();
              }}
              disabled={isSubmitting}
            >
              <ZapIcon size={16} style={{ marginRight: 6 }} /> Enter as Guest
            </NeoButton>
          </div>
        </div>
      )}

      {/* ── Main Container ── */}
      <main className={styles.mainContainer}>
        {/* Section 1: Hero Split Section (Side-by-Side Reference Design) */}
        <section className={styles.heroSplitSection} id="try-it">
          {/* Left Column: Heading, Subtitle, Pill Buttons */}
          <div className={styles.heroLeft}>
            <h1 className={styles.heroTitle}>
              Hang out together in
              <span className={styles.heroAccent}>
                {displayedText}
                <span className={styles.cursor}>|</span>
              </span>
            </h1>

            <p className={styles.heroSubtext}>
              Group chat, voice huts and buddy chat for your teemchat, team or class. One cozy place
              to hang out.
            </p>

            <div className={styles.heroButtons}>
              <button
                type="button"
                className={styles.btnGetStarted}
                onClick={() => openGuestModal()}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Entering...' : 'Get Started'}
              </button>
              <button
                type="button"
                className={styles.btnLogIn}
                onClick={() => {
                  setIsSignUp(false);
                  setAuthModalOpen(true);
                }}
              >
                Log In
              </button>
            </div>

            <div className={styles.heroTrustRow}>
              <span className={styles.heroTrustItem}>
                <ZapIcon size={14} color="#10B981" /> Instant guest pass
              </span>
              <span className={styles.heroTrustDot}>•</span>
              <span className={styles.heroTrustItem}>
                <LockIcon size={14} color="#8B5CF6" /> Zero setup required
              </span>
              <span className={styles.heroTrustDot}>•</span>
              <span className={styles.heroTrustItem}>
                <SmartphoneIcon size={14} color="#F59E0B" /> Web &amp; Mobile ready
              </span>
            </div>
          </div>

          {/* Right Column: Customizer Card */}
          <div className={styles.heroRight}>
            <div className={styles.customizerCard}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.cardKicker}>TRY IT, NO ACCOUNT NEEDED</div>
                  <div className={styles.cardTitle}>Start a space</div>
                </div>
                <div className={styles.mascotBadge}>
                  <div className={styles.sparkleOne}>
                    <SparklesIcon size={14} color="#FAB936" />
                  </div>
                  <div className={styles.sparkleTwo}>
                    <SparklesIcon size={12} color="#FAB936" />
                  </div>
                  <div className={styles.mascotCircle}>
                    <Image
                      src={isDark ? '/images/teamchat_logo_dark.jpg' : '/images/teamchat_logo.jpg'}
                      alt="TeemChat Cat Mascot"
                      width={44}
                      height={44}
                      className={styles.mascotImg}
                    />
                  </div>
                </div>
              </div>

              {!showSimulatedChat ? (
                <div className={styles.cardGrid}>
                  {/* Left Form Sub-column */}
                  <div className={styles.formCol}>
                    <div>
                      <div className={styles.fieldLabel}>NAME IT</div>
                      <input
                        type="text"
                        className={styles.pillInput}
                        placeholder="Teemchat HQ"
                        value={spaceName}
                        onChange={(e) => setSpaceName(e.target.value)}
                        maxLength={30}
                      />
                    </div>

                    <div>
                      <div className={styles.fieldLabel}>WHAT&apos;S IT FOR?</div>
                      <div className={styles.categoryPills}>
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={`${styles.catPill} ${selectedCategory === cat ? styles.catPillActive : ''
                              }`}
                            onClick={() => setSelectedCategory(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className={styles.fieldLabel}>PICK A COLOUR</div>
                      <div className={styles.swatchesRow}>
                        {colorPalettes.map((item, idx) => (
                          <button
                            key={item.name}
                            type="button"
                            className={`${styles.swatchCircle} ${selectedColorIndex === idx ? styles.swatchCircleActive : ''
                              }`}
                            style={{
                              backgroundColor: item.base,
                              backgroundImage: `repeating-linear-gradient(-45deg, rgba(0,0,0,0.18), rgba(0,0,0,0.18) 3px, transparent 3px, transparent 6px)`,
                            }}
                            onClick={() => setSelectedColorIndex(idx)}
                            aria-label={item.name}
                            aria-pressed={selectedColorIndex === idx}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Preview Sub-column */}
                  <div className={styles.previewCol}>
                    <div
                      className={styles.previewCard}
                      onClick={() => setShowSimulatedChat(true)}
                      title="Click to preview chat"
                    >
                      <div
                        className={styles.previewHeader}
                        style={{ backgroundColor: selectedPalette.base }}
                      >
                        <div className={styles.avatarInitials}>{initials}</div>
                      </div>
                      <div className={styles.previewContent}>
                        <div className={styles.previewName}>
                          {spaceName.trim() || 'Teemchat HQ'}
                        </div>
                        <div className={styles.previewMeta}>1 member • No one in voice</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={styles.openSpaceBtn}
                      onClick={() => openGuestModal(spaceName.trim() ? `${spaceName.trim()} Explorer` : 'Explorer')}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Entering...' : 'Open my space'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.simulatedChatBox}>
                  <div
                    className={styles.stripedHeader}
                    style={{ backgroundColor: selectedPalette.base }}
                  >
                    <div className={styles.previewInitialsCircle}>{initials}</div>
                  </div>

                  <div style={{ padding: '24px 16px 16px 16px' }}>
                    <div className={styles.chatChannelHeader}>
                      <span>#</span>
                      <span>general</span>
                    </div>

                    <div className={styles.chatMessageRow}>
                      <div className={styles.chatAvatar}>
                        <Image
                          src={isDark ? '/images/teamchat_logo_dark.jpg' : '/images/teamchat_logo.jpg'}
                          alt="Cat"
                          width={32}
                          height={32}
                        />
                      </div>
                      <div className={styles.chatBubble}>
                        Hello there! I&apos;m TeemChat Cat. Say hi to everyone in {spaceName.trim() || 'Teemchat HQ'}.
                      </div>
                    </div>

                    <div className={styles.chatMessageRow} style={{ justifyContent: 'flex-end' }}>
                      <div className={styles.chatBubbleUser} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>Hey TeemChat Cat! Love this cozy world</span>
                        <FlameIcon size={14} color="#F97316" />
                      </div>
                    </div>

                    <div className={styles.chatMessageRow}>
                      <div className={styles.chatAvatar}>
                        <Image
                          src={isDark ? '/images/teamchat_logo_dark.jpg' : '/images/teamchat_logo.jpg'}
                          alt="Cat"
                          width={32}
                          height={32}
                        />
                      </div>
                      <div className={styles.chatBubble}>
                        Nice one! Everyone in {spaceName.trim() || 'Teemchat HQ'} can join proximity voice in 1 click.
                      </div>
                    </div>

                    <div className={styles.chatConfirmation}>
                      <div className={styles.chatConfirmationText}>
                        <strong>{spaceName.trim() || 'Teemchat HQ'}</strong> is ready. In the real
                        world you also get proximity voice huts, invite links, and custom retro avatars.
                      </div>
                      <div className={styles.simulatedChatButtons}>
                        <NeoButton
                          variant="primary"
                          size="md"
                          onClick={() => {
                            setIsSignUp(true);
                            setAuthModalOpen(true);
                          }}
                        >
                          Create your account
                        </NeoButton>
                        <NeoButton
                          variant="secondary"
                          size="md"
                          onClick={() => setShowSimulatedChat(false)}
                        >
                          Start over
                        </NeoButton>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: How It Works */}
        <section className={styles.sectionWrapper} id="how-it-works">
          <div className={`${styles.sectionKicker} ${styles.kickerSteps}`}>
            THREE STEPS
          </div>
          <h2 className={styles.sectionTitle}>From zero to hangout in a minute.</h2>

          <div className={styles.threeStepsGrid}>
            <NeoCard inner>
              <div className={styles.stepNumber} style={{ color: '#F59E0B' }}>
                1
              </div>
              <div className={styles.stepTitle}>Make your space</div>
              <div className={styles.stepDesc}>
                Name it, pick an avatar look, and create cozy rooms for chat, huts for voice.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.stepNumber} style={{ color: '#EA580C' }}>
                2
              </div>
              <div className={styles.stepTitle}>Send the invite link</div>
              <div className={styles.stepDesc}>
                Share a link or code. Friends join in a tap, zero setup on their side.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.stepNumber} style={{ color: '#38BDF8' }}>
                3
              </div>
              <div className={styles.stepTitle}>Hang out</div>
              <div className={styles.stepDesc}>
                Walk up to friends to talk via spatial audio, type in chat, or gather by the campfire.
              </div>
            </NeoCard>
          </div>
        </section>

        {/* Section 3: Features */}
        <section className={styles.sectionWrapper} id="features">
          <div className={`${styles.sectionKicker} ${styles.kickerFeatures}`}>
            BUILT FOR CONNECTION
          </div>
          <h2 className={styles.sectionTitle}>Everything your crew needs.</h2>

          <div className={styles.featuresGrid}>
            <NeoCard inner>
              <div className={styles.featIconBox}>
                <CompassIcon size={24} color="var(--primary)" />
              </div>
              <div className={styles.stepTitle}>Rooms that keep up</div>
              <div className={styles.stepDesc}>
                Ephemeral 30-second disappearing chat bubbles that keep conversations fresh and natural.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.featIconBox}>
                <AudioWavesIcon size={24} color="#2A9D8F" />
              </div>
              <div className={styles.stepTitle}>Voice huts & Proximity</div>
              <div className={styles.stepDesc}>
                High-bitrate LiveKit spatial WebRTC audio. Walk near players to hear them; walk away to fade.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.featIconBox}>
                <BotIcon size={24} color="#E76F51" />
              </div>
              <div className={styles.stepTitle}>Buddy chat & AI RAG</div>
              <div className={styles.stepDesc}>
                Your personal AI Companion travels with you, learns from your talks, and remembers past facts.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.featIconBox}>
                <PaletteIcon size={24} color="#FAB936" />
              </div>
              <div className={styles.stepTitle}>Yours to run</div>
              <div className={styles.stepDesc}>
                Interactive build mode, furniture placement, campfire roasting, and one-tap invite sharing.
              </div>
            </NeoCard>
          </div>
        </section>

        {/* Section 4: Plans & Pricing */}
        <section className={styles.sectionWrapper} id="pricing">
          <div className={`${styles.sectionKicker} ${styles.kickerPricing}`}>
            PLANS & PRICING
          </div>
          <h2 className={styles.sectionTitle}>Simple, transparent pricing.</h2>
          <p className={styles.heroSubtext} style={{ marginBottom: '20px' }}>
            Free during the beta. Add the AI Companion whenever you want it.
          </p>

          <div className={styles.billingToggle}>
            <button
              type="button"
              className={`${styles.billingBtn} ${!isPricingAnnual ? styles.billingBtnActive : ''}`}
              onClick={() => setIsPricingAnnual(false)}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`${styles.billingBtn} ${isPricingAnnual ? styles.billingBtnActive : ''}`}
              onClick={() => setIsPricingAnnual(true)}
            >
              <span>Yearly</span>
              <span className={styles.saveTag}>SAVE 25%</span>
            </button>
          </div>

          <div className={styles.pricingGrid}>
            {/* Free Tier */}
            <div className={styles.pricingCard}>
              <NeoBadge
                color={isDark ? '#064E3B' : '#D1FAE5'}
                textColor={isDark ? '#34D399' : '#065F46'}
              >
                FREE TIER
              </NeoBadge>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '10px' }}>Guest Pass</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Join spaces instantly as a guest without an account.
              </p>

              <div className={styles.priceDisplay}>
                <span>$0</span>
                <span className={styles.pricePeriod}>forever</span>
              </div>

              <ul className={styles.featureList}>
                <li><CheckIcon size={16} color="#10B981" /> Join any space instantly as Guest</li>
                <li><CheckIcon size={16} color="#10B981" /> No account registration needed</li>
                <li><CheckIcon size={16} color="#10B981" /> 2D Virtual world &amp; river swimming</li>
                <li><CheckIcon size={16} color="#10B981" /> Proximity spatial voice audio</li>
                <li><CheckIcon size={16} color="#10B981" /> In-world messaging &amp; campfire chat</li>
                <li style={{ opacity: 0.5 }}><XIcon size={16} color="#EF4444" /> No AI companion persona</li>
                <li style={{ opacity: 0.5 }}><XIcon size={16} color="#EF4444" /> No persistent account or space saves</li>
              </ul>

              <NeoButton
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => openGuestModal()}
                disabled={isSubmitting}
              >
                Join as Guest
              </NeoButton>
            </div>

            {/* Member Tier: free during the beta */}
            <div className={styles.pricingCard}>
              <NeoBadge
                color={isDark ? '#312E81' : '#EDE9FE'}
                textColor={isDark ? '#C4B5FD' : '#5B21B6'}
              >
                MEMBER • FREE DURING BETA
              </NeoBadge>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '10px' }}>Member</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                A full account that keeps your avatar, friends and worlds.
              </p>

              <div className={styles.priceDisplay}>
                <span>$0</span>
                <span className={styles.pricePeriod}>during beta</span>
              </div>

              <ul className={styles.featureList}>
                <li><CheckIcon size={16} color="#10B981" /> Full registered account &amp; profile</li>
                <li><CheckIcon size={16} color="#10B981" /> Up to 10 permanent maps</li>
                <li><CheckIcon size={16} color="#10B981" /> Rooms of up to 50 people</li>
                <li><CheckIcon size={16} color="#10B981" /> World decorator &amp; custom outfits</li>
                <li><CheckIcon size={16} color="#10B981" /> Screen sharing &amp; video calls</li>
              </ul>

              <NeoButton
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  setIsSignUp(true);
                  setAuthModalOpen(true);
                }}
              >
                Create Free Account
              </NeoButton>
            </div>

            {/* AI Companion add-on: the only paid product */}
            <div className={`${styles.pricingCard} ${styles.pricingPopular}`}>
              <NeoBadge
                color={isDark ? '#E2F952' : '#FAB936'}
                textColor={isDark ? '#180D26' : '#18181B'}
              >
                ADD-ON • FOR ANY ACCOUNT
              </NeoBadge>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '10px' }}>AI Companion</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Your personal AI pixel pet that learns and remembers you.
              </p>

              <div className={styles.priceDisplay}>
                <span>{isPricingAnnual ? '$45' : '$5'}</span>
                <span className={styles.pricePeriod}>{isPricingAnnual ? '/ year' : '/ month'}</span>
              </div>

              <ul className={styles.featureList}>
                <li><CheckIcon size={16} color="#10B981" /> 60 AI messages every 5 hours</li>
                <li><CheckIcon size={16} color="#10B981" /> Memories, diary &amp; custom persona</li>
                <li><CheckIcon size={16} color="#10B981" /> Screen Help for step-by-step tech support</li>
                <li><CheckIcon size={16} color="#10B981" /> World guide, tours &amp; reminders</li>
                <li><CheckIcon size={16} color="#10B981" /> Renews automatically, cancel anytime</li>
              </ul>

              <NeoButton
                variant="primary"
                size="md"
                fullWidth
                onClick={() => {
                  setIsSignUp(true);
                  setAuthModalOpen(true);
                }}
              >
                Create Account to Add AI
              </NeoButton>
            </div>
          </div>

          <p className={styles.pricingFootnote}>
            Prices in US dollars, plus any applicable tax. The AI add-on renews monthly or yearly until you cancel
            from Manage billing. See our <Link href="/terms">Terms</Link>, <Link href="/refunds">Refund Policy</Link>{' '}
            and <Link href="/privacy">Privacy Policy</Link>, or <Link href="/contact">contact support</Link>.
          </p>
        </section>

        {/* Section 5: Mobile Downloads */}
        <section className={styles.sectionWrapper} id="download">
          <div className={`${styles.sectionKicker} ${styles.kickerDownload}`}>
            AVAILABLE ON MOBILE
          </div>
          <h2 className={styles.sectionTitle}>Take your world on the go.</h2>

          <div className={styles.downloadGrid}>
            {/* Android Card */}
            <NeoCard inner className={styles.downloadCard}>
              <div className={styles.platformHeader}>
                <div className={`${styles.platformLogoBox} ${styles.platformLogoAndroid}`}>
                  <AndroidLogo size={32} />
                </div>
                <div>
                  <div className={styles.platformTitle}>
                    Android APK
                    <span className={styles.platformBadge}>OFFICIAL</span>
                  </div>
                  <div className={styles.platformSubtitle}>
                    v1.0.0 • Free Direct Download (~105 MB)
                  </div>
                </div>
              </div>

              <p className={styles.platformDescription}>
                Download the native Android APK package directly to your phone or tablet. Experience high-fidelity spatial WebRTC proximity voice, on-screen joystick, and full haptic touch feedback.
              </p>

              <div className={styles.platformPillTags}>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> Android 8.0+</span>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> WebRTC Voice</span>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> Retro Joystick</span>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> Fast Direct APK</span>
              </div>

              <a
                href="https://github.com/machu21/teemchat/releases/latest/download/teemchat-release.apk"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', width: '100%' }}
              >

                <NeoButton variant="primary" size="md" fullWidth>
                  <AndroidLogo size={18} color={isDark ? '#180D26' : '#18181B'} />
                  Download Android APK
                </NeoButton>
              </a>
            </NeoCard>

            {/* Apple Card */}
            <NeoCard inner className={styles.downloadCard}>
              <div className={styles.platformHeader}>
                <div className={`${styles.platformLogoBox} ${styles.platformLogoApple}`}>
                  <AppleLogo size={28} />
                </div>
                <div>
                  <div className={styles.platformTitle}>
                    Apple iOS &amp; iPadOS
                    <span className={styles.platformBadge}>WEB APP</span>
                  </div>
                  <div className={styles.platformSubtitle}>
                    iOS 14.0+ • Fullscreen Safari PWA
                  </div>
                </div>
              </div>

              <p className={styles.platformDescription}>
                No App Store wait required. Open TeemChat in Safari, tap the <strong>Share</strong> icon, and select <strong>Add to Home Screen</strong> for an immersive, full-screen native experience.
              </p>

              <div className={styles.platformPillTags}>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> iPhone &amp; iPad</span>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> Zero Install Time</span>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> Spatial Audio</span>
                <span className={styles.platformPill}><CheckIcon size={12} color="currentColor" /> Standalone Window</span>
              </div>

              <NeoButton
                variant="secondary"
                size="md"
                fullWidth
                onClick={handleCopySafariLink}
              >
                {copiedSafariLink ? (
                  <>
                    <CheckIcon size={16} color="currentColor" /> Link Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <AppleLogo size={18} color="currentColor" /> Copy Link for Safari
                  </>
                )}
              </NeoButton>
            </NeoCard>
          </div>
        </section>

        {/* Section 6: Ready to hang out? CTA Card */}
        <section className={styles.readyCard}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '8px' }}>
            Ready to hang out with your crew?
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            Join thousands of explorers building cozy 16-bit virtual spaces today.
          </p>
          <div className={styles.readyButtons}>
            <NeoButton variant="primary" size="lg" onClick={() => openGuestModal()}>
              Start a Space Free
            </NeoButton>
            <NeoButton variant="secondary" size="lg" onClick={() => openGuestModal()} disabled={isSubmitting}>
              Enter as Guest
            </NeoButton>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerGrid}>
            {/* Brand Column */}
            <div className={styles.footerBrandCol}>
              <button
                type="button"
                className={styles.footerLogo}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="TeemChat Home"
              >
                <div className={styles.footerLogoCircle}>
                  <Image
                    src={isDark ? '/images/teamchat_logo_dark.jpg' : '/images/teamchat_logo.jpg'}
                    alt="TeemChat Logo"
                    width={36}
                    height={36}
                    className={styles.footerLogoImg}
                  />
                </div>
                <span className={styles.footerLogoText}>
                  teemchat<span className={styles.logoDot}>.</span>
                </span>
                <span className={styles.footerBetaBadge}>BETA</span>
              </button>

              <p className={styles.footerTagline}>
                The 16-bit virtual hangout space for remote teams, study squads, and friends. Proximity spatial voice, interactive rooms, and retro avatars.
              </p>

              <div className={styles.footerStatusPill}>
                <span className={styles.statusPulseDot} />
                <span>All Systems Operational</span>
              </div>
            </div>

            {/* Product Column */}
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>PRODUCT</h4>
              <ul className={styles.footerList}>
                <li>
                  <button type="button" onClick={() => scrollTo('try-it')} className={styles.footerLink}>
                    Interactive Preview
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('how-it-works')} className={styles.footerLink}>
                    How It Works
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('features')} className={styles.footerLink}>
                    Core Features
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('pricing')} className={styles.footerLink}>
                    Pricing &amp; Plans
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollTo('download')} className={styles.footerLink}>
                    Mobile &amp; Desktop
                  </button>
                </li>
              </ul>
            </div>

            {/* Experience Column */}
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>EXPERIENCE</h4>
              <ul className={styles.footerList}>
                <li>
                  <button
                    type="button"
                    onClick={() => openGuestModal()}
                    className={styles.footerLinkHighlight}
                  >
                    <ZapIcon size={14} style={{ marginRight: 6 }} /> Enter as Guest
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setAuthModalOpen(true);
                    }}
                    className={styles.footerLink}
                  >
                    Create Account
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setAuthModalOpen(true);
                    }}
                    className={styles.footerLink}
                  >
                    Sign In
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openGuestModal()}
                    className={styles.footerLink}
                  >
                    Avatar Builder
                  </button>
                </li>
              </ul>
            </div>

            {/* Community Column */}
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>SUPPORT &amp; LEGAL</h4>
              <ul className={styles.footerList}>
                <li>
                  <Link href="/contact" className={styles.footerLink}>Contact &amp; Support</Link>
                </li>
                <li>
                  <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
                </li>
                <li>
                  <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
                </li>
                <li>
                  <Link href="/refunds" className={styles.footerLink}>Refund Policy</Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar: Copyright & Back to Top */}
          <div className={styles.footerBottomBar}>
            <div className={styles.footerCopy}>
              <span>© 2026 {LEGAL.companyName}. All rights reserved.</span>
              <span className={styles.footerCopyTag}>
                • Crafted with <HeartIcon size={13} color="#EF4444" style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 2px' }} /> for cozy virtual spaces.
              </span>
            </div>

            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.backToTopBtn}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="Scroll back to top"
              >
                <ArrowUpIcon size={14} style={{ marginRight: 4 }} /> Back to Top
              </button>
            </div>
          </div>
        </div>
      </footer>

      {modals}
    </div>
  );
}
