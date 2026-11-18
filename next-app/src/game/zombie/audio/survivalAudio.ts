import { SILENCE, spatialMix, type Ambience, type SoundEvent, type SoundId } from '../feedback';

// ============================================================
// ZOMBIE MODE — SOUND (Web Audio synthesis, no audio files)
// Like lib/utils/callSounds.ts, every sound is synthesized: noise bursts
// through filters for gunshots, glass and rain, oscillators for engines,
// horns, groans and UI chimes. One-shots are placed in stereo by where
// they happen (feedback.ts spatialMix); ambience (rain, wind, your engine,
// heartbeat, helicopter, generator, campfire) is a set of loops whose
// levels follow the game every frame.
//
// Browsers only start audio after a user gesture: WorldGame calls
// unlock() on the first key / pointer press.
// ============================================================

export interface AudioSettings {
  /** 0–1 master volume. */
  volume: number;
  sfx: boolean;
  ambience: boolean;
}

type Voice = (a: SurvivalAudio, out: AudioNode, t: number, v: number) => void;

/** How each one-shot is made. */
const VOICES: Record<SoundId, Voice> = {
  shot_light: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 0.9 * v, decay: 0.16, filter: 'lowpass', freq: 2600 });
    a.tone(o, t, { type: 'sine', from: 150, to: 50, decay: 0.12, gain: 0.7 * v });
  },
  shot_heavy: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 1 * v, decay: 0.22, filter: 'lowpass', freq: 1800 });
    a.tone(o, t, { type: 'sine', from: 120, to: 40, decay: 0.18, gain: 0.8 * v });
  },
  shot_shotgun: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 1 * v, decay: 0.35, filter: 'lowpass', freq: 1200 });
    a.tone(o, t, { type: 'sine', from: 90, to: 35, decay: 0.3, gain: 0.9 * v });
  },
  empty: (a, o, t, v) => a.tone(o, t, { type: 'square', from: 1800, to: 1600, decay: 0.03, gain: 0.15 * v }),
  reload: (a, o, t, v) => {
    a.tone(o, t, { type: 'square', from: 900, to: 700, decay: 0.04, gain: 0.12 * v });
    a.tone(o, t + 0.18, { type: 'square', from: 600, to: 500, decay: 0.05, gain: 0.14 * v });
  },
  swing: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.35 * v, decay: 0.14, filter: 'bandpass', freq: 900, toFreq: 2400, attack: 0.03 }),
  hit: (a, o, t, v) => {
    a.tone(o, t, { type: 'sine', from: 140, to: 55, decay: 0.12, gain: 0.7 * v });
    a.noiseHit(o, t, { gain: 0.35 * v, decay: 0.06, filter: 'lowpass', freq: 900 });
  },
  shove: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.3 * v, decay: 0.1, filter: 'lowpass', freq: 600 }),
  hurt: (a, o, t, v) => {
    a.tone(o, t, { type: 'triangle', from: 260, to: 150, decay: 0.22, gain: 0.35 * v });
    a.noiseHit(o, t, { gain: 0.3 * v, decay: 0.08, filter: 'bandpass', freq: 1500 });
  },
  death: (a, o, t, v) => a.tone(o, t, { type: 'sawtooth', from: 220, to: 55, decay: 1.4, gain: 0.25 * v, filter: 700 }),
  groan: (a, o, t, v) => {
    const f = 85 + a.random() * 50;
    a.tone(o, t, { type: 'sawtooth', from: f, to: f * 0.8, decay: 0.9, attack: 0.15, gain: 0.22 * v, filter: 500, vibrato: 6 });
  },
  door: (a, o, t, v) => {
    a.tone(o, t, { type: 'square', from: 180, to: 120, decay: 0.08, gain: 0.18 * v, filter: 900 });
    a.noiseHit(o, t + 0.05, { gain: 0.2 * v, decay: 0.06, filter: 'lowpass', freq: 500 });
  },
  hammer: (a, o, t, v) => {
    for (let k = 0; k < 3; k++) a.tone(o, t + k * 0.16, { type: 'square', from: 320, to: 200, decay: 0.05, gain: 0.2 * v, filter: 1400 });
  },
  pry: (a, o, t, v) => a.tone(o, t, { type: 'sawtooth', from: 300, to: 520, decay: 0.35, gain: 0.12 * v, filter: 1500 }),
  glass: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 0.6 * v, decay: 0.25, filter: 'highpass', freq: 3500 });
    for (let k = 0; k < 4; k++) a.tone(o, t + 0.04 + k * 0.05, { type: 'sine', from: 2400 + a.random() * 2400, decay: 0.12, gain: 0.08 * v });
  },
  wood_break: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 0.7 * v, decay: 0.3, filter: 'lowpass', freq: 700 });
    a.tone(o, t, { type: 'square', from: 110, to: 60, decay: 0.2, gain: 0.25 * v, filter: 600 });
  },
  alarm: (a, o, t, v) => {
    for (let k = 0; k < 4; k++) a.tone(o, t + k * 0.5, { type: 'square', from: 700, to: 1100, decay: 0.45, attack: 0.02, gain: 0.12 * v, filter: 2500 });
  },
  distant_shots: (a, o, t, v) => {
    for (let k = 0; k < 3; k++) a.noiseHit(o, t + k * (0.18 + a.random() * 0.2), { gain: 0.25 * v, decay: 0.2, filter: 'lowpass', freq: 500 });
  },
  lure: (a, o, t, v) => {
    for (let k = 0; k < 3; k++) a.tone(o, t + k * 0.25, { type: 'square', from: 1200, decay: 0.1, gain: 0.1 * v });
  },
  burst: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.8 * v, decay: 0.45, filter: 'lowpass', freq: 400 }),
  roar: (a, o, t, v) => a.tone(o, t, { type: 'sawtooth', from: 120, to: 70, decay: 1.2, attack: 0.1, gain: 0.35 * v, filter: 600, vibrato: 9 }),
  thunder: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 0.9 * v, decay: 2.6, filter: 'lowpass', freq: 220, attack: 0.08 });
    a.noiseHit(o, t + 0.3, { gain: 0.5 * v, decay: 1.8, filter: 'lowpass', freq: 120 });
  },
  pickup: (a, o, t, v) => {
    a.tone(o, t, { type: 'triangle', from: 660, decay: 0.07, gain: 0.12 * v });
    a.tone(o, t + 0.06, { type: 'triangle', from: 990, decay: 0.09, gain: 0.12 * v });
  },
  eat: (a, o, t, v) => {
    for (let k = 0; k < 3; k++) a.noiseHit(o, t + k * 0.14, { gain: 0.18 * v, decay: 0.07, filter: 'bandpass', freq: 1200 });
  },
  drink: (a, o, t, v) => {
    for (let k = 0; k < 3; k++) a.tone(o, t + k * 0.15, { type: 'sine', from: 300, to: 520, decay: 0.1, gain: 0.12 * v });
  },
  bandage: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.2 * v, decay: 0.4, filter: 'bandpass', freq: 2500, attack: 0.1 }),
  craft: (a, o, t, v) => {
    [523, 659, 784].forEach((f, k) => a.tone(o, t + k * 0.08, { type: 'triangle', from: f, decay: 0.14, gain: 0.12 * v }));
  },
  level: (a, o, t, v) => {
    [523, 659, 784, 1047].forEach((f, k) => a.tone(o, t + k * 0.1, { type: 'triangle', from: f, decay: 0.25, gain: 0.15 * v }));
  },
  engine_start: (a, o, t, v) => {
    a.tone(o, t, { type: 'sawtooth', from: 40, to: 70, decay: 0.6, attack: 0.2, gain: 0.25 * v, filter: 400 });
  },
  engine_fail: (a, o, t, v) => {
    for (let k = 0; k < 3; k++) a.tone(o, t + k * 0.22, { type: 'sawtooth', from: 45, to: 30, decay: 0.15, gain: 0.18 * v, filter: 300 });
  },
  horn: (a, o, t, v) => {
    a.tone(o, t, { type: 'square', from: 415, decay: 0.55, attack: 0.01, gain: 0.12 * v, filter: 1800, hold: 0.4 });
    a.tone(o, t, { type: 'square', from: 523, decay: 0.55, attack: 0.01, gain: 0.1 * v, filter: 1800, hold: 0.4 });
  },
  crash: (a, o, t, v) => {
    a.noiseHit(o, t, { gain: 0.9 * v, decay: 0.5, filter: 'lowpass', freq: 1400 });
    a.tone(o, t, { type: 'triangle', from: 900, to: 600, decay: 0.6, gain: 0.08 * v });
  },
  splash: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.3 * v, decay: 0.3, filter: 'bandpass', freq: 900, toFreq: 400 }),
  rustle: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.2 * v, decay: 0.35, filter: 'highpass', freq: 2000, attack: 0.08 }),
  switch: (a, o, t, v) => a.tone(o, t, { type: 'square', from: 1200, to: 900, decay: 0.03, gain: 0.12 * v }),
  pour: (a, o, t, v) => a.noiseHit(o, t, { gain: 0.25 * v, decay: 0.6, filter: 'bandpass', freq: 700, attack: 0.1 }),
  ui: (a, o, t, v) => a.tone(o, t, { type: 'triangle', from: 880, decay: 0.05, gain: 0.08 * v }),
};

interface ToneOpts {
  type: OscillatorType;
  from: number;
  to?: number;
  decay: number;
  attack?: number;
  /** Seconds at full level before the decay. */
  hold?: number;
  gain: number;
  /** Lowpass cutoff (Hz). */
  filter?: number;
  /** Vibrato rate (Hz) for groans. */
  vibrato?: number;
}

interface NoiseOpts {
  gain: number;
  decay: number;
  attack?: number;
  filter: BiquadFilterType;
  freq: number;
  toFreq?: number;
}

/** Ambience loop: a source feeding a gain the game turns up and down. */
interface Loop {
  gain: GainNode;
  filter?: BiquadFilterNode;
  osc?: OscillatorNode;
}

export class SurvivalAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private loops: Partial<Record<'rain' | 'wind' | 'engine' | 'heli' | 'gen' | 'fire', Loop>> = {};
  private nextBeat = 0;
  private settings: AudioSettings = { volume: 0.7, sfx: true, ambience: true };
  private seed = 7;
  /** Per-sound cooldowns so a crowd doesn't machine-gun the same sample. */
  private lastPlayed = new Map<SoundId, number>();

  random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  setSettings(s: AudioSettings) {
    this.settings = s;
    if (!this.ctx || !this.master || !this.sfxBus || !this.ambBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.volume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.ambience ? 1 : 0, t, 0.05);
  }

  /** Call from a user gesture (key / pointer): browsers only allow audio after one. */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.ambBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.setSettings(this.settings);
      this.buildLoops();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Plays this frame's sound events around the listener. */
  play(events: SoundEvent[], listener: { x: number; y: number }) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running' || !this.settings.sfx) return;
    const now = ctx.currentTime;
    for (const ev of events) {
      const mix = spatialMix(listener, ev);
      if (!mix || mix.gain < 0.01) continue;
      const last = this.lastPlayed.get(ev.id) ?? -1;
      if (now - last < 0.04) continue;
      this.lastPlayed.set(ev.id, now);
      try {
        const pan = ctx.createStereoPanner();
        pan.pan.value = mix.pan;
        pan.connect(this.sfxBus);
        VOICES[ev.id](this, pan, now + (ev.delay ?? 0), Math.min(1, mix.gain));
        // Disconnect once it's surely finished (longest voice ≈ 3 s)
        setTimeout(() => pan.disconnect(), ((ev.delay ?? 0) + 4) * 1000);
      } catch {
        // A browser without StereoPanner etc.: just skip
      }
    }
  }

  /** Follows the ambience every frame. */
  setAmbience(a: Ambience = SILENCE) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const set = (loop: Loop | undefined, level: number) => loop?.gain.gain.setTargetAtTime(level, t, 0.25);
    const shelter = a.sheltered ? 0.35 : 1;
    set(this.loops.rain, a.rain * 0.22 * shelter);
    this.loops.rain?.filter?.frequency.setTargetAtTime(a.sheltered ? 700 : 2400, t, 0.3);
    set(this.loops.wind, a.wind * 0.18 * shelter);
    set(this.loops.heli, a.helicopter * 0.3);
    set(this.loops.gen, a.generator * 0.08);
    set(this.loops.fire, a.fire * 0.08);
    if (this.loops.engine?.osc) {
      const on = a.engine !== null;
      set(this.loops.engine, on ? 0.07 + 0.06 * (a.engine ?? 0) : 0);
      this.loops.engine.osc.frequency.setTargetAtTime(38 + 70 * (a.engine ?? 0), t, 0.15);
    }
    // Heartbeat: two thumps per beat, scheduled ahead
    if (a.heartbeat > 0 && this.sfxBus) {
      if (this.nextBeat < t) this.nextBeat = t + 0.05;
      while (this.nextBeat < t + 0.2) {
        this.tone(this.ambBus!, this.nextBeat, { type: 'sine', from: 70, to: 45, decay: 0.12, gain: 0.35 });
        this.tone(this.ambBus!, this.nextBeat + 0.22, { type: 'sine', from: 60, to: 40, decay: 0.12, gain: 0.25 });
        this.nextBeat += 60 / a.heartbeat;
      }
    }
  }

  /** Silence everything (leaving survival mode). */
  stop() {
    if (!this.ctx) return;
    this.setAmbience(SILENCE);
    const ctx = this.ctx;
    this.ctx = null;
    this.loops = {};
    ctx.close().catch(() => {});
  }

  // ------------------------------------------------------------ building blocks

  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  /** A filtered noise burst with an attack / decay envelope. */
  noiseHit(out: AudioNode, t: number, o: NoiseOpts) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.playbackRate.value = 0.8 + this.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.toFreq) f.frequency.exponentialRampToValueAtTime(o.toFreq, t + o.decay);
    const g = ctx.createGain();
    const attack = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, this.random() * 1.5);
    src.stop(t + attack + o.decay + 0.05);
  }

  /** An oscillator note (optionally sliding, filtered, with vibrato). */
  tone(out: AudioNode, t: number, o: ToneOpts) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.hold ?? 0) + o.decay);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node = node.connect(f);
    }
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato;
      depth.gain.value = o.from * 0.06;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + (o.hold ?? 0) + o.decay + (o.attack ?? 0) + 0.05);
    }
    const g = ctx.createGain();
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + attack);
    if (o.hold) g.gain.setValueAtTime(o.gain, t + attack + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + (o.hold ?? 0) + o.decay);
    node.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + attack + (o.hold ?? 0) + o.decay + 0.05);
  }

  /** The ambience loops, silent until the game turns them up. */
  private buildLoops() {
    const ctx = this.ctx!;
    const bus = this.ambBus!;
    const noiseLoop = (type: BiquadFilterType, freq: number, q = 0.7): Loop => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(bus);
      src.start();
      return { gain, filter };
    };
    const oscLoop = (type: OscillatorType, freq: number, cutoff: number): Loop => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(bus);
      osc.start();
      return { gain, filter, osc };
    };
    this.loops.rain = noiseLoop('bandpass', 2400, 0.5);
    this.loops.wind = noiseLoop('lowpass', 380, 4);
    this.loops.fire = noiseLoop('highpass', 3000);
    this.loops.engine = oscLoop('sawtooth', 40, 380);
    this.loops.gen = oscLoop('square', 60, 240);
    // Helicopter: low noise chopped by a 12 Hz tremolo
    const heli = noiseLoop('lowpass', 300, 1);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 12;
    depth.gain.value = 0.5;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    heli.gain.disconnect();
    heli.gain.connect(chop).connect(bus);
    lfo.start();
    this.loops.heli = heli;
  }
}
