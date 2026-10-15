'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import styles from './page.module.css';
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
import { InviteLinkService } from '@/lib/services/invite';
import { Gender, defaultMaleAvatarConfig, defaultFemaleAvatarConfig } from '@/lib/models/avatar';
import { useRouter } from 'next/navigation';

const TYPEWRITER_PHRASES = [
  'cozy 2D spaces.',
  'campfire circles.',
  'pixel retreat cabins.',
  'virtual world avenues.',
];

export default function LandingPage() {
  const router = useRouter();
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Mobile Menu & Action States ──
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedSafariLink, setCopiedSafariLink] = useState(false);

  // ── Guest & Character Setup State ──
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [signUpGender, setSignUpGender] = useState<Gender>('male');

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
  }, [initSession, initTheme]);

  useEffect(() => {
    if (session && !isGuest) {
      router.push('/dashboard');
    }
  }, [session, isGuest, router]);

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

  const openGuestModal = (defaultName?: string) => {
    const name = defaultName !== undefined ? defaultName : (spaceName.trim() ? `${spaceName.trim()} Explorer` : 'Explorer');
    setGuestName(name);
    setCharacterModalOpen(true);
  };

  const handleConfirmGuest = async () => {
    setIsSubmitting(true);
    try {
      await signInGuest(guestName.trim() || 'Explorer', guestGender);
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
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        if (!username || !displayName) {
          setAuthError('Please fill in all fields.');
          return;
        }
        const res = await signUpWithPassword(email, password, username, displayName, signUpGender);
        if (res.error) {
          setAuthError(res.error);
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

  return (
    <div className={styles.page}>
      {/* ── Pending Invite Banner ── */}
      {pendingCode && (
        <div className={styles.inviteBanner}>
          <div className={styles.inviteBannerContent}>
            <span>🔗</span>
            <span>
              You were invited to space: <strong>{pendingCode}</strong>! Hop right in to explore.
            </span>
          </div>
          <NeoButton size="sm" variant="secondary" onClick={() => openGuestModal()} disabled={isSubmitting}>
            ⚡ Enter as Guest
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
          <a className={`${styles.navLink} ${styles.navLinkBold}`} onClick={() => scrollTo('try-it')}>
            Try it
          </a>
          <a className={styles.navLink} onClick={() => scrollTo('how-it-works')}>
            How it works
          </a>
          <a className={styles.navLink} onClick={() => scrollTo('features')}>
            Features
          </a>
          <a className={styles.navLink} onClick={() => scrollTo('pricing')}>
            Pricing
          </a>
          <a className={styles.navLink} onClick={() => scrollTo('download')}>
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
            {mobileMenuOpen ? '✕' : '☰'}
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
              ✨ Try It Out
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('how-it-works');
                setMobileMenuOpen(false);
              }}
            >
              🗺️ How It Works
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('features');
                setMobileMenuOpen(false);
              }}
            >
              ⚡ Features
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('pricing');
                setMobileMenuOpen(false);
              }}
            >
              💎 Pricing
            </button>
            <button
              type="button"
              className={styles.mobileNavLink}
              onClick={() => {
                scrollTo('download');
                setMobileMenuOpen(false);
              }}
            >
              📱 Download Apps
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
              🔑 Log In / Sign Up
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
              ⚡ Enter as Guest
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
                <span style={{ color: '#10B981' }}>⚡</span> Instant guest pass
              </span>
              <span className={styles.heroTrustDot}>•</span>
              <span className={styles.heroTrustItem}>
                <span style={{ color: '#8B5CF6' }}>🔒</span> Zero setup required
              </span>
              <span className={styles.heroTrustDot}>•</span>
              <span className={styles.heroTrustItem}>
                <span style={{ color: '#F59E0B' }}>📱</span> Web &amp; Mobile ready
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
                  <div className={styles.sparkleOne}>✨</div>
                  <div className={styles.sparkleTwo}>✦</div>
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
                      <div className={styles.chatBubbleUser}>
                        Hey TeemChat Cat! Love this cozy world 🔥
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
              <div className={styles.featIconBox}>🧭</div>
              <div className={styles.stepTitle}>Rooms that keep up</div>
              <div className={styles.stepDesc}>
                Ephemeral 30-second disappearing chat bubbles that keep conversations fresh and natural.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.featIconBox}>🎙️</div>
              <div className={styles.stepTitle}>Voice huts & Proximity</div>
              <div className={styles.stepDesc}>
                High-bitrate LiveKit spatial WebRTC audio. Walk near players to hear them; walk away to fade.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.featIconBox}>🤖</div>
              <div className={styles.stepTitle}>Buddy chat & AI RAG</div>
              <div className={styles.stepDesc}>
                Your personal AI Companion travels with you, learns from your talks, and remembers past facts.
              </div>
            </NeoCard>

            <NeoCard inner>
              <div className={styles.featIconBox}>🛠️</div>
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
            Start free forever with your crew. Upgrade when you need bigger rooms and custom builds.
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
                <li><span>✓</span> Join any space instantly as Guest</li>
                <li><span>✓</span> No account registration needed</li>
                <li><span>✓</span> 2D Virtual world & river swimming</li>
                <li><span>✓</span> Proximity spatial voice audio</li>
                <li><span>✓</span> In-world messaging & campfire chat</li>
                <li style={{ opacity: 0.5 }}><span>✕</span> No AI companion persona</li>
                <li style={{ opacity: 0.5 }}><span>✕</span> No persistent account or space saves</li>
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

            {/* Paid Tier */}
            <div className={`${styles.pricingCard} ${styles.pricingPopular}`}>
              <NeoBadge
                color={isDark ? '#E2F952' : '#FAB936'}
                textColor={isDark ? '#180D26' : '#18181B'}
              >
                PAID TIER • ALL-INCLUSIVE
              </NeoBadge>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '10px' }}>Member + AI</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Full persistent account with your personalized AI Companion.
              </p>

              <div className={styles.priceDisplay}>
                <span>{isPricingAnnual ? '$9' : '$12'}</span>
                <span className={styles.pricePeriod}>/ month</span>
              </div>

              <ul className={styles.featureList}>
                <li><span>✓</span> Full registered account & profile</li>
                <li><span>✓</span> 🤖 Personal AI Companion (learns from scratch)</li>
                <li><span>✓</span> Custom AI Persona, memories & sprite avatar</li>
                <li><span>✓</span> Permanent cloud spaces & world decorator</li>
                <li><span>✓</span> Interactive screen sharing & video calls</li>
                <li><span>✓</span> High-bitrate low-latency spatial voice</li>
                <li><span>✓</span> Custom retro outfits & accessories</li>
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
                Create Account (Free Beta)
              </NeoButton>
            </div>
          </div>
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
                <span className={styles.platformPill}>✓ Android 8.0+</span>
                <span className={styles.platformPill}>✓ WebRTC Voice</span>
                <span className={styles.platformPill}>✓ Retro Joystick</span>
                <span className={styles.platformPill}>✓ Fast Direct APK</span>
              </div>

              <a href="/downloads/teemchat-release.apk" download style={{ textDecoration: 'none', width: '100%' }}>
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
                <span className={styles.platformPill}>✓ iPhone &amp; iPad</span>
                <span className={styles.platformPill}>✓ Zero Install Time</span>
                <span className={styles.platformPill}>✓ Spatial Audio</span>
                <span className={styles.platformPill}>✓ Standalone Window</span>
              </div>

              <NeoButton
                variant="secondary"
                size="md"
                fullWidth
                onClick={handleCopySafariLink}
              >
                <AppleLogo size={18} color="currentColor" />
                {copiedSafariLink ? '✓ Link Copied to Clipboard!' : 'Copy Link for Safari'}
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
        <div className={styles.footerLeft}>
          <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>
            teemchat<span style={{ color: 'var(--hero-highlight)' }}>.</span>
          </span>
          <span>© 2026 TeemChat Inc. Built with Next.js & Supabase.</span>
        </div>
        <div className={styles.statusIndicator}>
          <span>●</span>
          <span>All Systems Operational</span>
        </div>
      </footer>

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
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleAuthSubmit} className={styles.authForm}>
          {authError && <div className={styles.errorAlert}>{authError}</div>}

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
              <div className={styles.genderSection}>
                <div className={styles.genderLabel}>SELECT GENDER</div>
                <div className={styles.genderRow}>
                  <button
                    type="button"
                    className={`${styles.genderCard} ${signUpGender === 'male' ? styles.genderCardMaleActive : ''}`}
                    onClick={() => setSignUpGender('male')}
                  >
                    <span>👨</span>
                    <span>Male</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.genderCard} ${signUpGender === 'female' ? styles.genderCardFemaleActive : ''}`}
                    onClick={() => setSignUpGender('female')}
                  >
                    <span>👩</span>
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
            Skip for now &amp; enter as Guest →
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
            <div className={styles.pedestalName}>{guestName.trim() || 'Explorer'}</div>
            <div className={styles.pedestalMeta}>
              {guestGender === 'female' ? '♀ Female Character' : '♂ Male Character'}
            </div>
          </div>

          <NeoInput
            label="EXPLORER NAME"
            placeholder="Explorer"
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
                <span>👨</span>
                <span>Male</span>
              </button>
              <button
                type="button"
                className={`${styles.genderCard} ${guestGender === 'female' ? styles.genderCardFemaleActive : ''}`}
                onClick={() => setGuestGender('female')}
              >
                <span>👩</span>
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
            {isSubmitting ? 'Entering World...' : '⚡ Enter Virtual World'}
          </NeoButton>
        </div>
      </NeoModal>
    </div>
  );
}
