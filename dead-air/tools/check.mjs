// Checks callers.js and plays thousands of simulated nights through the real
// engine to show that every ending, variant and choice can be reached.
// The game itself needs nothing but a browser; this script only needs Node.
//
//   node dead-air/tools/check.mjs          (20 000 nights)
//   node dead-air/tools/check.mjs 5000     (fewer, faster)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console });
for (const file of ['callers.js', 'game.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), context, { filename: file });
}
const { Engine, ENDINGS, RANDOM_EVENTS } = vm.runInContext(
  '({ Engine, ENDINGS, RANDOM_EVENTS })',
  context,
);

let failed = false;
const problems = Engine.validate();
if (problems.length) {
  failed = true;
  console.log(`callers.js has ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
} else {
  console.log('callers.js: no problems found.');
}

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every choice that exists, so we can report the ones never picked. Choices
// written inside a variant are tracked per variant (“#2” is the 2nd variant).
const unseen = new Set();
const choiceKey = (event, variant, label) => {
  const own = variant >= 0 && event.variants && event.variants[variant].choices;
  return own ? `${event.id} #${variant + 1}: ${label}` : `${event.id}: ${label}`;
};
for (const e of [...Engine.events, ...RANDOM_EVENTS]) {
  for (const c of e.choices || []) unseen.add(choiceKey(e, -1, c.label));
  (e.variants || []).forEach((v, vi) => {
    for (const c of v.choices || []) unseen.add(choiceKey(e, vi, c.label));
  });
}
const variantOf = (state, event) =>
  event.variants ? event.variants.findIndex((v) => Engine.test(state, v.when)) : -1;

// How a choice looks to different kinds of player.
const brave = (c) => (c.trust || 0) * 10 - (c.heat || 0) * 0.1;
const careful = (c) => -(c.heat || 0) + (c.trust || 0) * 0.3;
const balanced = (c, s) =>
  (c.trust || 0) - (c.heat || 0) * 0.8 - (Engine.breaksMemo(s, c) ? 50 : 0);
const meek = (c, s) =>
  -Math.abs(c.heat || 0) * 2 + (c.trust || 0) * 0.5 - (Engine.breaksMemo(s, c) ? 50 : 0);
const edge = (c, s) => (s.heat < 66 || s.minute > 380 ? brave(c) : balanced(c, s));

const ARCHETYPES = {
  reckless: { score: brave },
  coward: { score: careful },
  measured: { score: balanced },
  meek: { score: meek },
  'meek, then brave': { score: (c, s) => (s.minute > 330 ? brave(c) : meek(c, s)) },
  'brave until hot': { score: (c, s) => (s.heat < 55 ? brave(c) : careful(c)) },
  'edge, warns the city': { score: edge, pick: { threat: 0, warning: 1 } },
  'edge, keeps quiet': { score: edge, pick: { threat: 1, warning: 0 } },
  'record every hour': {
    score: (c, s) => (c.trust || 0) - Math.abs(c.heat || 0) - (Engine.breaksMemo(s, c) ? 50 : 0),
    recordWhenFree: true,
  },
};

// A random personality: how much it values trust, fears heat, plays records,
// cuts callers or dithers into dead air.
function randomPolicy(rand) {
  const trustWeight = rand() * 2 - 1;
  const heatWeight = rand() * 2 - 1;
  return {
    score: (c) => (c.trust || 0) * trustWeight - (c.heat || 0) * heatWeight,
    noise: rand() * 8,
    idleSong: rand() < 0.2 ? rand() * 0.8 : rand() * 0.1,
    cut: rand() * 0.08,
    deadAir: rand() * 0.15,
  };
}

function playNight(seed, policy, rand) {
  const state = Engine.newNight(seed);
  let events = 0;
  for (let guard = 0; guard < 400 && !Engine.meterEnding(state); guard += 1) {
    if (rand() < (policy.idleSong || 0)) {
      Engine.playSong(state);
      continue;
    }
    const plan = Engine.advance(state);
    if (plan.kind === 'end') break;
    state.minute = Math.min(Math.max(state.minute, plan.at) + 1 + rand() * 4, 479);
    const event = Engine.currentEvent(state);
    events += 1;
    if (event.type === 'static') {
      Engine.resolveStatic(state, rand() < 0.8);
      continue;
    }
    if (event.type === 'call') {
      if (policy.recordWhenFree && Engine.nextSongCost(state) === 0) {
        Engine.cut(state, true);
        continue;
      }
      if (rand() < (policy.cut || 0)) {
        Engine.cut(state, rand() < 0.8);
        continue;
      }
      if (rand() < (policy.deadAir || 0)) {
        Engine.deadAir(state);
        if (Engine.meterEnding(state)) break;
      }
    }
    const v = Engine.view(state, event);
    const scores = v.choices.map((c) => policy.score(c, state) + rand() * (policy.noise ?? 0.5));
    const forced = policy.pick && policy.pick[event.id];
    const index = forced ?? scores.indexOf(Math.max(...scores));
    unseen.delete(choiceKey(event, variantOf(state, event), v.choices[index].label));
    Engine.choose(state, index);
  }
  return { ending: Engine.finalEnding(state), events };
}

const nights = Number(process.argv[2]) || 20000;
const names = [...Object.keys(ARCHETYPES), 'random personalities'];
const counts = Object.fromEntries(ENDINGS.map((e) => [e.id, 0]));
const byStyle = Object.fromEntries(names.map((n) => [n, {}]));
let totalEvents = 0;
for (let seed = 1; seed <= nights; seed += 1) {
  const rand = prng(seed * 7919 + 13);
  // Half the nights use a named style, half a random personality.
  const styles = names.length - 1;
  const name = seed % 2 ? names[Math.floor(seed / 2) % styles] : names[styles];
  const policy = ARCHETYPES[name] || randomPolicy(rand);
  const result = playNight(seed, policy, rand);
  counts[result.ending] += 1;
  byStyle[name][result.ending] = (byStyle[name][result.ending] || 0) + 1;
  totalEvents += result.events;
}

const titleOf = (id) => ENDINGS.find((e) => e.id === id).title;
console.log(`\nSimulated ${nights} nights:`);
for (const e of ENDINGS) {
  const share = ((counts[e.id] / nights) * 100).toFixed(1).padStart(5);
  console.log(`  ${e.title.padEnd(26)} ${String(counts[e.id]).padStart(6)}  ${share}%`);
}
console.log('\nMost common ending per play style:');
for (const name of names) {
  const ranked = Object.entries(byStyle[name]).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const top = ranked
    .slice(0, 2)
    .map(([id, n]) => `${titleOf(id)} ${Math.round((n / total) * 100)}%`)
    .join(', ');
  console.log(`  ${name.padEnd(22)} ${top}`);
}

const missing = ENDINGS.filter((e) => counts[e.id] === 0);
if (missing.length) {
  failed = true;
  console.log(`\nUnreached endings: ${missing.map((e) => e.title).join(', ')}`);
} else {
  console.log(`\nAll ${ENDINGS.length} endings reached.`);
}
console.log(`Average events per night: ${(totalEvents / nights).toFixed(1)}`);
if (unseen.size) {
  console.log(`Choices never picked in any simulated night (${unseen.size}):`);
  for (const key of unseen) console.log(`  - ${key}`);
} else {
  console.log('Every choice in every variant was picked at least once.');
}

process.exitCode = failed ? 1 : 0;
