/**
 * Web Audio API synthesizer for Discord-style retro sound effects.
 * Requires no external audio files and has zero latency.
 */

let audioCtx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a short chime tone
 */
function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal: number = 0.15): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

/**
 * Pleasant Discord-style upward join call chime (C5 -> E5 -> G5)
 */
export function playJoinCallSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const tones = [523.25, 659.25, 783.99]; // C5, E5, G5
  tones.forEach((f, i) => {
    setTimeout(() => {
      playTone(f, 0.18, 'triangle', 0.2);
    }, i * 110);
  });
}

/**
 * Downward leave call chime (G4 -> C4)
 */
export function playLeaveCallSound(): void {
  const tones = [783.99, 523.25];
  tones.forEach((f, i) => {
    setTimeout(() => {
      playTone(f, 0.22, 'triangle', 0.18);
    }, i * 130);
  });
}

/**
 * Quick crisp mute blip
 */
export function playMuteSound(): void {
  playTone(280, 0.08, 'square', 0.08);
}

/**
 * Higher crisp unmute blip
 */
export function playUnmuteSound(): void {
  playTone(560, 0.08, 'square', 0.08);
}

/**
 * Futuristic ascending sweep when screen sharing starts
 */
export function playScreenShareSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(960, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

/**
 * Retro repeating ring tone for incoming calls (440Hz + 480Hz pulses)
 */
export function startCallRing(): void {
  stopCallRing();

  const playRingPulse = () => {
    playTone(440, 0.35, 'triangle', 0.15);
    setTimeout(() => playTone(480, 0.35, 'triangle', 0.15), 50);
  };

  playRingPulse();
  ringInterval = setInterval(playRingPulse, 2400);
}

export function stopCallRing(): void {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}
