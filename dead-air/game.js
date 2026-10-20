/*
 * Dead Air: engine, sound and interface.
 *
 * Engine is pure game logic with no DOM access, so tools/check.mjs can play
 * whole nights in Node. Sound makes every noise with the Web Audio API. The
 * interface section at the bottom drives the page as an async state machine.
 *
 * Debug URL parameters: ?speed=10 runs every timer ten times faster, and
 * ?seed=42 makes a night's random picks repeatable.
 */
/* global STRINGS, CALLERS, MEMOS, RANDOM_EVENTS, ENDINGS, EPILOGUES */
'use strict';

const CONFIG = {
  startTrust: 50,
  startHeat: 10,
  nightMinutes: 480, // 22:00 → 06:00
  callMinutes: 6, // the clock jumps this far after a call
  memoMinutes: 2,
  randomMinutes: 3,
  cutMinutes: 2,
  liveMinutesPerSecond: 0.2, // and creeps forward while you're on the line
  ffMinutesPerSecond: 30, // fast-forward between calls…
  ffMinSeconds: 0.7,
  ffMaxSeconds: 2.4, // …but never for longer than this
  lateLimit: 35, // optional callers this many minutes overdue have hung up
  memoPenalty: 8,
  memoKeptHeat: -5,
  defaultCut: { trust: -2 },
  drift: { trustPerHour: -8, heatPerHour: -10 }, // listeners doze off; the censors' attention wanders
  song: {
    minutes: 10,
    heat: -4,
    windowMinutes: 60, // each earlier record in this window makes the next one cost trust
    trustPerExtra: 3,
    seconds: 5.5,
    requestSeconds: 3.2,
  },
  deadAir: { graceSeconds: 25, everySeconds: 15, trust: -2 },
  random: { chance: 0.25, max: 3, notBefore: 25, notAfter: 440 },
  ringSeconds: 14,
  staticSeconds: 6,
  typeCharsPerSecond: 48,
};

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

const Engine = (() => {
  const NIGHT = CONFIG.nightMinutes;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  // '22:00' → 0, '05:30' → 450. NaN for anything that isn't a clock time.
  function toMinutes(hhmm) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
    if (!match) return NaN;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return NaN;
    return ((h - 22 + 24) % 24) * 60 + m;
  }

  function clockText(minutes) {
    const total = (22 * 60 + Math.floor(minutes)) % (24 * 60);
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  // mulberry32. The seed lives in the save, so a reloaded night stays the same.
  function random(state) {
    state.seed = (state.seed + 0x6d2b79f5) >>> 0;
    let t = state.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const events = [
    ...CALLERS.map((c) => ({ type: 'call', ...c })),
    ...MEMOS.map((m) => ({ type: 'memo', required: true, ...m })),
  ].map((b) => ({ ...b, atMin: toMinutes(b.at) }));
  // Timed events in clock order; triggered ones fire once, as soon as their condition holds.
  const schedule = events.filter((b) => !b.trigger).sort((a, b) => a.atMin - b.atMin);
  const triggers = events.filter((b) => b.trigger);
  const beats = new Map(events.map((b) => [b.id, b]));
  const randoms = new Map(RANDOM_EVENTS.map((e) => [e.id, { ...e, random: true }]));

  function test(state, cond) {
    if (cond == null) return true;
    const flags = state.flags;
    if (typeof cond === 'string') return Boolean(flags[cond]);
    const count = (key) => Number(flags[key]) || 0;
    if (cond.flags && !cond.flags.every((k) => flags[k])) return false;
    if (cond.not && cond.not.some((k) => flags[k])) return false;
    if (cond.any && !cond.any.some((k) => flags[k])) return false;
    if (cond.min && !Object.keys(cond.min).every((k) => count(k) >= cond.min[k])) return false;
    if (cond.max && !Object.keys(cond.max).every((k) => count(k) <= cond.max[k])) return false;
    if (cond.trustMin != null && state.trust < cond.trustMin) return false;
    if (cond.trustMax != null && state.trust > cond.trustMax) return false;
    if (cond.heatMin != null && state.heat < cond.heatMin) return false;
    if (cond.heatMax != null && state.heat > cond.heatMax) return false;
    if (cond.songsMin != null && state.stats.songs < cond.songsMin) return false;
    if (cond.anyOf && !cond.anyOf.some((c) => test(state, c))) return false;
    return true;
  }

  // Each slot gets one of its callers per night.
  function ensurePicks(state) {
    const slots = {};
    for (const b of schedule) if (b.slot) (slots[b.slot] = slots[b.slot] || []).push(b.id);
    for (const slot of Object.keys(slots)) {
      const ids = slots[slot];
      if (!ids.includes(state.picks[slot])) {
        state.picks[slot] = ids[Math.floor(random(state) * ids.length)];
      }
    }
  }

  function newNight(seed) {
    const state = {
      version: 1,
      seed: seed >>> 0,
      minute: 0,
      trust: CONFIG.startTrust,
      heat: CONFIG.startHeat,
      flags: {},
      done: {},
      picks: {},
      memo: null,
      songTimes: [],
      randomCount: {},
      lastRandom: false,
      driftAt: 0,
      driftCarry: { trust: 0, heat: 0 },
      current: null,
      log: [],
      stats: { calls: 0, songs: 0, broken: 0, missed: 0, deadAir: 0 },
      ending: null,
    };
    ensurePicks(state);
    return state;
  }

  // Accepts a parsed save; returns a usable state or null.
  function restore(saved) {
    if (!saved || saved.version !== 1 || typeof saved.trust !== 'number') return null;
    const state = { ...newNight(saved.seed || 1), ...saved };
    state.stats = { ...newNight(1).stats, ...saved.stats };
    state.driftCarry = { trust: 0, heat: 0, ...saved.driftCarry };
    ensurePicks(state);
    if (state.current && state.current.kind !== 'end' && !currentEvent(state)) state.current = null;
    return state;
  }

  function inTonight(state, beat) {
    return !beat.slot || state.picks[beat.slot] === beat.id;
  }

  // The event with its matching variant merged in and hidden choices removed.
  function view(state, event) {
    let merged = event;
    if (event.variants) {
      const variant = event.variants.find((v) => test(state, v.when)) || {};
      merged = { ...event, ...variant, when: event.when };
    }
    return { ...merged, choices: (merged.choices || []).filter((c) => test(state, c.when)) };
  }

  function currentEvent(state) {
    const c = state.current;
    if (!c) return null;
    if (c.kind === 'beat') return beats.get(c.id) || null;
    if (c.kind === 'random') return randoms.get(c.id) || null;
    return null;
  }

  function nextScheduled(state, missed) {
    const triggered = triggers.find((b) => !state.done[b.id] && test(state, b.trigger));
    if (triggered) return triggered;
    for (const b of schedule) {
      if (state.done[b.id] || !inTonight(state, b)) continue;
      if (!b.required && state.minute - b.atMin > CONFIG.lateLimit) {
        state.done[b.id] = 'missed';
        state.stats.missed += 1;
        missed.push(b.id);
        continue;
      }
      if (b.when && !test(state, b.when)) {
        state.done[b.id] = 'skipped';
        continue;
      }
      return b;
    }
    return null;
  }

  function pickRandom(state) {
    const pool = RANDOM_EVENTS.filter((e) => (state.randomCount[e.id] || 0) < (e.max ?? 1));
    const total = pool.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    let roll = random(state) * total;
    for (const e of pool) {
      roll -= e.weight ?? 1;
      if (roll < 0) return e;
    }
    return null;
  }

  // Slow change over time, applied between events (fractions carry over).
  function drift(state) {
    const hours = Math.max(0, state.minute - state.driftAt) / 60;
    state.driftAt = Math.max(state.driftAt, state.minute);
    const carry = state.driftCarry;
    carry.trust += hours * CONFIG.drift.trustPerHour;
    carry.heat += hours * CONFIG.drift.heatPerHour;
    const want = { trust: Math.trunc(carry.trust), heat: Math.trunc(carry.heat) };
    carry.trust -= want.trust;
    carry.heat -= want.heat;
    const before = { trust: state.trust, heat: state.heat };
    state.trust = clamp(state.trust + want.trust, 0, 100);
    state.heat = clamp(state.heat + want.heat, 0, 100);
    return { trust: state.trust - before.trust, heat: state.heat - before.heat };
  }

  // Decides what happens next and stores it in state.current:
  // { kind: 'beat' | 'random' | 'end', id, at }. Returns it plus missed ids
  // and the drift applied since the last call.
  function advance(state) {
    const missed = [];
    const drifted = drift(state);
    const next = nextScheduled(state, missed);
    if (state.minute >= NIGHT || !next || (!next.trigger && next.atMin >= NIGHT)) {
      state.current = { kind: 'end', at: NIGHT };
      return { ...state.current, missed, drifted };
    }
    const at = next.trigger ? state.minute : Math.max(state.minute, next.atMin);
    const r = CONFIG.random;
    const randomsSoFar = Object.values(state.randomCount).reduce((a, b) => a + b, 0);
    if (
      !next.trigger &&
      !state.lastRandom &&
      state.minute >= r.notBefore &&
      state.minute <= r.notAfter &&
      randomsSoFar < r.max &&
      random(state) < r.chance
    ) {
      const event = pickRandom(state);
      if (event) {
        state.lastRandom = true;
        state.current = { kind: 'random', id: event.id, at: (state.minute + at) / 2 };
        return { ...state.current, missed, drifted };
      }
    }
    state.lastRandom = false;
    state.current = { kind: 'beat', id: next.id, at };
    return { ...state.current, missed, drifted };
  }

  function applyFlags(state, fx) {
    if (Array.isArray(fx.set)) for (const k of fx.set) state.flags[k] = true;
    else if (fx.set) Object.assign(state.flags, fx.set);
    if (fx.add) {
      for (const k of Object.keys(fx.add))
        state.flags[k] = (Number(state.flags[k]) || 0) + fx.add[k];
    }
    if (fx.log) state.log.push({ at: Math.floor(state.minute), text: fx.log });
  }

  function breaksMemo(state, choice) {
    const memo = state.memo;
    return Boolean(memo && (choice.tags || []).some((t) => memo.forbid.includes(t)));
  }

  // A call was handled while a memo is in force: punish breaches, count down.
  function memoStep(state, tags, delta, notes) {
    const memo = state.memo;
    if (!memo) return;
    if (tags.some((t) => memo.forbid.includes(t))) {
      delta.heat += memo.penalty;
      memo.broken += 1;
      state.stats.broken += 1;
      notes.push({ key: 'memoBroken', n: memo.penalty });
    }
    memo.left -= 1;
    if (memo.left <= 0) {
      if (memo.broken === 0) {
        delta.heat += CONFIG.memoKeptHeat;
        notes.push({ key: 'memoKept', n: CONFIG.memoKeptHeat });
      } else {
        notes.push({ key: 'memoLapsed' });
      }
      state.memo = null;
    }
  }

  function songsInWindow(state) {
    return state.songTimes.filter((t) => state.minute - t < CONFIG.song.windowMinutes).length;
  }

  function nextSongCost(state) {
    return songsInWindow(state) * CONFIG.song.trustPerExtra;
  }

  function songEffects(state, delta, notes) {
    const cost = nextSongCost(state);
    state.songTimes = state.songTimes.filter((t) => state.minute - t < CONFIG.song.windowMinutes);
    state.songTimes.push(state.minute);
    state.stats.songs += 1;
    delta.heat += CONFIG.song.heat;
    if (cost > 0) {
      delta.trust -= cost;
      notes.push({ key: 'songTired', n: -cost });
    }
  }

  function commit(state, delta, minutes, event) {
    const before = { trust: state.trust, heat: state.heat };
    state.trust = clamp(Math.round(state.trust + delta.trust), 0, 100);
    state.heat = clamp(Math.round(state.heat + delta.heat), 0, 100);
    state.minute = Math.min(state.minute + minutes, NIGHT);
    if (event && event.random) {
      state.randomCount[event.id] = (state.randomCount[event.id] || 0) + 1;
    } else if (event) {
      state.done[event.id] = 'done';
    }
    state.current = null;
    return { trust: state.trust - before.trust, heat: state.heat - before.heat };
  }

  function choose(state, index) {
    const event = currentEvent(state);
    if (!event) throw new Error('Nothing to choose: no current event');
    const v = view(state, event);
    const choice = v.choices[index];
    if (!choice) throw new Error(`No choice ${index} for ${event.id}`);
    const delta = { trust: choice.trust || 0, heat: choice.heat || 0 };
    const notes = [];
    if (v.type === 'call') {
      if (!event.random) memoStep(state, choice.tags || [], delta, notes);
      state.stats.calls += 1;
    }
    applyFlags(state, choice);
    if (v.type === 'memo' && v.rule) {
      state.memo = {
        id: event.id,
        forbid: v.rule.forbid,
        penalty: v.rule.penalty ?? CONFIG.memoPenalty,
        left: v.rule.calls,
        broken: 0,
        summary: v.rule.summary,
      };
    }
    let minutes = CONFIG.callMinutes;
    if (event.random) minutes = CONFIG.randomMinutes;
    else if (v.type === 'memo') minutes = CONFIG.memoMinutes;
    const real = commit(state, delta, choice.time ?? minutes, event);
    return { text: choice.result, music: Boolean(choice.music), delta: real, notes };
  }

  // The caller is cut off (withSong) or left ringing (no song).
  function cut(state, withSong) {
    const event = currentEvent(state);
    if (!event) throw new Error('Nothing to cut: no current event');
    const fx = view(state, event).cut || CONFIG.defaultCut;
    const delta = { trust: fx.trust || 0, heat: fx.heat || 0 };
    const notes = [];
    if (!event.random) memoStep(state, [], delta, notes);
    applyFlags(state, fx);
    if (withSong) songEffects(state, delta, notes);
    const minutes = withSong ? CONFIG.song.minutes : CONFIG.cutMinutes;
    const real = commit(state, delta, minutes, event);
    return { text: fx.result || null, delta: real, notes };
  }

  // A record between calls. Whatever was planned next gets re-planned.
  function playSong(state) {
    const delta = { trust: 0, heat: 0 };
    const notes = [];
    songEffects(state, delta, notes);
    const real = commit(state, delta, CONFIG.song.minutes, null);
    return { text: null, delta: real, notes };
  }

  function resolveStatic(state, success) {
    const event = currentEvent(state);
    const fx = success ? event.success : event.fail;
    const delta = { trust: fx.trust || 0, heat: fx.heat || 0 };
    applyFlags(state, fx);
    const real = commit(state, delta, CONFIG.randomMinutes, event);
    return { text: fx.result, delta: real, notes: [] };
  }

  function deadAir(state) {
    const before = state.trust;
    state.trust = clamp(state.trust + CONFIG.deadAir.trust, 0, 100);
    state.stats.deadAir += 1;
    return state.trust - before;
  }

  function characterCalls(state, character) {
    return events.filter((b) => b.character === character && state.done[b.id] === 'done').length;
  }

  function meterEnding(state) {
    if (state.heat >= 100) return 'offAir';
    if (state.trust <= 0) return 'silence';
    return null;
  }

  function finalEnding(state) {
    const bad = meterEnding(state);
    if (bad) return bad;
    const ending = ENDINGS.find((e) => e.kind !== 'bad' && test(state, e.when));
    return ending ? ending.id : ENDINGS[ENDINGS.length - 1].id;
  }

  function finish(state, id) {
    state.ending = { id, minute: state.minute };
    state.current = null;
    return state.ending;
  }

  function endingById(id) {
    return ENDINGS.find((e) => e.id === id) || ENDINGS[ENDINGS.length - 1];
  }

  function epilogues(state) {
    const out = [];
    for (const entry of EPILOGUES) {
      const v = entry.variants.find((x) => test(state, x.when));
      if (v) out.push({ who: entry.who, text: v.text });
    }
    return out;
  }

  // Sanity checks for callers.js. Returns a list of human-readable problems.
  function validate() {
    const problems = [];
    const ids = new Set();
    const check = (ok, message) => {
      if (!ok) problems.push(message);
    };
    const checkChoice = (where, c) => {
      check(typeof c.label === 'string' && c.label, `${where}: a choice has no label`);
      check(typeof c.result === 'string' && c.result, `${where}: "${c.label}" has no result`);
    };
    for (const e of [...events, ...RANDOM_EVENTS]) {
      check(e.id, 'An entry has no id');
      check(!ids.has(e.id), `Duplicate id "${e.id}"`);
      ids.add(e.id);
      if (!RANDOM_EVENTS.includes(e) && !e.trigger) {
        check(!Number.isNaN(e.atMin), `${e.id}: bad time "${e.at}" (use 'HH:MM')`);
        check(e.atMin < NIGHT, `${e.id}: ${e.at} is after 06:00`);
      }
      if (e.type === 'static') {
        check(e.success && e.fail, `${e.id}: a static event needs success and fail`);
        continue;
      }
      const views = e.variants ? e.variants.map((v) => ({ ...e, ...v })) : [e];
      check(
        !e.variants || !e.variants[e.variants.length - 1].when,
        `${e.id}: last variant needs no "when"`,
      );
      for (const v of views) {
        check(typeof v.text === 'string' && v.text, `${e.id}: a variant has no text`);
        const choices = v.choices || [];
        check(choices.length >= 2, `${e.id}: needs at least 2 choices`);
        check(
          choices.filter((c) => !c.when).length <= 3,
          `${e.id}: more than 3 choices always shown`,
        );
        choices.forEach((c) => checkChoice(e.id, c));
      }
    }
    for (const id of ['offAir', 'silence'])
      check(
        ENDINGS.some((e) => e.id === id),
        `Missing ending "${id}"`,
      );
    check(!ENDINGS[ENDINGS.length - 1].when, 'The last ending must have no "when" (the default)');
    return problems;
  }

  return {
    toMinutes,
    clockText,
    test,
    newNight,
    restore,
    view,
    currentEvent,
    advance,
    breaksMemo,
    nextSongCost,
    choose,
    cut,
    playSong,
    resolveStatic,
    deadAir,
    characterCalls,
    meterEnding,
    finalEnding,
    finish,
    endingById,
    epilogues,
    validate,
    events,
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// Sound: everything is synthesised; nothing is loaded.
// ─────────────────────────────────────────────────────────────────────────────

function createSound() {
  let ctx = null;
  let mix = null;
  let out = null;
  let analyser = null;
  let hum = null;
  let noiseBuffer = null;
  let crackleBuffer = null;
  let muted = false;
  const samples = new Float32Array(1024);
  const silent = () => {};

  const PROGRESSIONS = [
    {
      bpm: 92,
      chords: [
        [57, 60, 64],
        [53, 57, 60],
        [55, 60, 64],
        [55, 59, 62],
      ],
      bass: [45, 41, 36, 43],
    },
    {
      bpm: 84,
      chords: [
        [57, 62, 65],
        [55, 59, 62],
        [55, 60, 64],
        [57, 60, 64],
      ],
      bass: [38, 43, 36, 45],
    },
    {
      bpm: 104,
      chords: [
        [55, 60, 64],
        [57, 60, 64],
        [57, 62, 65],
        [55, 59, 62],
      ],
      bass: [36, 45, 38, 43],
    },
    {
      bpm: 76,
      chords: [
        [55, 59, 64],
        [55, 60, 64],
        [55, 59, 62],
        [54, 57, 62],
      ],
      bass: [40, 36, 43, 38],
    },
  ];
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function makeBuffer(seconds, sample) {
    const buffer = ctx.createBuffer(1, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = sample();
    return buffer;
  }

  function gainNode(value, dest = mix) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  function oscNode(type, freq, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest);
    return o;
  }

  function filterNode(type, freq, q, dest) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  function noiseNode(dest, buffer = noiseBuffer) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.connect(dest);
    return s;
  }

  function burst(dest, at, seconds) {
    const s = noiseNode(dest);
    s.start(at, Math.random() * 1.5);
    s.stop(at + seconds);
  }

  // Silence → peak after `attack` → silence again at `end`.
  function envelope(param, at, peak, attack, end) {
    param.setValueAtTime(0.0001, at);
    param.exponentialRampToValueAtTime(peak, at + attack);
    param.exponentialRampToValueAtTime(0.0001, end);
  }

  function fadeTo(g, value, seconds) {
    const n = ctx.currentTime;
    g.gain.cancelScheduledValues(n);
    g.gain.setValueAtTime(g.gain.value, n);
    g.gain.linearRampToValueAtTime(value, n + seconds);
  }

  function init() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    mix = ctx.createGain();
    mix.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    analyser = ctx.createAnalyser();
    analyser.fftSize = samples.length;
    out = ctx.createGain();
    out.gain.value = muted ? 0 : 1;
    mix.connect(comp);
    comp.connect(analyser);
    analyser.connect(out);
    out.connect(ctx.destination);

    noiseBuffer = makeBuffer(2, () => Math.random() * 2 - 1);
    let pop = 0;
    crackleBuffer = makeBuffer(3, () => {
      pop *= 0.55;
      if (Math.random() < 0.0004) pop = Math.random() * 2 - 1;
      return pop + (Math.random() * 2 - 1) * 0.012;
    });

    // Mains hum (50 Hz in Prague), tape hiss and room tone.
    hum = gainNode(0);
    for (const [f, v] of [
      [50, 0.018],
      [100, 0.011],
      [150, 0.005],
      [250, 0.002],
    ]) {
      oscNode('sine', f, gainNode(v, hum)).start();
    }
    noiseNode(filterNode('highpass', 3500, 0.5, gainNode(0.005, hum))).start();
    noiseNode(filterNode('lowpass', 260, 0.5, gainNode(0.03, hum))).start();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(silent);
  }

  function suspend(paused) {
    if (!ctx) return;
    (paused ? ctx.suspend() : ctx.resume()).catch(silent);
  }

  function setMuted(value) {
    muted = value;
    if (out) out.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  }

  function level() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    return Math.sqrt(sum / samples.length);
  }

  function humOn() {
    if (ctx) fadeTo(hum, 1, 1.2);
  }

  function humOff() {
    if (ctx) fadeTo(hum, 0, 1.5);
  }

  function humDip(seconds) {
    if (!ctx) return;
    const n = ctx.currentTime;
    hum.gain.cancelScheduledValues(n);
    hum.gain.setValueAtTime(hum.gain.value, n);
    hum.gain.linearRampToValueAtTime(0, n + 0.06);
    hum.gain.setValueAtTime(0, n + seconds);
    hum.gain.linearRampToValueAtTime(1, n + seconds + 0.8);
  }

  // An old bell telephone: two bursts of a clapper hammering two bells.
  function ring() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const env = gainNode(0);
    const am = gainNode(0.5, env);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(am.gain);
    const bells = [
      [1180, 'triangle', 0.5],
      [1520, 'triangle', 0.32],
      [2360, 'sine', 0.1],
    ].map(([f, type, v]) => oscNode(type, f, gainNode(v, am)));
    for (const [start, len] of [
      [0, 0.42],
      [0.6, 0.42],
    ]) {
      env.gain.setValueAtTime(0, t + start);
      env.gain.linearRampToValueAtTime(0.13, t + start + 0.015);
      env.gain.setValueAtTime(0.13, t + start + len - 0.04);
      env.gain.linearRampToValueAtTime(0, t + start + len);
    }
    for (const o of [lfo, ...bells]) {
      o.start(t);
      o.stop(t + 1.1);
    }
  }

  function click() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    envelope(g.gain, t, 0.35, 0.002, t + 0.04);
    burst(filterNode('highpass', 1800, 0.7, g), t, 0.05);
  }

  function paper() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 14; i += 1) {
      g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.1, t + 0.02 + i * 0.035);
    }
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    burst(filterNode('bandpass', 2600, 0.7, g), t, 0.65);
  }

  function tick() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    envelope(g.gain, t, 0.1, 0.001, t + 0.035);
    burst(filterNode('bandpass', 1800 + Math.random() * 1500, 2, g), t, 0.04);
  }

  // A muffled voice down a phone line, like the adults in old cartoons.
  function voice() {
    if (!ctx) return silent;
    const t = ctx.currentTime;
    const env = gainNode(0, filterNode('lowpass', 3000, 0.7, mix));
    const o = oscNode('sawtooth', 140, filterNode('bandpass', 900, 1.2, env));
    const base = 105 + Math.random() * 80;
    for (let at = t; at < t + 30; at += 0.08 + Math.random() * 0.14) {
      const loud = Math.random() < 0.18 ? 0 : 0.03 + Math.random() * 0.035;
      env.gain.setTargetAtTime(loud, at, 0.02);
      o.frequency.setTargetAtTime(base * (0.85 + Math.random() * 0.35), at, 0.04);
    }
    o.start(t);
    o.stop(t + 30);
    return () => {
      fadeTo(env, 0, 0.08);
      o.stop(ctx.currentTime + 0.1);
    };
  }

  function breath() {
    if (!ctx) return silent;
    const t = ctx.currentTime;
    const g = gainNode(0);
    const src = noiseNode(filterNode('bandpass', 520, 0.9, g));
    for (let c = 0; c < 10; c += 1) {
      const s = t + 0.4 + c * 3.2;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.07, s + 1.3);
      g.gain.linearRampToValueAtTime(0, s + 2.9);
    }
    src.start(t);
    src.stop(t + 34);
    return () => {
      fadeTo(g, 0, 0.2);
      src.stop(ctx.currentTime + 0.3);
    };
  }

  // A crowd murmuring and a hundred thousand keys jingling.
  function keys(seconds = 4) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const crowd = gainNode(0);
    crowd.gain.setTargetAtTime(0.07, t, 0.3);
    crowd.gain.setTargetAtTime(0, t + seconds, 0.4);
    burst(filterNode('lowpass', 700, 0.5, crowd), t, seconds + 2);
    for (let i = 0; i < seconds * 40; i += 1) {
      const at = t + Math.random() * seconds;
      const g = gainNode(0);
      envelope(g.gain, at, 0.015 + Math.random() * 0.02, 0.003, at + 0.08 + Math.random() * 0.1);
      const o = oscNode('sine', 2500 + Math.random() * 5000, g);
      o.start(at);
      o.stop(at + 0.25);
    }
  }

  function staticNoise() {
    if (!ctx) return silent;
    const t = ctx.currentTime;
    const g = gainNode(0);
    const src = noiseNode(filterNode('bandpass', 1600, 0.4, g));
    for (let i = 0; i < 300; i += 1) {
      const peak = Math.random() < 0.15 ? 0.32 : 0.14;
      g.gain.setValueAtTime(0.05 + Math.random() * peak, t + i * 0.04);
    }
    const crackle = noiseNode(gainNode(0.8, g), crackleBuffer);
    src.start(t);
    crackle.start(t);
    src.stop(t + 12);
    crackle.stop(t + 12);
    return () => {
      fadeTo(g, 0, 0.15);
      src.stop(ctx.currentTime + 0.2);
      crackle.stop(ctx.currentTime + 0.2);
    };
  }

  // Static swelling up and dying away, for the end of a broadcast.
  function staticSwell(seconds) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + seconds * 0.4);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    burst(filterNode('bandpass', 1400, 0.4, g), t, seconds);
  }

  // A whistling sweep across the band, landing on the station.
  function tune(seconds = 1.3) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.setValueAtTime(0.05, t + seconds - 0.3);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    const o = oscNode('sine', 2400, g);
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(260, t + seconds * 0.55);
    o.frequency.exponentialRampToValueAtTime(900, t + seconds);
    o.start(t);
    o.stop(t + seconds);
    const ng = gainNode(0);
    envelope(ng.gain, t, 0.18, 0.05, t + seconds);
    const f = filterNode('bandpass', 3000, 3, ng);
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(400, t + seconds * 0.6);
    f.frequency.exponentialRampToValueAtTime(1200, t + seconds);
    burst(f, t, seconds);
  }

  // A short, procedurally composed record: pad, bass, melody, brushes, crackle.
  function record(seconds) {
    if (!ctx) return silent;
    const song = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    const start = ctx.currentTime + 0.35;
    const end = start + Math.max(1.5, seconds - 0.4);
    const bus = gainNode(
      0,
      filterNode('lowpass', 2600, 0.5, filterNode('highpass', 120, 0.5, mix)),
    );
    bus.gain.setValueAtTime(0, start);
    bus.gain.linearRampToValueAtTime(0.6, start + 0.5);
    bus.gain.setValueAtTime(0.6, end - 0.9);
    bus.gain.linearRampToValueAtTime(0, end);
    const crackle = gainNode(0);
    crackle.gain.setValueAtTime(0, start - 0.3);
    crackle.gain.linearRampToValueAtTime(0.5, start - 0.25);
    crackle.gain.setValueAtTime(0.5, end - 0.3);
    crackle.gain.linearRampToValueAtTime(0, end + 0.2);
    const sources = [];
    const vinyl = noiseNode(crackle, crackleBuffer);
    vinyl.start(start - 0.3);
    vinyl.stop(end + 0.3);
    sources.push(vinyl);

    const beat = 60 / song.bpm;
    for (let bar = 0, t = start; t < end - 0.2; bar += 1, t += beat * 2) {
      const chord = song.chords[bar % 4];
      for (const note of chord) {
        const g = gainNode(0, bus);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.06);
        g.gain.setTargetAtTime(0, t + beat * 2 - 0.08, 0.1);
        const o = oscNode('triangle', hz(note), g);
        o.detune.value = (Math.random() - 0.5) * 10;
        o.start(t);
        o.stop(t + beat * 2 + 0.5);
        sources.push(o);
      }
      for (let b = 0; b < 2; b += 1) {
        const at = t + b * beat;
        const g = gainNode(0, bus);
        envelope(g.gain, at, 0.2, 0.01, at + beat * 0.9);
        const o = oscNode('sine', hz(song.bass[bar % 4]), g);
        o.start(at);
        o.stop(at + beat);
        sources.push(o);
      }
      for (let step = 0; step < 4; step += 1) {
        if (Math.random() < 0.3) continue;
        const at = t + (step * beat) / 2;
        const g = gainNode(0, bus);
        envelope(g.gain, at, 0.08, 0.015, at + beat * 0.48);
        const o = oscNode('triangle', hz(chord[Math.floor(Math.random() * chord.length)] + 12), g);
        o.start(at);
        o.stop(at + beat * 0.5);
        sources.push(o);
      }
      const brush = gainNode(0, bus);
      envelope(brush.gain, t + beat, 0.06, 0.005, t + beat + 0.14);
      const s = noiseNode(filterNode('highpass', 5000, 0.7, brush));
      s.start(t + beat, Math.random());
      s.stop(t + beat + 0.16);
      sources.push(s);
    }
    return () => {
      fadeTo(bus, 0, 0.2);
      fadeTo(crackle, 0, 0.2);
      const n = ctx.currentTime;
      for (const src of sources) {
        try {
          src.stop(n + 0.25);
        } catch {
          // Already stopped.
        }
      }
    };
  }

  // The six pips of the time signal.
  function pips() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    for (let i = 0; i < 6; i += 1) {
      const s = t + i;
      const len = i === 5 ? 0.5 : 0.1;
      const g = gainNode(0);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.14, s + 0.005);
      g.gain.setValueAtTime(0.14, s + len - 0.005);
      g.gain.linearRampToValueAtTime(0, s + len);
      const o = oscNode('sine', 1000, g);
      o.start(s);
      o.stop(s + len + 0.01);
    }
  }

  function testTone(seconds) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0.1);
    const o = oscNode('sine', 1000, g);
    o.start(t);
    o.stop(t + seconds);
  }

  function deadAir() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    envelope(g.gain, t, 0.07, 0.02, t + 0.6);
    const o = oscNode('sine', 520, g);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.55);
    o.start(t);
    o.stop(t + 0.6);
  }

  function thunk() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = gainNode(0);
    envelope(g.gain, t, 0.5, 0.005, t + 0.45);
    const o = oscNode('sine', 90, g);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    o.start(t);
    o.stop(t + 0.5);
    const n = gainNode(0);
    envelope(n.gain, t, 0.3, 0.003, t + 0.2);
    burst(filterNode('lowpass', 300, 0.7, n), t, 0.25);
  }

  return {
    init,
    resume,
    suspend,
    setMuted,
    level,
    humOn,
    humOff,
    humDip,
    ring,
    click,
    paper,
    tick,
    voice,
    breath,
    keys,
    staticNoise,
    staticSwell,
    tune,
    record,
    pips,
    testTone,
    deadAir,
    thunk,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

function startGame() {
  const params = new URLSearchParams(window.location.search);
  const SPEED = Math.min(50, Math.max(0.25, Number(params.get('speed')) || 1));
  const FIXED_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
  const SAVE_KEY = 'deadAir.night.v1';
  const FOUND_KEY = 'deadAir.endings.v1';
  const MUTE_KEY = 'deadAir.muted.v1';
  const VU_REF = 0.25; // RMS level that reads 0 VU

  const $ = (id) => document.getElementById(id);
  const el = {
    room: $('room'),
    clockH: $('clockH'),
    clockM: $('clockM'),
    onAir: $('onAir'),
    vuNeedle: $('vuNeedle'),
    vuScale: $('vuScale'),
    trustBar: $('trustBar'),
    trustValue: $('trustValue'),
    trustDelta: $('trustDelta'),
    tallyCalls: $('tallyCalls'),
    tallySongs: $('tallySongs'),
    tallyBroken: $('tallyBroken'),
    heatBar: $('heatBar'),
    heatValue: $('heatValue'),
    heatDelta: $('heatDelta'),
    memoPin: $('memoPin'),
    memoPinText: $('memoPinText'),
    memoPinLeft: $('memoPinLeft'),
    lamps: Array.from(document.querySelectorAll('.lamp')),
    lineStatus: $('lineStatus'),
    btnPickUp: $('btnPickUp'),
    card: $('card'),
    cardKicker: $('cardKicker'),
    cardName: $('cardName'),
    cardPlace: $('cardPlace'),
    cardBadge: $('cardBadge'),
    cardStamp: $('cardStamp'),
    cardText: $('cardText'),
    cardResult: $('cardResult'),
    cardNotes: $('cardNotes'),
    choices: $('choices'),
    deadAir: $('deadAir'),
    deadAirFill: $('deadAirFill'),
    deadAirLabel: $('deadAirLabel'),
    tunerScale: $('tunerScale'),
    tunerPointer: $('tunerPointer'),
    tunerKnob: $('tunerKnob'),
    tunerFreq: $('tunerFreq'),
    tunerHint: $('tunerHint'),
    platter: $('platter'),
    tonearm: $('tonearm'),
    btnRecord: $('btnRecord'),
    recordLabel: $('recordLabel'),
    recordInfo: $('recordInfo'),
    log: $('eventLog'),
    btnMute: $('btnMute'),
    btnPause: $('btnPause'),
    btnNew: $('btnNew'),
    titleScreen: $('titleScreen'),
    titleIntro: $('titleIntro'),
    titleHowTo: $('titleHowTo'),
    titleStatus: $('titleStatus'),
    btnStart: $('btnStart'),
    btnTitleNew: $('btnTitleNew'),
    endScreen: $('endScreen'),
    endKicker: $('endKicker'),
    endTitle: $('endTitle'),
    endText: $('endText'),
    endMeters: $('endMeters'),
    endDid: $('endDid'),
    endFates: $('endFates'),
    endStats: $('endStats'),
    endFound: $('endFound'),
    endFoundList: $('endFoundList'),
    endHistory: $('endHistory'),
    btnEndNew: $('btnEndNew'),
    pauseScreen: $('pauseScreen'),
    btnResume: $('btnResume'),
    staticCanvas: $('staticCanvas'),
  };

  // ── Strings ───────────────────────────────────────────────────────────────
  const plural = new Intl.PluralRules(STRINGS.locale || 'en');
  const format = (text, vars = {}) =>
    String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  function t(key, vars = {}) {
    let s = STRINGS[key];
    if (s == null) {
      console.warn(`Dead Air: missing string "${key}"`);
      return key;
    }
    if (typeof s === 'object' && !Array.isArray(s)) s = s[plural.select(vars.n ?? 0)] ?? s.other;
    return format(s, vars);
  }
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function applyStrings() {
    document.title = t('title');
    for (const node of document.querySelectorAll('[data-i18n]'))
      node.textContent = t(node.dataset.i18n);
    for (const node of document.querySelectorAll('[data-i18n-label]')) {
      node.setAttribute('aria-label', t(node.dataset.i18nLabel));
      node.title = t(node.dataset.i18nLabel);
    }
    el.titleIntro.replaceChildren(...STRINGS.intro.map((p) => h('p', '', p)));
    el.titleHowTo.replaceChildren(...STRINGS.howTo.map((p) => h('li', '', p)));
  }

  // ── Storage ───────────────────────────────────────────────────────────────
  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or storage disabled: the night just won't be saved.
    }
  }
  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ── Static decoration ─────────────────────────────────────────────────────
  // VU needle angle for a level relative to 0 VU (a real VU scale is linear in volts).
  const vuAngle = (ratio) => -48 + 96 * clamp((ratio - 0.1) / (1.413 - 0.1), 0, 1);

  function buildDecor() {
    for (const db of [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]) {
      const tick = h('span', db >= 0 ? 'vu-tick hot' : 'vu-tick');
      tick.style.setProperty('--a', `${vuAngle(10 ** (db / 20)).toFixed(1)}deg`);
      tick.append(h('b', '', db > 0 ? `+${db}` : String(db)));
      el.vuScale.append(tick);
    }
    for (const bar of [el.trustBar, el.heatBar]) {
      for (let i = 0; i < 20; i += 1) bar.append(h('i'));
    }
    for (let f = 66; f <= 73; f += 0.5) {
      const mark = h('span', Number.isInteger(f) ? 'tuner-mark major' : 'tuner-mark');
      mark.style.left = `${((f - 65.6) / 7.8) * 100}%`;
      if (Number.isInteger(f)) mark.append(h('b', '', String(f)));
      el.tunerScale.append(mark);
    }
  }

  // ── Time: everything waits on a game clock that pauses and scales ─────────
  let paused = false;
  let now = 0;
  let timers = [];
  let waiter = null;
  const stoppers = new Set();

  function sleep(seconds) {
    return new Promise((resolve) => timers.push({ at: now + seconds, resolve }));
  }

  // Wait for one of the given player actions, or a timeout.
  function expect(types, timeout) {
    return new Promise((resolve) => {
      const w = { types, resolve };
      waiter = w;
      if (timeout != null) {
        sleep(timeout).then(() => {
          if (waiter === w) {
            waiter = null;
            resolve({ type: 'timeout' });
          }
        });
      }
    });
  }

  function act(action) {
    if (!waiter || !waiter.types.includes(action.type)) return false;
    const w = waiter;
    waiter = null;
    w.resolve(action);
    return true;
  }

  // Keeps a stop function so an abandoned night can silence its sounds.
  function track(stop) {
    let done = false;
    const wrapped = () => {
      if (done) return;
      done = true;
      stoppers.delete(wrapped);
      stop();
    };
    stoppers.add(wrapped);
    return wrapped;
  }

  // ── Game state and rendering ──────────────────────────────────────────────
  const sound = createSound();
  let state = Engine.restore(load(SAVE_KEY));
  let phase = 'title';
  let eventType = null;
  let runId = 0;
  let queuedSong = false;
  let skipTyping = false;
  let deadAirArmed = false;
  let deadAirTime = 0;
  let deadAirFlash = 0;
  let shownMinute = state ? state.minute : 0;
  let needle = -48;
  let freq = 69.8;
  let freqTarget = 69.8;
  let staticLevel = 0;
  let staticTarget = 0;
  let ffActive = false;
  let muted = load(MUTE_KEY) === true;

  const persist = () => {
    if (state) store(SAVE_KEY, state);
  };

  function setPhase(next, type = eventType) {
    phase = next;
    eventType = type;
    document.body.dataset.phase = next;
    const callish = type === 'call';
    const onLine = callish && (next === 'typing' || next === 'decide');
    el.btnPickUp.disabled = next !== 'ringing';
    el.btnRecord.disabled = !(next === 'idle' || (callish && next === 'ringing') || onLine);
    let label = 'record';
    if (callish && next === 'ringing') label = 'recordLetRing';
    else if (onLine) label = 'recordCut';
    el.recordLabel.textContent = t(label);
    el.lamps[0].classList.toggle('ringing', next === 'ringing');
    el.lamps[0].classList.toggle('busy', onLine);
    let status = 'lineQuiet';
    if (next === 'ringing') status = 'lineRinging';
    else if (onLine) status = 'lineOpen';
    else if (next === 'song') status = 'lineSong';
    else if (type === 'memo' && next !== 'idle') status = 'lineMemo';
    el.lineStatus.textContent = t(status);
    if (next !== 'decide') el.deadAir.classList.remove('show');
  }

  function setBar(bar, value) {
    const lit = Math.round(value / 5);
    Array.from(bar.children).forEach((seg, i) => seg.classList.toggle('on', i < lit));
  }

  function renderMeters() {
    if (!state) return;
    el.tallyCalls.textContent = String(state.stats.calls).padStart(2, '0');
    el.tallySongs.textContent = String(state.stats.songs).padStart(2, '0');
    el.tallyBroken.textContent = String(state.stats.broken).padStart(2, '0');
    setBar(el.trustBar, state.trust);
    setBar(el.heatBar, state.heat);
    el.trustValue.textContent = String(state.trust);
    el.heatValue.textContent = String(state.heat);
    el.room.classList.toggle('danger-heat', state.heat >= 80);
    el.room.classList.toggle('danger-trust', state.trust <= 20);
  }

  function showDelta(node, n) {
    if (!n) return;
    node.textContent = signed(n);
    node.classList.remove('pop', 'up', 'down');
    void node.offsetWidth; // restart the animation
    node.classList.add('pop', n > 0 ? 'up' : 'down');
  }

  function updatePin() {
    const memo = state && state.memo;
    el.memoPin.hidden = !memo;
    if (memo) {
      el.memoPinText.textContent = memo.summary;
      el.memoPinLeft.textContent = t('memoLeft', { n: memo.left });
    }
  }

  function updateRecordInfo() {
    if (!state) return;
    const cost = Engine.nextSongCost(state);
    el.recordInfo.textContent = `${t('recordCount', { n: state.stats.songs })} · ${
      cost ? t('recordCost', { n: cost }) : t('recordFree')
    }`;
    el.recordInfo.classList.toggle('costly', cost > 0);
  }

  function renderAll() {
    renderMeters();
    updatePin();
    updateRecordInfo();
    shownMinute = state ? state.minute : 0;
  }

  function logLine(label, delta) {
    const li = h('li');
    li.append(h('time', '', Engine.clockText(state.minute)), h('span', 'log-label', label));
    if (delta && delta.trust)
      li.append(
        h('b', delta.trust > 0 ? 'good' : 'bad', t('deltaTrust', { n: signed(delta.trust) })),
      );
    if (delta && delta.heat)
      li.append(h('b', delta.heat > 0 ? 'bad' : 'good', t('deltaHeat', { n: signed(delta.heat) })));
    el.log.prepend(li);
    while (el.log.children.length > 6) el.log.lastElementChild.remove();
  }

  function showCard({
    kind,
    kicker = '',
    name = '',
    place = '',
    badge = '',
    stamp = '',
    text = '',
  }) {
    el.card.className = `card card-${kind}`;
    el.cardKicker.textContent = kicker;
    el.cardName.textContent = name;
    el.cardPlace.textContent = place;
    el.cardBadge.textContent = badge;
    el.cardBadge.hidden = !badge;
    el.cardStamp.textContent = stamp;
    el.cardStamp.hidden = !stamp;
    el.cardText.textContent = text;
    el.cardResult.textContent = '';
    el.cardResult.hidden = true;
    el.cardNotes.replaceChildren();
  }

  function idleCard() {
    showCard({ kind: 'idle', kicker: t('onAir'), text: t('idleCard') });
  }

  function renderChoices(choices) {
    el.choices.replaceChildren(
      ...choices.map((choice, i) => {
        const button = h('button', 'choice');
        button.type = 'button';
        button.append(h('kbd', '', String(i + 1)), h('span', 'choice-label', choice.label));
        if (Engine.breaksMemo(state, choice)) {
          button.classList.add('violates');
          button.append(h('em', 'choice-warn', t('memoBreaks')));
        }
        button.addEventListener('click', () => act({ type: 'choice', index: i }));
        return button;
      }),
    );
  }

  function renderContinue() {
    const button = h('button', 'choice continue');
    button.type = 'button';
    button.append(h('kbd', '', '␣'), h('span', 'choice-label', t('continue')));
    button.addEventListener('click', () => act({ type: 'continue' }));
    el.choices.replaceChildren(button);
  }

  function chip(text, tone) {
    return h('span', `chip ${tone}`, text);
  }

  function showOutcome(res, fallback) {
    el.cardResult.textContent = res.text || fallback || '';
    el.cardResult.hidden = !el.cardResult.textContent;
    const chips = [];
    if (res.delta.trust) {
      chips.push(
        chip(t('deltaTrust', { n: signed(res.delta.trust) }), res.delta.trust > 0 ? 'good' : 'bad'),
      );
    }
    if (res.delta.heat) {
      chips.push(
        chip(t('deltaHeat', { n: signed(res.delta.heat) }), res.delta.heat > 0 ? 'bad' : 'good'),
      );
    }
    for (const note of res.notes) {
      chips.push(
        chip(t(note.key, { n: signed(note.n ?? 0) }), note.key === 'memoKept' ? 'good' : 'warn'),
      );
    }
    el.cardNotes.replaceChildren(...chips);
    showDelta(el.trustDelta, res.delta.trust);
    showDelta(el.heatDelta, res.delta.heat);
    renderMeters();
    updatePin();
    updateRecordInfo();
  }

  async function showResult(res, fallback, logLabel) {
    showOutcome(res, fallback);
    await settle(res, logLabel);
  }

  // After an outcome is on screen: log it, save, and wait for Continue.
  async function settle(res, logLabel) {
    logLine(logLabel, res.delta);
    persist();
    if (Engine.meterEnding(state)) {
      el.choices.replaceChildren();
      setPhase('result', null);
      await sleep(2.4);
      return;
    }
    setPhase('result', null);
    renderContinue();
    await expect(['continue']);
    el.choices.replaceChildren();
  }

  async function typewrite(text, { voice = false, ticks = false } = {}) {
    const node = document.createTextNode('');
    const caret = h('span', 'caret');
    el.cardText.replaceChildren(node, caret);
    skipTyping = false;
    const stopVoice = voice ? track(sound.voice()) : null;
    const start = now;
    let shown = 0;
    let ticked = 0;
    while (shown < text.length) {
      await sleep(0);
      shown = skipTyping
        ? text.length
        : Math.min(text.length, Math.floor((now - start) * CONFIG.typeCharsPerSecond));
      node.data = text.slice(0, shown);
      if (ticks && shown - ticked >= 3) {
        ticked = shown;
        sound.tick();
      }
    }
    if (stopVoice) stopVoice();
    caret.remove();
  }

  function startRinging() {
    let ringing = true;
    (async () => {
      while (ringing) {
        sound.ring();
        await sleep(2.4);
      }
    })();
    return () => {
      ringing = false;
    };
  }

  async function spinRecord(seconds) {
    el.platter.classList.add('spinning');
    el.tonearm.classList.add('playing');
    const stop = track(sound.record(seconds));
    await sleep(seconds);
    stop();
    el.platter.classList.remove('spinning');
    el.tonearm.classList.remove('playing');
  }

  async function fastForward(to) {
    const from = state.minute;
    if (to <= from) {
      await sleep(CONFIG.ffMinSeconds);
      return;
    }
    const duration = clamp(
      (to - from) / CONFIG.ffMinutesPerSecond,
      CONFIG.ffMinSeconds,
      CONFIG.ffMaxSeconds,
    );
    const start = now;
    ffActive = true;
    while (now - start < duration && !queuedSong) {
      await sleep(0);
      state.minute = from + (to - from) * Math.min(1, (now - start) / duration);
    }
    ffActive = false;
    if (!queuedSong) state.minute = to;
  }

  // ── The night ─────────────────────────────────────────────────────────────
  async function runNight(id) {
    const alive = () => id === runId;
    while (alive()) {
      const over = Engine.meterEnding(state);
      if (over) {
        await finish(over);
        return;
      }
      if (queuedSong) {
        queuedSong = false;
        await idleSong();
        continue;
      }
      if (!state.current) {
        const plan = Engine.advance(state);
        for (let i = 0; i < plan.missed.length; i += 1) logLine(t('logMissed'));
        if (plan.drifted.trust || plan.drifted.heat) {
          showDelta(el.trustDelta, plan.drifted.trust);
          showDelta(el.heatDelta, plan.drifted.heat);
          renderMeters();
        }
        persist();
      }
      const current = state.current;
      if (current.kind === 'end') {
        await finish(null);
        return;
      }
      setPhase('idle', null);
      idleCard();
      await fastForward(current.at);
      if (!alive()) return;
      if (queuedSong) continue;
      const event = Engine.currentEvent(state);
      if (!event) {
        state.current = null;
        continue;
      }
      if (event.type === 'static') await runStatic(event);
      else if (event.type === 'flicker') await runFlicker(event);
      else if (event.type === 'memo') await runMemo(event);
      else await runCall(event);
      persist();
    }
  }

  async function idleSong() {
    setPhase('song', null);
    showCard({ kind: 'song', kicker: t('lineSong'), text: t('songCard') });
    const res = Engine.playSong(state);
    showOutcome(res, t('songIdle'));
    logLine(t('logRecord'), res.delta);
    persist();
    await spinRecord(CONFIG.song.seconds);
  }

  async function runCall(event) {
    const v = Engine.view(state, event);
    showCard({ kind: 'ringing', kicker: t('incoming'), text: t('incomingText') });
    setPhase('ringing', 'call');
    const stopRinging = startRinging();
    const answer = await expect(['pickup', 'song'], CONFIG.ringSeconds);
    stopRinging();

    if (answer.type !== 'pickup') {
      const withSong = answer.type === 'song';
      const res = Engine.cut(state, withSong);
      showOutcome({ ...res, text: null }, t(withSong ? 'cutDefault' : 'letItRing'));
      if (withSong) {
        setPhase('song', null);
        await spinRecord(CONFIG.song.seconds);
      }
      await settle(res, t('logMissed'));
      return;
    }

    sound.click();
    const again = v.character && Engine.characterCalls(state, v.character) > 0;
    showCard({
      kind: 'call',
      name: v.name,
      place: v.place,
      badge: again ? t('callingAgain') : '',
    });
    setPhase('typing', 'call');
    let stopExtra = null;
    if (v.sound === 'keys') sound.keys(4);
    if (v.sound === 'breath') stopExtra = track(sound.breath());
    const typed = typewrite(v.text, { voice: v.sound !== 'breath' });
    let action = await Promise.race([typed.then(() => null), expect(['song'])]);
    if (action) {
      skipTyping = true;
    } else {
      setPhase('decide', 'call');
      renderChoices(v.choices);
      deadAirTime = 0;
      deadAirArmed = true;
      action = await expect(['choice', 'song', 'gameover']);
    }
    deadAirArmed = false;
    el.choices.replaceChildren();
    if (stopExtra) stopExtra();
    if (action.type === 'gameover') return;

    if (action.type === 'song') {
      const res = Engine.cut(state, true);
      showOutcome(res, t('cutDefault'));
      setPhase('song', null);
      await spinRecord(CONFIG.song.seconds);
      await settle(res, `${v.name}: ${t('logRecord')}`);
      return;
    }
    const res = Engine.choose(state, action.index);
    showOutcome(res, '');
    if (res.music) {
      setPhase('song', null);
      await spinRecord(CONFIG.song.requestSeconds);
    }
    await settle(res, v.name);
  }

  async function runMemo(event) {
    const v = Engine.view(state, event);
    const note = v.style === 'note';
    showCard({
      kind: note ? 'note' : 'memo',
      kicker: t(note ? 'noteFrom' : 'memoFrom'),
      name: v.title,
      stamp: note ? '' : t('memoStamp'),
    });
    setPhase('typing', 'memo');
    sound.paper();
    await typewrite(v.text, { ticks: true });
    setPhase('decide', 'memo');
    renderChoices(v.choices);
    const action = await expect(['choice']);
    el.choices.replaceChildren();
    const res = Engine.choose(state, action.index);
    await showResult(res, '', v.title);
  }

  async function runStatic(event) {
    setPhase('static', 'static');
    showCard({ kind: 'event', kicker: t('tuner'), name: event.name, text: event.text });
    el.tunerHint.textContent = t('tuneHint');
    el.room.classList.add('tuning');
    staticTarget = 0.42;
    freqTarget = Math.random() < 0.5 ? 67.2 + Math.random() : 71.4 + Math.random();
    const stopNoise = track(sound.staticNoise());
    const answer = await expect(['tune'], CONFIG.staticSeconds);
    stopNoise();
    staticTarget = 0;
    freqTarget = 69.8;
    el.room.classList.remove('tuning');
    el.tunerHint.textContent = '';
    const success = answer.type === 'tune';
    if (success) sound.tune();
    await showResult(Engine.resolveStatic(state, success), '', event.name);
  }

  async function runFlicker(event) {
    setPhase('flicker', 'flicker');
    sound.thunk();
    sound.humDip(1.8);
    el.room.classList.add('blackout');
    await sleep(1.9);
    el.room.classList.remove('blackout');
    const v = Engine.view(state, event);
    showCard({ kind: 'event', kicker: t('onAir'), name: v.name, text: '' });
    setPhase('typing', 'flicker');
    await typewrite(v.text);
    setPhase('decide', 'flicker');
    renderChoices(v.choices);
    deadAirTime = 0;
    deadAirArmed = true;
    const action = await expect(['choice', 'gameover']);
    deadAirArmed = false;
    el.choices.replaceChildren();
    if (action.type === 'gameover') return;
    await showResult(Engine.choose(state, action.index), '', v.name);
  }

  async function finish(badId) {
    setPhase('ending', null);
    el.choices.replaceChildren();
    let id = badId;
    if (!id) {
      idleCard();
      await fastForward(CONFIG.nightMinutes);
      sound.pips();
      await sleep(5.8);
      id = Engine.finalEnding(state);
    } else if (id === 'offAir') {
      sound.testTone(2.4);
      el.room.classList.add('dark');
      await sleep(2.6);
    } else {
      staticTarget = 0.45;
      sound.staticSwell(2.6);
      await sleep(2.6);
      staticTarget = 0;
    }
    sound.humOff();
    el.onAir.classList.remove('live');
    Engine.finish(state, id);
    persist();
    const found = new Set(load(FOUND_KEY) || []);
    found.add(id);
    store(FOUND_KEY, [...found]);
    showEnding();
  }

  function showEnding() {
    const ending = Engine.endingById(state.ending.id);
    const vars = {
      time: Engine.clockText(state.ending.minute),
      trust: state.trust,
      heat: state.heat,
      songs: state.stats.songs,
    };
    el.endScreen.dataset.kind = ending.kind === 'bad' ? 'bad' : 'good';
    el.endKicker.textContent = ending.kind === 'bad' ? t('failed', vars) : t('survived');
    el.endTitle.textContent = ending.title;
    el.endText.textContent = format(ending.text, vars);
    el.endMeters.textContent = t('endMeters', vars);
    el.endDid.replaceChildren(
      ...(state.log.length
        ? state.log.map((entry) => {
            const li = h('li');
            li.append(h('time', '', Engine.clockText(entry.at)), h('span', '', entry.text));
            return li;
          })
        : [h('li', 'muted', t('endDidNothing'))]),
    );
    el.endFates.replaceChildren(
      ...Engine.epilogues(state).map((fate) => {
        const li = h('li');
        li.append(h('b', '', fate.who), h('span', '', fate.text));
        return li;
      }),
    );
    el.endStats.textContent = t('endStats', state.stats);
    const found = new Set(load(FOUND_KEY) || []);
    el.endFound.textContent = t('endFound', { n: found.size, total: ENDINGS.length });
    el.endFoundList.replaceChildren(
      ...ENDINGS.map((e) => {
        const known = found.has(e.id);
        const li = h('li', known ? (e.id === ending.id ? 'current' : 'known') : 'unknown');
        li.textContent = known ? e.title : t('endUnknown');
        return li;
      }),
    );
    el.endHistory.textContent = t('history');
    el.endScreen.hidden = false;
    el.endScreen.scrollTop = 0;
    el.btnEndNew.focus({ preventScroll: true });
  }

  // ── Starting, stopping, pausing ───────────────────────────────────────────
  function abortRun() {
    runId += 1;
    timers = [];
    waiter = null;
    queuedSong = false;
    skipTyping = true;
    deadAirArmed = false;
    ffActive = false;
    for (const stop of [...stoppers]) stop();
    staticTarget = 0;
    freqTarget = 69.8;
    el.room.classList.remove('blackout', 'dark', 'tuning');
    el.platter.classList.remove('spinning');
    el.tonearm.classList.remove('playing');
    el.tunerHint.textContent = '';
    el.choices.replaceChildren();
  }

  function newSeed() {
    if (FIXED_SEED != null) return FIXED_SEED;
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function beginNight(fresh) {
    abortRun();
    if (fresh || !state || state.ending) {
      state = Engine.newNight(newSeed());
      el.log.replaceChildren();
    }
    persist();
    el.titleScreen.hidden = true;
    el.endScreen.hidden = true;
    setPaused(false);
    sound.init();
    sound.setMuted(muted);
    sound.resume();
    sound.humOn();
    el.onAir.classList.add('live');
    renderAll();
    idleCard();
    logLine(t('onAir'));
    const id = runId;
    runNight(id).catch((err) => console.error('Dead Air:', err));
  }

  function showTitle() {
    setPhase('title', null);
    const inProgress = state && !state.ending;
    el.btnStart.textContent = inProgress
      ? t('continueNight', { time: Engine.clockText(state.minute) })
      : t('goOnAir');
    el.btnTitleNew.hidden = !inProgress;
    let status = '';
    if (state && state.ending)
      status = t('lastEnding', { title: Engine.endingById(state.ending.id).title });
    const found = load(FOUND_KEY) || [];
    if (found.length)
      status = [status, t('endFound', { n: found.length, total: ENDINGS.length })]
        .filter(Boolean)
        .join(' · ');
    el.titleStatus.textContent = status;
    el.titleScreen.hidden = false;
    el.btnStart.focus({ preventScroll: true });
  }

  function setPaused(value) {
    const running = phase !== 'title' && phase !== 'ending';
    paused = Boolean(value) && running;
    el.pauseScreen.hidden = !paused;
    el.btnPause.querySelector('span').textContent = t(paused ? 'resume' : 'pause');
    el.btnPause.setAttribute('aria-pressed', String(paused));
    sound.suspend(paused);
  }

  function setMuted(value) {
    muted = value;
    store(MUTE_KEY, muted);
    sound.setMuted(muted);
    el.btnMute.querySelector('span').textContent = t(muted ? 'unmute' : 'mute');
    el.btnMute.setAttribute('aria-pressed', String(muted));
  }

  function onRecord() {
    if (el.btnRecord.disabled || paused) return;
    if (phase === 'idle') {
      queuedSong = true;
      el.btnRecord.disabled = true;
    } else {
      act({ type: 'song' });
    }
  }

  function onTune() {
    if (paused) return;
    if (phase === 'static') {
      act({ type: 'tune' });
      return;
    }
    sound.tune(0.4);
    freq += (Math.random() - 0.5) * 0.6;
  }

  let confirmTimer = 0;
  function resetNewButton() {
    clearTimeout(confirmTimer);
    el.btnNew.classList.remove('confirm');
    el.btnNew.querySelector('span').textContent = t('newNight');
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  el.btnPickUp.addEventListener('click', () => act({ type: 'pickup' }));
  el.btnRecord.addEventListener('click', onRecord);
  el.tunerKnob.addEventListener('click', onTune);
  el.card.addEventListener('click', () => {
    if (phase === 'typing') skipTyping = true;
  });
  el.btnMute.addEventListener('click', () => {
    setMuted(!muted);
    el.btnMute.blur();
  });
  el.btnPause.addEventListener('click', () => {
    setPaused(!paused);
    el.btnPause.blur();
  });
  el.btnResume.addEventListener('click', () => setPaused(false));
  el.btnNew.addEventListener('click', () => {
    el.btnNew.blur();
    const midNight = phase !== 'title' && phase !== 'ending';
    if (midNight && !el.btnNew.classList.contains('confirm')) {
      el.btnNew.classList.add('confirm');
      el.btnNew.querySelector('span').textContent = t('newNightConfirm');
      confirmTimer = setTimeout(resetNewButton, 3000);
      return;
    }
    resetNewButton();
    beginNight(true);
  });
  el.btnStart.addEventListener('click', () => beginNight(false));
  el.btnTitleNew.addEventListener('click', () => beginNight(true));
  el.btnEndNew.addEventListener('click', () => beginNight(true));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const key = e.key.toLowerCase();
    const focused = document.activeElement;
    const activate = key === ' ' || key === 'enter';
    // A focused button in the choices or an overlay handles Space/Enter itself.
    if (activate && focused instanceof HTMLButtonElement && focused.closest('.choices, .overlay'))
      return;
    if (key === 'm') {
      setMuted(!muted);
      return;
    }
    if (key === 'p' || key === 'escape') {
      setPaused(!paused);
      return;
    }
    if (paused) return;
    if (activate) {
      e.preventDefault();
      if (phase === 'title') el.btnStart.click();
      else if (phase === 'ringing') act({ type: 'pickup' });
      else if (phase === 'typing') skipTyping = true;
      else if (phase === 'result') act({ type: 'continue' });
      return;
    }
    if (/^[1-9]$/.test(key) && phase === 'decide') {
      const index = Number(key) - 1;
      if (index < el.choices.children.length) act({ type: 'choice', index });
    } else if (key === 'r') {
      onRecord();
    } else if (key === 't') {
      onTune();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  // ── Per-frame work ────────────────────────────────────────────────────────
  function tick(dt) {
    if (!state || state.ending) return;
    if (!ffActive && ['ringing', 'typing', 'decide'].includes(phase)) {
      state.minute = Math.min(
        state.minute + dt * CONFIG.liveMinutesPerSecond,
        CONFIG.nightMinutes - 1,
      );
    }
    if (phase === 'decide' && deadAirArmed) {
      deadAirTime += dt;
      const { graceSeconds: grace, everySeconds: every } = CONFIG.deadAir;
      const progress = clamp((deadAirTime - grace * 0.4) / (grace * 0.6), 0, 1);
      el.deadAir.classList.toggle('show', progress > 0);
      el.deadAirFill.style.width = `${(progress * 100).toFixed(1)}%`;
      if (deadAirFlash <= 0) el.deadAirLabel.textContent = t('deadAirWarn');
      if (deadAirTime >= grace) {
        deadAirTime = grace - every;
        const lost = Engine.deadAir(state);
        sound.deadAir();
        showDelta(el.trustDelta, lost);
        renderMeters();
        logLine(t('logDeadAir'), { trust: lost, heat: 0 });
        el.deadAirLabel.textContent = t('deadAirHit', { n: signed(lost) });
        deadAirFlash = 2.5;
        el.deadAir.classList.add('hit');
        persist();
        if (Engine.meterEnding(state)) act({ type: 'gameover' });
      }
    }
    if (deadAirFlash > 0) {
      deadAirFlash -= dt;
      if (deadAirFlash <= 0) el.deadAir.classList.remove('hit');
    }
  }

  const staticCtx = el.staticCanvas.getContext('2d');
  const staticImage = staticCtx.createImageData(el.staticCanvas.width, el.staticCanvas.height);

  function render(realDt) {
    // Clock: eases towards the game minute so jumps roll forward visibly.
    const target = state ? state.minute : 0;
    if (target < shownMinute - 1) shownMinute = target;
    else shownMinute += (target - shownMinute) * Math.min(1, realDt * 5);
    if (Math.abs(target - shownMinute) < 0.05) shownMinute = target;
    const [hh, mm] = Engine.clockText(shownMinute).split(':');
    if (el.clockH.textContent !== hh) el.clockH.textContent = hh;
    if (el.clockM.textContent !== mm) el.clockM.textContent = mm;

    // VU meter with roughly VU ballistics.
    const angle = vuAngle(sound.level() / VU_REF);
    needle += (angle - needle) * Math.min(1, realDt * 8);
    el.vuNeedle.style.transform = `rotate(${needle.toFixed(2)}deg)`;

    // Tuning dial.
    const wobble = phase === 'static' ? (Math.random() - 0.5) * 0.08 : 0;
    freq += (freqTarget - freq) * Math.min(1, realDt * 2.5) + wobble;
    el.tunerPointer.style.left = `${(((freq - 65.6) / 7.8) * 100).toFixed(2)}%`;
    el.tunerKnob.style.setProperty('--turn', `${((freq - 69.8) * 140).toFixed(1)}deg`);
    el.tunerFreq.textContent = freq.toFixed(2);

    // Static overlay.
    staticLevel += (staticTarget - staticLevel) * Math.min(1, realDt * 6);
    el.staticCanvas.style.opacity = staticLevel.toFixed(3);
    if (staticLevel > 0.01) {
      const data = staticImage.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v * 0.92;
        data[i + 2] = v * 0.8;
        data[i + 3] = 255;
      }
      staticCtx.putImageData(staticImage, 0, 0);
    }
  }

  let lastFrame = performance.now();
  function frame(ts) {
    const realDt = Math.min(0.1, Math.max(0, (ts - lastFrame) / 1000));
    lastFrame = ts;
    if (!paused) {
      const dt = realDt * SPEED;
      now += dt;
      const due = timers.filter((tm) => tm.at <= now);
      if (due.length) {
        timers = timers.filter((tm) => tm.at > now);
        for (const tm of due) tm.resolve();
      }
      tick(dt);
    }
    render(realDt);
    requestAnimationFrame(frame);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  applyStrings();
  buildDecor();
  setMuted(muted);
  setPaused(false);
  resetNewButton();
  renderAll();
  idleCard();
  showTitle();
  requestAnimationFrame(frame);

  const problems = Engine.validate();
  if (problems.length) console.warn('Dead Air: callers.js has problems:\n' + problems.join('\n'));

  // A handle for debugging in the console (and for automated play-throughs).
  window.DeadAir = {
    Engine,
    CONFIG,
    get state() {
      return state;
    },
    get phase() {
      return phase;
    },
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame);
  else startGame();
}
