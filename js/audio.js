// Sound: synthesized arcade SFX (Web Audio, zero latency, no files, no licensing worries),
// optional ambient loops, and haptics. Everything degrades silently if unsupported.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Synth {
  constructor() { this.ctx = null; this.master = null; this.on = true; this.vol = 0.8; }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
    return this.ctx;
  }

  unlock() {
    const c = this.ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }

  tone({ f, f2, type = 'square', t = 0, dur = 0.12, vol = 0.22 }) {
    const c = this.ensure();
    if (!c || !this.on) return;
    const t0 = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  noise({ t = 0, dur = 0.15, vol = 0.15 }) {
    const c = this.ensure();
    if (!c || !this.on) return;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; g.gain.value = vol;
    s.connect(g); g.connect(this.master);
    s.start(c.currentTime + t);
  }

  arp(notes, step = 0.07, o = {}) { notes.forEach((n, i) => this.tone({ f: midi(n), t: i * step, ...o })); }
}

const SOUNDS = {
  click: (s) => s.tone({ f: 660, f2: 990, dur: 0.05, vol: 0.1 }),
  correct: (s, streak = 0) => s.arp([72, 76, 79].map((n) => n + Math.min(streak, 12)), 0.055, { dur: 0.11, vol: 0.2 }),
  wrong: (s) => { s.tone({ f: 230, f2: 80, type: 'sawtooth', dur: 0.3, vol: 0.24 }); s.noise({ dur: 0.12, vol: 0.08 }); },
  tick: (s) => s.tone({ f: 1500, dur: 0.035, vol: 0.09 }),
  beep: (s) => s.tone({ f: midi(72), dur: 0.1, vol: 0.2 }),
  go: (s) => s.tone({ f: midi(84), dur: 0.3, vol: 0.22 }),
  level: (s) => s.arp([72, 76, 79, 84], 0.075, { dur: 0.13, vol: 0.2 }),
  best: (s) => { s.arp([72, 72, 76, 79, 84, 88], 0.09, { dur: 0.16, vol: 0.2 }); s.tone({ f: midi(91), t: 0.6, dur: 0.5, vol: 0.18, type: 'triangle' }); },
  over: (s) => s.arp([67, 64, 60, 55], 0.14, { dur: 0.22, vol: 0.2, type: 'triangle' }),
  win: (s) => { s.arp([72, 76, 79, 84, 79, 84, 88], 0.08, { dur: 0.15, vol: 0.2 }); },
  coin: (s) => { s.tone({ f: midi(83), dur: 0.07, vol: 0.14 }); s.tone({ f: midi(88), t: 0.07, dur: 0.18, vol: 0.14 }); },
};

const BUZZ = { tap: 8, correct: 14, wrong: [45, 40, 45], level: [20, 40, 20], win: [30, 40, 30, 40, 70] };

class Music {
  constructor() { this.el = null; this.track = 'none'; this.vol = 0.5; this.suspended = false; }
  set(track, vol) {
    this.vol = vol;
    if (track !== this.track) {
      if (this.el) { this.el.pause(); this.el = null; }
      this.track = track;
      if (track !== 'none') {
        this.el = new Audio(`assets/audio/${track}.mp3`);
        this.el.loop = true;
        this.el.preload = 'auto';
      }
    }
    if (this.el) { this.el.volume = vol; this.play(); }
  }
  play() { if (this.el && !this.suspended) this.el.play().catch(() => { /* waits for a gesture */ }); }
  pause() { if (this.el) this.el.pause(); }
}

const synth = new Synth();
const music = new Music();
let store = null;

export const audio = {
  init(s) {
    store = s;
    const apply = () => {
      const st = store.settings;
      synth.on = st.sfx && !st.mute;
      synth.setVolume(st.sfxVol);
      music.set(st.mute ? 'none' : st.music, st.musicVol);
    };
    apply();
    store.on('settings', apply);
    // Browsers only allow sound after a user gesture.
    const unlock = () => { synth.unlock(); music.play(); };
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
    document.addEventListener('visibilitychange', () => {
      music.suspended = document.hidden;
      if (document.hidden) music.pause(); else music.play();
    });
  },
  sfx(name, arg) { if (store && store.settings.sfx && !store.settings.mute && SOUNDS[name]) SOUNDS[name](synth, arg); },
  buzz(name) {
    if (!store || !store.settings.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(BUZZ[name] || 8); } catch { /* ignore */ }
  },
};
