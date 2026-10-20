# Dead Air

A browser game about a late-night radio host in Prague, 23 November 1989,
the week the regime falls. Plain HTML, CSS and JavaScript: no build step, no
external assets, every sound synthesised with the Web Audio API.

**Play:** open `index.html` in a browser. That's all.

## How to play

You host *The Night Line* on Radio Petřín from 22:00 to 06:00 (about eight
real minutes). The phone rings; pick up, read the caller, choose what goes out
on air.

- **Audience Trust** (0–100): if it falls to 0, nobody is listening.
- **Heat** (0–100): if it reaches 100, they take you off air.
- **Censor memos** forbid certain things for the next few calls. Choices that
  break the memo are marked; breaking it adds Heat, obeying it all the way
  takes some off.
- **Records** cool things down (−4 Heat) and skip ten minutes, but each record
  played within an hour of another costs Trust.
- **Dead air:** leave a caller hanging and listeners drift away.
- As the night wears on, Trust slowly fades and Heat slowly cools.
- Random events: static (retune the dial in time), power cuts, silent calls.
- Three recurring callers remember how you treated them: Lenka the student,
  Marie the miner's wife, and Mr Dvořáček, "only a simple pensioner".

Keys: `Space` pick up / skip text / continue · `1`–`3` choose · `R` record ·
`T` tune · `M` mute · `P` pause. The night saves itself in `localStorage`;
**New Night** starts over.

There are nine endings. The end screen lists what you did, what became of the
people you met, and which endings you have found.

## Files

| File | What's in it |
|---|---|
| `index.html` | The console markup. No visible text: labels come from `STRINGS`. |
| `style.css` | The studio: lamp glow, VU meter, ladders, tuner, turntable. Pure CSS. |
| `callers.js` | **Every word the player reads**: `STRINGS`, `CALLERS`, `MEMOS`, `RANDOM_EVENTS`, `ENDINGS`, `EPILOGUES`. |
| `game.js` | `CONFIG` (balance numbers), `Engine` (pure logic), `Sound` (Web Audio), and the interface. |
| `tools/check.mjs` | Optional: validates `callers.js` and simulates 20 000 nights in Node. |

## Adding a caller

Copy a block in `CALLERS` (in `callers.js`), give it a unique `id` and a time:

```js
{
  id: 'tram_driver',
  at: '01:55',
  name: 'Pavla',
  place: 'Tram driver, depot Žižkov',
  text: 'Last tram of the night. Somebody chalked “Monday 12:00” on every seat.',
  choices: [
    {
      label: 'Read the chalk on air',
      tags: ['strike', 'onair'],   // memos can forbid tags
      trust: 7,
      heat: 8,
      set: ['readChalk'],          // a flag later calls and endings can test
      log: 'Read the tram graffiti on air.', // appears on the end screen
      result: 'Pavla laughs. “They’ll scrub it tomorrow. Too late.”',
    },
    {
      label: '“Mind the road, Pavla.”',
      trust: 0,
      heat: 0,
      result: 'The tram bell rings twice down the line.',
    },
  ],
},
```

The night is sorted by `at`, so a new caller just slots in. Keep roughly
15–20 game minutes between calls to keep the night near eight real minutes.
Callers that share a `slot` compete: one of them is picked each night.

**Choice fields:** `label`, `result`, `trust`, `heat`, `tags`, `set` (flags),
`add` (counters, e.g. `{ lenka: 1 }`), `log`, `music: true` (plays a record),
`when` (only shown if the condition holds).

**A caller who remembers you** uses `variants`: the first one whose `when`
matches is used, and it can override `name`, `place`, `text`, `choices` and
`cut` (what happens if you play a record over them). Mark recurring calls
`required: true` so they are never skipped. See `lenka_1`, `lenka_2`,
`lenka_3` for a full arc.

**Conditions** (`when`, `trigger`, endings):
`'flag'`, `{ flags: [...] }`, `{ not: [...] }`, `{ any: [...] }`,
`{ min: { lenka: 3 } }`, `{ max: {...} }`, `trustMin`, `trustMax`,
`heatMin`, `heatMax`, `songsMin`, `{ anyOf: [cond, cond] }`.

**Triggered events** use `trigger: { heatMin: 80 }` instead of `at`: they
happen once, as soon as the condition holds (see `warning` and `director`).

**Memos** live in `MEMOS`. A `rule: { forbid: ['live'], calls: 3, penalty: 7,
summary: '…' }` applies to the next `calls` calls. **Random events**,
**endings** and **epilogues** have their own arrays with comments.

Then check your work:

```bash
node dead-air/tools/check.mjs
```

It reports data mistakes (duplicate ids, bad times, missing results), which
ending each play style tends to reach, any ending nobody can reach, and any
choice that never gets picked.

## Translating

All text is in `callers.js`. Copy it, translate the string values (never ids,
flags, tags or object keys), set `STRINGS.locale`, and load your copy in
`index.html`. Counted strings (`{ one, other }`) use `Intl.PluralRules`, so a
Czech translation can add `few` and `many`.

## Debugging

- `index.html?speed=10` runs every timer ten times faster.
- `index.html?seed=42` makes a night's random picks repeatable.
- `window.DeadAir` in the console exposes the engine, config and live state.
- Balance numbers (drift, record cost, dead air, memo penalty…) are in
  `CONFIG` at the top of `game.js`.

The setting is historical; every character is invented.
