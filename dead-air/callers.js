/*
 * Dead Air: every word the player reads lives in this file.
 *
 * TRANSLATING
 *   Copy this file, translate the string values (never ids, flags, tags or the
 *   keys of objects), set STRINGS.locale, and point index.html at your copy.
 *   Counted strings ({ one, other }) follow Intl.PluralRules, so Czech can add
 *   few/many.
 *
 * ADDING A CALLER (see README.md for the full guide)
 *   Copy any block in CALLERS, give it a unique id and a time ('HH:MM' between
 *   22:00 and 05:59). The night is sorted by time. Keep about 15-20 minutes
 *   between calls so the night lasts roughly eight real minutes.
 *
 * FIELDS
 *   at        when the phone rings ('23:40').
 *   trigger   instead of `at`: a condition; the event happens once, as soon
 *             as the condition holds ({ heatMin: 80 }).
 *   slot      callers sharing a slot compete: one of them is picked per night.
 *   character a recurring character; their calls get a "calling again" badge.
 *   required  never skipped, even if you are running late.
 *   when      condition; the call (or a choice) is skipped/hidden unless true.
 *   variants  [{ when, name, place, text, choices, cut }]: the first match wins
 *             and overrides the fields it sets.
 *   sound     extra sound while the caller talks: 'keys' or 'breath'.
 *   choices   2-3 of { label, result, trust, heat, tags, set, add, log, music,
 *             when, time }.
 *               trust/heat  change to the meters.
 *               tags        what the censor memos can forbid (see MEMOS).
 *               set         flags to switch on: ['flagA', 'flagB'].
 *               add         counters to raise: { lenka: 1 }.
 *               log         a line for the end-of-night summary.
 *               music       true if the choice plays a record (a request).
 *   cut       what happens if you play a record over the caller instead
 *             ({ trust, heat, set, log, result }).
 *
 * CONDITIONS
 *   { flags: [...] }   all of these flags are on
 *   { not: [...] }     none of these flags are on
 *   { any: [...] }     at least one of these flags is on
 *   { min: { lenka: 3 } } / { max: { lenka: 1 } }   counters
 *   trustMin, trustMax, heatMin, heatMax, songsMin
 *   { anyOf: [condition, condition] }   either condition
 *   A bare string is short for { flags: ['thatString'] }.
 */
/* exported STRINGS, CALLERS, MEMOS, RANDOM_EVENTS, ENDINGS, EPILOGUES */
'use strict';

const STRINGS = {
  locale: 'en',
  title: 'Dead Air',
  stationLine: 'Radio Petřín · 69.80 MHz · The Night Line',
  date: 'Thu 23 Nov 1989',
  onAir: 'On Air',
  trust: 'Audience Trust',
  heat: 'Heat',
  vu: 'VU',
  tallyCalls: 'Calls',
  tallySongs: 'Records',
  tallyBroken: 'Memos broken',
  lines: 'Lines',
  lineQuiet: 'Lines quiet',
  lineRinging: 'Line 1 ringing…',
  lineOpen: 'Line 1 open',
  lineMemo: 'Something on the desk',
  lineSong: 'Record playing',
  pickUp: 'Pick up',
  continue: 'Continue',
  idleCard: 'The programme rolls on. Somewhere in Prague, a phone is being dialled.',
  incoming: 'Incoming call',
  incomingText: 'Line 1 is ringing. Pick up, or let it ring and play a record.',
  callingAgain: 'Calling again',
  songCard: 'A record is spinning. Nobody can quote a record.',
  record: 'Play a record',
  recordCut: 'Cut the line, play a record',
  recordLetRing: 'Let it ring, play a record',
  recordCount: { one: '{n} record tonight', other: '{n} records tonight' },
  recordFree: 'Listeners won’t mind one more.',
  recordCost: 'Another record now costs {n} trust.',
  tuner: 'Tuning',
  tuneHint: 'The signal is drifting. Click the dial or press T!',
  memoPin: 'Memo in force',
  memoLeft: { one: 'for {n} more call', other: 'for {n} more calls' },
  memoBreaks: 'breaks the memo',
  deltaTrust: '{n} trust',
  deltaHeat: '{n} heat',
  memoBroken: 'Memo broken {n} heat',
  memoKept: 'Memo obeyed: the Office is pleased {n} heat',
  memoLapsed: 'The memo has lapsed.',
  songTired: 'Too many records {n} trust',
  deadAirWarn: 'Dead air',
  deadAirHit: 'Dead air! Listeners drift away {n} trust',
  missedCall: 'A caller gave up while you were busy.',
  letItRing: 'You let it ring until it stops.',
  cutDefault: 'The needle drops. The caller’s voice dissolves into the opening bars.',
  songIdle: 'The needle drops. Ten minutes of music, and no words to regret.',
  logRecord: 'Record',
  logMissed: 'Missed call',
  logDeadAir: 'Dead air',
  mute: 'Mute',
  unmute: 'Sound on',
  pause: 'Pause',
  resume: 'Resume',
  paused: 'Paused',
  pausedHint: 'The night waits for you. Press P or click Resume.',
  newNight: 'New Night',
  newNightConfirm: 'Sure? Click again',
  goOnAir: 'Go on air',
  continueNight: 'Continue the night ({time})',
  lastEnding: 'Last night ended: {title}',
  introTitle: 'Prague, 23 November 1989',
  intro: [
    'Six nights ago riot police beat students on Národní třída. Since then the squares have filled every evening, the theatres have stopped performing and nobody knows what the Party will do next.',
    'You host The Night Line on Radio Petřín, live from 22:00 to 06:00. Listeners ring in with tips, rumours, requests, threats and confessions. The Office is listening too.',
  ],
  howToTitle: 'How to stay on air',
  howTo: [
    'Pick up the phone, read the caller, and choose what goes out on air.',
    'Audience Trust: if it falls to 0, nobody is listening.',
    'Heat: if it reaches 100, they take you off air.',
    'Censor memos set rules for the next few calls. Breaking them raises Heat.',
    'As the night wears on, Trust fades unless you give listeners something real, and Heat slowly cools.',
    'A record cools things down and buys time, but listeners tire of too many.',
    'Don’t leave dead air. Silence on the line costs trust.',
  ],
  keys: 'Space pick up / continue · 1–3 choose · R record · T tune · M mute · P pause',
  survived: 'Survived until 06:00',
  failed: 'The night ended at {time}',
  endDid: 'What you did',
  endDidNothing: 'You kept your head down all night.',
  endFates: 'What became of them',
  endMeters: 'Trust {trust} · Heat {heat}',
  endStats:
    'Calls taken: {calls} · Records: {songs} · Memos broken: {broken} · Missed calls: {missed}',
  endFound: 'Endings found: {n} of {total}',
  endUnknown: '???',
  history:
    'What happened next: on Friday 24 November 1989 the Communist Party leadership resigned. On Monday 27 November a two-hour general strike stopped the country. On 29 December Václav Havel was elected president.',
  memoFrom: 'Office for Press and Information',
  memoStamp: 'Confidential',
  noteFrom: 'Your notes',
};

const CALLERS = [
  {
    id: 'grandmother',
    at: '22:04',
    name: 'Mrs Kopecká',
    place: 'Vršovice',
    text: 'Good evening, dear. Could you play something for my grandson Ondřej? He went to the march on Friday and hasn’t been home since. He sleeps at the faculty now. Tell him his grandmother isn’t angry. And to wear a scarf.',
    choices: [
      {
        label: 'Play a record and read every word',
        tags: ['students', 'onair'],
        music: true,
        trust: 6,
        heat: 5,
        result:
          '“…and wear a scarf.” In a cold lecture hall, a boy is teased mercilessly by his friends. He doesn’t mind.',
      },
      {
        label: 'Play it “for Ondřej, from Grandma”, and skip the march',
        tags: ['onair'],
        music: true,
        trust: 2,
        heat: 0,
        result: 'Sweet, safe, forgettable. Nobody at the Office writes it down.',
      },
      {
        label: '“We don’t take requests this early, madam.”',
        trust: -3,
        heat: 0,
        result: '“Oh. Of course.” She hangs up very gently, as if the phone might break.',
      },
    ],
  },

  // ── Lenka, the student (recurring) ───────────────────────────────────────
  {
    id: 'lenka_1',
    character: 'lenka',
    required: true,
    at: '22:16',
    name: 'Lenka',
    place: 'Student, Faculty of Arts',
    text: 'We’ve occupied the Faculty of Arts. We wrote a proclamation, three sentences: “We demand a dialogue. We demand the truth about Friday on Národní. We are not afraid.” Will you read it? I’m Lenka, by the way.',
    choices: [
      {
        label: 'Read the proclamation word for word',
        tags: ['students', 'onair'],
        trust: 10,
        heat: 12,
        set: ['lenkaRead'],
        add: { lenka: 2 },
        log: 'Read the students’ proclamation on air.',
        result: 'Three sentences, read slowly. Across the city, someone turns the volume up.',
      },
      {
        label: 'Paraphrase: “Some young listeners would welcome a dialogue.”',
        tags: ['onair'],
        trust: 3,
        heat: 3,
        set: ['lenkaSoftened'],
        add: { lenka: 1 },
        log: 'Softened the students’ proclamation.',
        result: '“Some young listeners.” A pause. “That’s one way to put it.”',
      },
      {
        label: 'Off air: “Don’t say your name on this line. They record it.”',
        trust: -1,
        heat: -1,
        set: ['lenkaWarned'],
        add: { lenka: 1 },
        result: '“I know,” she says. “That’s why I said it.” She hangs up before you can answer.',
      },
    ],
    cut: {
      trust: -4,
      set: ['lenkaCut'],
      log: 'Cut the student off with a record.',
      result: 'The record drowns her out mid-sentence. When you check the line, it’s dead.',
    },
  },

  // ── Slot "early": one of these two rings at 22:30 ────────────────────────
  {
    id: 'keys',
    slot: 'early',
    at: '22:30',
    name: 'Hynek',
    place: 'Phone box, Wenceslas Square',
    sound: 'keys',
    text: 'Can you hear that? Keys. Two hundred thousand people shaking their keys. It means “time to go home, comrades”. I’m holding the receiver up to the crowd. Put it on air. Please. Ten seconds.',
    choices: [
      {
        label: 'Put the crowd on air',
        tags: ['live', 'onair'],
        trust: 9,
        heat: 11,
        set: ['keysOnAir'],
        log: 'Put the jingling keys of Wenceslas Square on air.',
        result:
          'Ten seconds of keys, like a hundred thousand tiny bells. The switchboard lights up all at once.',
      },
      {
        label: 'Describe it: “A lively evening in the city centre.”',
        tags: ['onair'],
        trust: 1,
        heat: 1,
        result: 'Technically true. Hynek laughs so hard he drops the receiver.',
      },
      {
        label: '“Go home, Hynek. It’s freezing.”',
        trust: -3,
        heat: -1,
        result: '“That’s the point,” he says. “We’re all going home. Just not yet.”',
      },
    ],
  },
  {
    id: 'teacher',
    slot: 'early',
    at: '22:30',
    name: 'Božena',
    place: 'Teacher, Kladno',
    text: 'The headmaster told us to tell the children nothing happened on Friday. Today a girl asked me why her father came home with his head in bandages. What do I say to her? I’m asking you because I can’t ask anyone else.',
    choices: [
      {
        label: 'On air: “Tell her the truth. Children can carry it.”',
        tags: ['police', 'onair'],
        trust: 8,
        heat: 9,
        log: 'Told a teacher, on air, to tell the children the truth.',
        result: 'A long silence. Then: “Thank you. I think I knew.”',
      },
      {
        label: '“Tell her the grown-ups are sorting it out.”',
        trust: 2,
        heat: 0,
        result: 'It’s what your mother would have said. It doesn’t sound better coming from you.',
      },
      {
        label: '“Follow your headmaster’s instructions.”',
        trust: -5,
        heat: -3,
        result: '“Yes,” she says. “Of course.” She sounds disappointed in both of you.',
      },
    ],
  },

  // ── Mr Dvořáček, "only a simple pensioner" (recurring) ────────────────────
  {
    id: 'dvoracek_1',
    character: 'dvoracek',
    required: true,
    at: '22:52',
    name: 'Mr Dvořáček',
    place: 'Pensioner, Žižkov',
    variants: [
      {
        when: 'lenkaCut',
        text: 'Good evening, my dear. I’m only a simple pensioner. That girl you cut off so sensibly, Lenka, was it? Which faculty? I’d like a word with her parents. Young people need guidance.',
      },
      {
        text: 'Good evening, my dear. I’m only a simple pensioner from Žižkov. That brave girl, Lenka, which faculty was it again? I’d like to send her flowers. And her surname, for the card?',
      },
    ],
    choices: [
      {
        label: '“The Faculty of Arts, I believe. I don’t know her surname.”',
        tags: ['names'],
        trust: -6,
        heat: -6,
        set: ['gaveName'],
        log: 'Told a friendly “pensioner” where the student studies.',
        result:
          '“The Faculty of Arts. How lovely.” You hear a pencil. Pensioners don’t usually take notes.',
      },
      {
        label: '“Callers’ names stay with this programme, sir.”',
        tags: ['onair'],
        trust: 3,
        heat: 3,
        set: ['guardedName'],
        result: '“Of course, of course. Quite right.” He hangs up a little too quickly.',
      },
      {
        label: 'On air: “Why would a pensioner need a student’s surname?”',
        tags: ['onair'],
        trust: 6,
        heat: 8,
        set: ['suspectCensor'],
        log: 'Challenged a suspicious caller on air.',
        result: 'Silence. Then a cough. “I’m only a simple pensioner.” Click.',
      },
    ],
  },

  // ── Marie, the miner's wife (recurring) ───────────────────────────────────
  {
    id: 'marie_1',
    character: 'marie',
    required: true,
    at: '23:08',
    name: 'Marie',
    place: 'Miner’s wife, Karviná',
    text: 'Good evening. My Jiří is on the night shift at the pit. The television says the miners condemn the Prague students. Nobody asked the miners. Please play something for him, and say that not all of us believe the television.',
    choices: [
      {
        label: 'Play his song and read her whole message',
        tags: ['students', 'onair'],
        music: true,
        trust: 8,
        heat: 8,
        set: ['marieRead'],
        add: { marie: 2 },
        log: 'Read the miner’s wife’s message in full.',
        result:
          '“…not all of us believe the television.” Far to the east, a canteen radio crackles.',
      },
      {
        label: 'Play his song: “For Jiří, from Marie, with love.”',
        tags: ['onair'],
        music: true,
        trust: 2,
        heat: 0,
        set: ['marieSoft'],
        add: { marie: 1 },
        result: 'A love song for the night shift. Marie thanks you twice, quietly.',
      },
      {
        label: 'Explain that dedications need prior approval',
        trust: -4,
        heat: -2,
        set: ['marieRefused'],
        result: '“Approval,” she repeats. “Of course. Everything needs approval.”',
      },
    ],
    cut: { trust: -3, set: ['marieRefused'], result: 'The record swallows her goodbye.' },
  },

  // ── Slot "factory" ────────────────────────────────────────────────────────
  {
    id: 'ckd',
    slot: 'factory',
    at: '23:25',
    name: 'Vladimír',
    place: 'Lathe operator, ČKD works',
    text: 'Today the Party secretary came to our factory and told us Prague won’t be dictated to by children. Five thousand of us shouted back: “We are not children!” I want that on the radio. In my own voice.',
    choices: [
      {
        label: 'Let him shout it, live',
        tags: ['live', 'strike', 'onair'],
        trust: 9,
        heat: 11,
        log: 'Let a factory worker shout “We are not children!” on air.',
        result: '“WE ARE NOT CHILDREN!” The VU needle slams into the red. So does your pulse.',
      },
      {
        label: '“Workers at ČKD held a lively meeting today.”',
        tags: ['onair'],
        trust: 2,
        heat: 1,
        result: '“Lively,” Vladimír says. “Yes. You could call it that.”',
      },
      {
        label: '“Sorry, comrade. Not tonight.”',
        trust: -3,
        heat: -1,
        result: 'He calls you something a lathe operator learns on the shop floor.',
      },
    ],
  },
  {
    id: 'conscript',
    slot: 'factory',
    at: '23:25',
    name: 'Radek',
    place: 'Conscript, a barracks outside Prague',
    text: 'They’ve told us we might be sent into the city. With rifles. My mother listens to you every night. Tell her… tell her I won’t do it, whatever they order. Please don’t say where I’m calling from.',
    choices: [
      {
        label: 'Read his message, leave out the barracks',
        tags: ['army', 'onair'],
        trust: 8,
        heat: 9,
        log: 'Broadcast a conscript’s refusal to march on Prague.',
        result: 'Somewhere a mother sits up in bed. Somewhere an officer reaches for a phone.',
      },
      {
        label: '“Call your mother, Radek. Not the radio.”',
        trust: 1,
        heat: -1,
        result: '“She doesn’t have a phone,” he says. “But she has you.” Then the line clicks.',
      },
      {
        label: 'Report the call to the duty officer',
        trust: -3,
        heat: -10,
        set: ['reportedSoldier'],
        log: 'Reported a conscript to the duty officer.',
        result: 'The duty officer thanks you warmly. You wash your hands for a long time.',
      },
    ],
  },

  {
    id: 'rumour',
    at: '23:44',
    name: 'Petra',
    place: 'Nursing student, Albertov',
    text: 'Everyone at the dormitory says a student was killed on Národní on Friday. A maths student. They even know his name. Is it true? If it is, people have to know. Can you say it on the radio?',
    choices: [
      {
        label: 'Repeat the rumour on air',
        tags: ['police', 'onair'],
        trust: 5,
        heat: 12,
        set: ['spreadRumour'],
        log: 'Repeated the rumour of a dead student on air.',
        result:
          'You say it. The switchboard explodes. Only afterwards do you realise you have no idea whether it’s true.',
      },
      {
        label: '“I can’t confirm it. I’ll find out, and I’ll tell you.”',
        tags: ['onair'],
        trust: 4,
        heat: 3,
        set: ['rumourCareful'],
        log: 'Refused to repeat an unconfirmed rumour, and promised to check.',
        result: '“That’s fair,” she says. “Nobody else has said that to me all week.”',
      },
      {
        label: '“Official sources say nobody died. Go to sleep.”',
        trust: -5,
        heat: -4,
        set: ['rumourDenied'],
        result: '“Official sources,” Petra says, as if tasting something sour.',
      },
    ],
  },

  // ── Slot "midnight" ───────────────────────────────────────────────────────
  {
    id: 'marta',
    slot: 'midnight',
    at: '00:02',
    name: 'Zuzka',
    place: 'Sixteen, Holešovice',
    text: 'Could you play “Prayer for Marta”? Marta Kubišová stood on the balcony on Wenceslas Square this week. For twenty years they didn’t let her sing. My dad cried. My dad never cries.',
    choices: [
      {
        label: 'Play it. There’s a copy hidden in the drawer.',
        tags: ['banned', 'onair'],
        music: true,
        trust: 12,
        heat: 14,
        set: ['playedMarta'],
        log: 'Played the banned “Prayer for Marta”.',
        result:
          'The first notes go out over Prague. Twenty years of silence, broken in three minutes.',
      },
      {
        label: 'Play an approved ballad instead',
        music: true,
        trust: -2,
        heat: 0,
        result: 'A pleasant song about a birch tree. Zuzka hangs up halfway through.',
      },
      {
        label: '“The record library doesn’t have it.”',
        trust: -3,
        heat: -1,
        result: '“Everybody has it,” she says. “Everybody’s just scared.”',
      },
    ],
  },
  {
    id: 'reporter',
    slot: 'midnight',
    at: '00:02',
    name: 'A foreign voice',
    place: 'Western news agency',
    text: 'Good evening, excuse my Czech. I am a journalist from a Western agency. People say the factory militias are leaving Prague. Can you confirm? One sentence, and I quote you tomorrow in London.',
    choices: [
      {
        label: 'Confirm it, on the record',
        tags: ['foreign', 'onair'],
        trust: 6,
        heat: 13,
        set: ['quotedAbroad'],
        log: 'Gave a quote to a Western journalist.',
        result:
          'By breakfast your sentence will be in London. By lunch it will be in a file in Prague.',
      },
      {
        label: '“No comment. But Prague is calm, and Prague is awake.”',
        tags: ['foreign', 'onair'],
        trust: 5,
        heat: 6,
        result: 'He writes it down twice. “Calm and awake. Very good. Very Czech.”',
      },
      {
        label: 'Hang up. Foreign calls are logged.',
        trust: -1,
        heat: -3,
        result: 'You hang up. The log will show that you hung up. That’s the point.',
      },
    ],
  },

  {
    id: 'threat',
    at: '00:20',
    name: 'No name given',
    place: 'A calm male voice',
    text: 'Listen carefully. Nice building you live in. Old wiring. Fires happen in old buildings, especially at night. Play the national anthem and go home early, and everybody sleeps well.',
    choices: [
      {
        label: 'Tell listeners: “This programme has just been threatened.”',
        tags: ['onair'],
        trust: 8,
        heat: 7,
        set: ['exposedThreat'],
        log: 'Told listeners about a threat, on air.',
        result:
          'You say it calmly. Within minutes, three listeners call to offer you a bed for the night.',
      },
      {
        label: 'Hang up and say nothing',
        trust: 0,
        heat: 0,
        result: 'Your hand shakes for a minute. Then it doesn’t.',
      },
      {
        label: 'Play the national anthem, as asked',
        music: true,
        trust: -6,
        heat: -8,
        set: ['obeyedThreat'],
        log: 'Played the anthem because a voice on the phone told you to.',
        result: 'The anthem at twenty past midnight. Listeners don’t know why. You do.',
      },
    ],
  },

  {
    id: 'lenka_2',
    character: 'lenka',
    required: true,
    at: '00:38',
    name: 'Lenka',
    place: 'Faculty of Arts, porter’s lodge',
    variants: [
      {
        when: 'lenkaRead',
        text: 'They heard you at the faculty. People cried, honestly. Listen: a friend’s father works at the ministry. One of your “listeners” reports to the Office. An old man. He always says he’s “only a simple pensioner”. Be careful.',
        choices: [
          {
            label: 'On air: “Thanks for the weather report. Cold front from the ministry.”',
            tags: ['onair'],
            trust: 4,
            heat: 2,
            set: ['studentWarned'],
            add: { lenka: 1 },
            result: 'Somewhere at the faculty, a room full of students laughs at the weather.',
          },
          {
            label: 'Ask her to announce the strike herself, live',
            tags: ['students', 'strike', 'live', 'onair'],
            trust: 9,
            heat: 11,
            set: ['studentWarned', 'announcedStrike'],
            add: { lenka: 1 },
            log: 'Let the student announce the general strike, live.',
            result:
              '“Monday, twelve o’clock, everyone stops for two hours.” Her voice shakes once, then doesn’t.',
          },
          {
            label: '“Stop calling here, Lenka. For your own sake.”',
            trust: -2,
            heat: -3,
            set: ['studentWarned'],
            result: '“Fine,” she says. “But now you know who you’re talking to.”',
          },
        ],
      },
      {
        when: 'lenkaCut',
        text: 'You cut me off. Two hours later they came to the dormitory and took Pavel. Maybe that’s not your fault. But you had a microphone, and you played a record.',
        choices: [
          {
            label: 'Apologise on air, and read the proclamation now',
            tags: ['students', 'onair'],
            trust: 9,
            heat: 12,
            set: ['lenkaRead', 'lenkaForgave'],
            add: { lenka: 2 },
            log: 'Apologised to the student on air and read her proclamation.',
            result: 'You read all three sentences. Then you say sorry, which is harder.',
          },
          {
            label: '“I have a job to keep. So do you: stay out of trouble.”',
            trust: -1,
            heat: 0,
            result: '“Trouble,” she says, “is already here. It’s just not on your frequency.”',
          },
          {
            label: 'Hang up',
            trust: -4,
            heat: -1,
            set: ['lenkaAbandoned'],
            result:
              'You hang up on a student for the second time tonight. It gets easier. That’s the worst part.',
          },
        ],
      },
      {
        when: 'lenkaWarned',
        text: 'Me again. No names, see? Two things. Monday at noon there’s a general strike: two hours, everyone stops. And a friend at the ministry says one of your callers reports to the Office. An old man, “only a simple pensioner”. Will you at least say the time?',
        choices: [
          {
            label: 'Announce it: “Monday. Twelve o’clock. Everyone.”',
            tags: ['strike', 'onair'],
            trust: 9,
            heat: 10,
            set: ['announcedStrike', 'studentWarned'],
            add: { lenka: 2 },
            log: 'Announced the general strike on air.',
            result:
              'Four words. In a factory office, a typist copies them onto carbon paper, ten sheets at once.',
          },
          {
            label: '“An important Monday ahead, listeners. Set your watches.”',
            tags: ['onair'],
            trust: 4,
            heat: 4,
            set: ['studentWarned'],
            add: { lenka: 1 },
            result: '“Set your watches,” she repeats. “Okay. That works.”',
          },
          {
            label: '“I can’t. Not on this frequency.”',
            trust: -3,
            heat: -1,
            set: ['studentWarned'],
            result: '“Then at least watch out for the pensioner,” she says, and is gone.',
          },
        ],
      },
      {
        text: 'You said “some young listeners”. We have names. The whole faculty has names. Monday at noon there’s a general strike: two hours, everyone stops work. Will you at least say the time?',
        choices: [
          {
            label: 'Announce it: “Monday. Twelve o’clock. Everyone.”',
            tags: ['strike', 'onair'],
            trust: 9,
            heat: 10,
            set: ['announcedStrike'],
            add: { lenka: 1 },
            log: 'Announced the general strike on air.',
            result:
              'Four words. In a factory office, a typist copies them onto carbon paper, ten sheets at once.',
          },
          {
            label: '“An important Monday ahead, listeners. Set your watches.”',
            tags: ['onair'],
            trust: 4,
            heat: 4,
            add: { lenka: 1 },
            result: '“Set your watches,” she repeats. “Okay. That works.”',
          },
          {
            label: '“I can’t. Not on this frequency.”',
            trust: -3,
            heat: -1,
            result: '“Then what is it for?” she asks. You don’t have an answer.',
          },
        ],
      },
    ],
    cut: {
      trust: -4,
      set: ['lenkaAbandoned'],
      log: 'Played a record over the student, again.',
      result: 'You drop the needle on her again. The line goes dead.',
    },
  },

  // ── Slot "hospital" ───────────────────────────────────────────────────────
  {
    id: 'nurse',
    slot: 'hospital',
    at: '01:05',
    name: 'Olga',
    place: 'Nurse, near Národní třída',
    text: 'On Friday night we treated people from Národní until morning. Broken arms, split heads, a girl who couldn’t stop shaking. The papers say there were “no serious injuries”. I was there. I’ll say it myself if you let me.',
    choices: [
      {
        label: 'Let her tell it, live',
        tags: ['live', 'police', 'onair'],
        trust: 11,
        heat: 13,
        log: 'Let a nurse describe the injuries of 17 November, live.',
        result:
          'She speaks for two minutes without notes. When she finishes, nobody in the studio moves.',
      },
      {
        label: 'Summarise: “Medical staff report many injuries.”',
        tags: ['police', 'onair'],
        trust: 6,
        heat: 7,
        result: 'Five careful words. Olga says, “Well. It’s more than the papers.”',
      },
      {
        label: 'Read the official line: “No serious injuries.”',
        tags: ['propaganda'],
        trust: -8,
        heat: -6,
        set: ['readOfficialLine'],
        log: 'Read the official “no serious injuries” line to a nurse who was there.',
        result: 'She doesn’t hang up. She just listens to you say it. That’s worse.',
      },
    ],
  },
  {
    id: 'militiaman',
    slot: 'hospital',
    at: '01:05',
    name: 'Bohumil',
    place: 'People’s Militia, Kladno',
    text: 'I’m in the People’s Militia. On Tuesday they put us on buses with rifles and drove us to Prague. Today they sent us home. Nobody told us why we came. I sat on that bus thinking about my daughter on the square. I’m ashamed.',
    choices: [
      {
        label: 'Let him say it himself, live',
        tags: ['live', 'onair'],
        trust: 9,
        heat: 10,
        log: 'Broadcast a militiaman’s confession, live.',
        result:
          '“I’m ashamed,” he says again, on air this time. His voice doesn’t break. Yours nearly does.',
      },
      {
        label: '“Thank you. That stays between us.”',
        trust: 1,
        heat: 0,
        result: '“Good,” he says. “I just needed somebody to know.”',
      },
      {
        label: '“Your shame is your own business.” Hang up.',
        trust: -3,
        heat: -1,
        result: 'The dial tone sounds like a verdict. You’re not sure whose.',
      },
    ],
  },

  {
    id: 'dvoracek_2',
    character: 'dvoracek',
    required: true,
    at: '01:24',
    name: 'Mr Dvořáček',
    place: 'Pensioner, Žižkov',
    variants: [
      {
        when: 'gaveName',
        text: 'Only a simple pensioner again, my dear. Oh, and thank you for your help with the flowers. They were delivered. Now: I have a letter from the workers of a Prague engineering plant condemning the hooligans on Wenceslas Square. Balance is so important.',
      },
      {
        text: 'Only a simple pensioner again, my dear. I have here a letter from the workers of a Prague engineering plant. It condemns the hooligans on Wenceslas Square. Surely you’ll read it? Balance is so important.',
      },
    ],
    choices: [
      {
        label: 'Read the workers’ letter on air',
        tags: ['propaganda', 'onair'],
        trust: -12,
        heat: -10,
        set: ['readPropaganda'],
        log: 'Read a “workers’ letter” condemning the students.',
        result:
          'The letter has four signatures and no factory name. You read it anyway. The switchboard goes dark.',
      },
      {
        label: '“Send it to the newsroom, sir. They handle letters.”',
        trust: 1,
        heat: 3,
        result: '“The newsroom. Of course.” He says it as if he’s writing it down.',
      },
      {
        when: { any: ['studentWarned', 'suspectCensor'] },
        label: 'On air: “Only a simple pensioner? Give my regards to the Office.”',
        tags: ['onair'],
        trust: 12,
        heat: 15,
        set: ['exposedCensor'],
        log: 'Unmasked the “simple pensioner” on air.',
        result:
          'The silence on the line is the loudest thing you’ve broadcast all night. Then: click.',
      },
      {
        when: { not: ['studentWarned', 'suspectCensor'] },
        label: '“Read it yourself, sir. Live. I’ll put you on.”',
        tags: ['live', 'onair'],
        trust: 4,
        heat: 6,
        set: ['suspectCensor'],
        result:
          'He clears his throat. “Another time, my dear.” Most pensioners are thrilled to be on the radio.',
      },
    ],
  },

  // ── Slot "confession" ─────────────────────────────────────────────────────
  {
    id: 'partycard',
    slot: 'confession',
    at: '01:42',
    name: 'Ing. Šustr',
    place: 'Engineer, Party member since 1967',
    text: 'Twenty-two years a Party member. Tonight I put my card in the stove. My wife watched and didn’t say a word. I don’t want to be on the radio. I just wanted one person to know.',
    choices: [
      {
        label: 'Read his confession on air, without his name',
        tags: ['onair'],
        trust: 6,
        heat: 6,
        log: 'Read a Party member’s anonymous confession on air.',
        result:
          'You tell Prague that a man burned his Party card tonight. Thousands of people look at their stoves.',
      },
      {
        label: '“Your secret’s safe. Thank you for telling me.”',
        trust: 2,
        heat: 0,
        set: ['keptConfession'],
        result: 'He breathes out. “Twenty-two years,” he says. “It burned in about a second.”',
      },
      {
        label: '“You’ll regret that by morning, comrade.”',
        trust: -4,
        heat: -3,
        result: '“Maybe,” he says. “But not the way you mean.”',
      },
    ],
  },
  {
    id: 'boy',
    slot: 'confession',
    at: '01:42',
    name: 'Kubík',
    place: 'Nine years old, Smíchov',
    text: 'My mum and dad went to the square and they’re not back yet. Grandma fell asleep in the chair. Are the people on the square okay? Can you say hello to them from me?',
    choices: [
      {
        label: 'Put him on air to say hello',
        tags: ['live', 'onair'],
        trust: 7,
        heat: 3,
        log: 'Let a nine-year-old say hello to the square, live.',
        result:
          '“Hello, square!” Somewhere on Wenceslas Square, a man with a transistor radio laughs and cries at once.',
      },
      {
        label: 'Tell him the square is safe, and play a lullaby',
        tags: ['onair'],
        music: true,
        trust: 4,
        heat: 0,
        result: 'By the second verse you can hear him yawning down the line.',
      },
      {
        label: '“You should be asleep, young man. Goodnight.”',
        trust: -2,
        heat: 0,
        result: '“Okay,” he says. He doesn’t sound sleepy at all.',
      },
    ],
  },

  {
    id: 'marie_2',
    character: 'marie',
    required: true,
    at: '02:00',
    name: 'Marie',
    place: 'Karviná',
    variants: [
      {
        when: 'marieRead',
        text: 'It’s Marie. The men heard you in the canteen at the shift change. Jiří says they’re talking about joining the strike. But the foreman wrote down every name in that canteen. They vote at six. What do I tell them?',
        choices: [
          {
            label: 'On air: “Karviná is listening. Karviná is not alone.”',
            tags: ['strike', 'onair'],
            trust: 8,
            heat: 10,
            set: ['karvinaOnAir'],
            add: { marie: 1 },
            log: 'Told Prague that Karviná was listening.',
            result: 'You say the name of the town twice, slowly, so it sticks.',
          },
          {
            label: 'Off air: “Tell Jiří to vote with his conscience. No names on the phone.”',
            trust: 2,
            heat: 0,
            set: ['mariePrudent'],
            add: { marie: 1 },
            result: '“With his conscience,” she says. “He’s got a big one. That’s the trouble.”',
          },
          {
            label: '“Tell them to keep their heads down.”',
            trust: -3,
            heat: -2,
            set: ['marieDiscouraged'],
            result: '“That’s what they’ve done for twenty years,” she says.',
          },
        ],
      },
      {
        when: 'marieSoft',
        text: 'It’s Marie. Jiří heard the song in the cage going down. He said: “So the radio won’t say it either.” Was that you being careful, or afraid? The men vote at six on joining the strike.',
        choices: [
          {
            label: '“Careful. But I’ll say it now: not all of us believe it.”',
            tags: ['onair'],
            trust: 7,
            heat: 7,
            add: { marie: 1 },
            log: 'Said, late but on air, that not everyone believes the television.',
            result: 'Late, but on air. Marie says she’ll tell Jiří you’re slow, not deaf.',
          },
          {
            label: '“Careful. Tell him I’m sorry.”',
            trust: 1,
            heat: 0,
            result: '“I’ll tell him,” she says. You both know he won’t care.',
          },
          {
            label: '“Afraid. Like everyone.”',
            trust: 3,
            heat: 1,
            set: ['admittedFear'],
            result: '“Well,” she says, softer. “At least that’s honest.”',
          },
        ],
      },
      {
        text: 'Marie again. You wouldn’t let me say it, so I’ll tell you: my husband’s brigade talked tonight. Nobody said a word against the students. Not one. Maybe you can’t say that either.',
        choices: [
          {
            label: 'On air: “Karviná, we hear you.”',
            tags: ['strike', 'onair'],
            trust: 8,
            heat: 9,
            set: ['karvinaOnAir'],
            add: { marie: 1 },
            log: 'Told Karviná, on air, that Prague hears them.',
            result: 'Three words. Marie makes a sound that might be a laugh.',
          },
          {
            label: 'Play the song for Jiří, finally',
            tags: ['onair'],
            music: true,
            trust: 4,
            heat: 1,
            add: { marie: 1 },
            result: 'Better late. She hums along to the chorus, badly, which is the best way.',
          },
          {
            label: '“I’m sorry, Marie.” Hang up.',
            trust: -2,
            heat: 0,
            set: ['marieDiscouraged'],
            result: 'You hang up first. You’ve never done that to a listener before.',
          },
        ],
      },
    ],
    cut: {
      trust: -3,
      set: ['marieDiscouraged'],
      result: 'The record plays over Marie. Karviná goes quiet.',
    },
  },

  // ── Slot "tip": one of three ──────────────────────────────────────────────
  {
    id: 'engineer',
    slot: 'tip',
    at: '02:20',
    name: 'Franta',
    place: 'Engineer at the transmitter',
    text: 'Franta here, at the transmitter. The Office wants tonight’s tape on their desk by seven. I could say the machine chewed it. Happens with old machines. Your call.',
    choices: [
      {
        label: '“Let it chew.”',
        trust: 0,
        heat: -10,
        set: ['tapeLost'],
        log: 'Had the night’s tape “accidentally” destroyed.',
        result:
          'A crunch, a curse, a long ribbon of brown tape. “Oh dear,” says Franta, very flatly.',
      },
      {
        label: '“Keep it safe. Make a copy.”',
        trust: 3,
        heat: 5,
        set: ['tapeCopied'],
        log: 'Asked the engineer to copy the night’s tape.',
        result: '“A copy,” Franta says. “I’ll label it ‘weather’. Nobody steals the weather.”',
      },
      {
        label: '“Give them the tape. I’ve got nothing to hide.”',
        trust: 1,
        heat: 2,
        set: ['tapeGiven'],
        result: '“Brave,” says Franta. “Or stupid. In my experience, it’s the same tape.”',
      },
    ],
  },
  {
    id: 'typist',
    slot: 'tip',
    at: '02:20',
    name: 'A tired woman',
    place: '“A building I won’t name”',
    text: 'I type the minutes for very important men. Tomorrow evening the whole leadership will resign. All of them. I typed the draft myself an hour ago. Do what you like with it.',
    choices: [
      {
        label: 'Report it as an unconfirmed rumour',
        tags: ['onair'],
        trust: 6,
        heat: 10,
        set: ['reportedResignation'],
        log: 'Announced the leadership’s resignation a day early.',
        result: '“Unconfirmed,” you stress. Nobody in Prague hears that word.',
      },
      {
        label: 'Keep it to yourself and wait',
        trust: 0,
        heat: 0,
        set: ['knewResignation'],
        result: 'You write it on the back of a memo and turn it face down.',
      },
      {
        label: '“Please don’t call this line with fairy tales.”',
        trust: -2,
        heat: -1,
        result: '“Fairy tales,” she says. “Yes. Those end tomorrow too.”',
      },
    ],
  },
  {
    id: 'taxi',
    slot: 'tip',
    at: '02:20',
    name: 'Standa',
    place: 'Taxi driver',
    text: 'Driving all night. Hotel guests, Party men, students. You know what? Tonight nobody argues with me. Even the Party men look at their shoes. Play something to drive to, will you? Something with drums.',
    choices: [
      {
        label: 'Play him the loudest thing in the cupboard',
        music: true,
        trust: 4,
        heat: 2,
        result:
          'Drums, finally. Across the city, a taxi takes the bend on Václavská a little too fast.',
      },
      {
        label: 'Ask him what he’s seen tonight, live',
        tags: ['live', 'onair'],
        trust: 6,
        heat: 6,
        log: 'Let a taxi driver describe Prague by night, live.',
        result:
          'Standa describes the city in the voice of a man who has seen everything twice. Tonight, he says, is new.',
      },
      {
        label: '“Eyes on the road, Standa.”',
        trust: 0,
        heat: 0,
        result: '“They’re always on the road,” he says. “That’s the problem with this job.”',
      },
    ],
  },

  {
    id: 'newsroom',
    at: '02:40',
    name: 'Hana',
    place: 'Night newsroom, two floors up',
    variants: [
      {
        when: 'spreadRumour',
        text: 'Hana from the newsroom. That dead student you mentioned on air? He’s alive. Somebody planted the story. The morning papers will hang it round your neck. You need to correct it, now.',
        choices: [
          {
            label: 'Correct it on air, plainly',
            tags: ['onair'],
            trust: 3,
            heat: -2,
            log: 'Corrected the false rumour on air.',
            result: 'You say you were wrong. It costs less than you feared. It usually does.',
          },
          {
            label: 'Say nothing and hope nobody remembers',
            trust: -8,
            heat: 2,
            set: ['ignoredCorrection'],
            log: 'Left a false rumour uncorrected.',
            result: 'Everybody remembers. That’s the thing about rumours.',
          },
          {
            label: 'Correct it, and ask who gains from a fake martyr',
            tags: ['onair', 'police'],
            trust: 6,
            heat: 8,
            log: 'Corrected the rumour and asked who planted it.',
            result: 'A good question. In the newsroom, Hana writes it on the board.',
          },
        ],
      },
      {
        when: 'rumourCareful',
        text: 'Hana, newsroom. That dead student story is false. He’s alive. Somebody planted it. Good thing you didn’t repeat it. Want to keep your promise to that nursing student?',
        choices: [
          {
            label: '“As promised: the rumour is false. He’s alive.”',
            tags: ['onair'],
            trust: 8,
            heat: 2,
            log: 'Kept a promise and killed a false rumour.',
            result: 'Somewhere in Albertov, Petra hears it, and believes you, because you checked.',
          },
          {
            label: 'Leave it for the morning news',
            trust: 1,
            heat: 0,
            result: 'Hana shrugs audibly. “Your promise, not mine.”',
          },
        ],
      },
      {
        when: 'rumourDenied',
        text: 'Hana, newsroom. The dead student rumour is false. Nobody died. So the official line was right, for once. Don’t let it go to your head.',
        choices: [
          {
            label: '“For once, the official sources were right.”',
            tags: ['onair'],
            trust: -2,
            heat: -4,
            result: 'True. It still tastes like ash.',
          },
          {
            label: 'Say nothing',
            trust: 0,
            heat: 0,
            result: 'Some truths don’t need you.',
          },
        ],
      },
      {
        text: 'Hana, newsroom. That story going round about a dead student? He’s alive. Somebody planted it. Thought you should know before your listeners ask.',
        choices: [
          {
            label: 'Pass it on to the listeners',
            tags: ['onair'],
            trust: 3,
            heat: 1,
            result: 'One less ghost in the city tonight.',
          },
          {
            label: '“Not our business.”',
            trust: -1,
            heat: 0,
            result: '“Everything is our business,” says Hana. “That’s the job.”',
          },
        ],
      },
    ],
  },

  {
    id: 'dvoracek_3',
    character: 'dvoracek',
    required: true,
    at: '03:12',
    name: 'Mr Dvořáček',
    place: 'Žižkov, apparently',
    variants: [
      {
        when: 'exposedCensor',
        name: 'The pensioner',
        place: 'No longer pretending',
        text: 'No pensioner tonight. You know who I am. Eleven years I’ve sat in that office with headphones on, listening to you. Tonight my superiors aren’t answering their phones. If tomorrow belongs to them out there, will you remember I let you finish your sentences?',
        choices: [
          {
            label: '“Say that on air yourself. With your real name.”',
            tags: ['live', 'onair'],
            trust: 10,
            heat: 6,
            set: ['censorConfessed'],
            log: 'Let the censor confess on air, under his real name.',
            result:
              'He says his name. His rank. His office number. Then, very quietly: “I liked the programme.”',
          },
          {
            label: '“I’ll remember. Off the record.”',
            trust: -2,
            heat: -5,
            set: ['censorDeal'],
            log: 'Made a quiet deal with the censor.',
            result:
              '“Off the record,” he repeats. “There’s no such thing, my dear. But thank you.”',
          },
          {
            label: 'Hang up on him',
            trust: 2,
            heat: 4,
            set: ['censorRejected'],
            result: 'For eleven years he had the last word. Not tonight.',
          },
        ],
      },
      {
        when: { any: ['readPropaganda', 'gaveName'] },
        text: 'My dear, you have been very sensible tonight. The Office appreciates it. A word of advice: if things change tomorrow, it would be wise to have friends on both sides. Some of us are preparing lifeboats. Would you like a seat?',
        choices: [
          {
            label: '“Save me a seat.”',
            trust: -6,
            heat: -8,
            set: ['censorDeal'],
            log: 'Accepted the censor’s offer of a “lifeboat”.',
            result: '“Splendid.” You hear him write something down. It might be your name.',
          },
          {
            label: '“I’d rather swim.”',
            trust: 3,
            heat: 6,
            result: '“The water is very cold in November, my dear.” Click.',
          },
          {
            label: 'On air: “The Office is booking lifeboats, listeners.”',
            tags: ['onair'],
            trust: 12,
            heat: 16,
            set: ['exposedCensor'],
            log: 'Exposed the censor’s “lifeboat” offer on air.',
            result:
              'Every taxi driver, baker and night nurse in Prague now knows the rats are measuring the ship.',
          },
        ],
      },
      {
        text: 'Only a simple pensioner again. I couldn’t sleep. I used to love this programme, you know, before I had to… before. Hm. Tell me, do you think the people on the square are right?',
        choices: [
          {
            label: '“Yes. And I think you think so too.”',
            tags: ['onair'],
            trust: 6,
            heat: 5,
            set: ['censorWavering'],
            result: 'A very long pause. “Goodnight, my dear.” He sounds, for the first time, old.',
          },
          {
            label: '“I think it’s late, sir. Goodnight.”',
            trust: 0,
            heat: 0,
            result: '“Late,” he agrees. “Later than they think.”',
          },
          {
            label: 'On air: “Who exactly do you work for?”',
            tags: ['onair'],
            trust: 8,
            heat: 9,
            set: ['suspectCensor'],
            log: 'Asked the “pensioner”, on air, who he works for.',
            result: 'Silence. Then: “For people who are about to be very surprised.” Click.',
          },
        ],
      },
    ],
  },

  // ── Slot "dawn" ───────────────────────────────────────────────────────────
  {
    id: 'baker',
    slot: 'dawn',
    at: '03:34',
    name: 'Alois',
    place: 'Baker, Smíchov',
    text: 'First loaves are in the oven. I’ve had you on all night. At six the trams start and people will queue for bread, and nobody will say anything. Say something for them, the people in the queue. Something to chew on.',
    choices: [
      {
        label: '“Whatever you hear today, believe your neighbours.”',
        tags: ['onair'],
        trust: 6,
        heat: 5,
        result: 'Alois repeats it to his apprentice, who repeats it to the oven.',
      },
      {
        label: 'Read the bread prices and the weather',
        trust: -1,
        heat: -2,
        result: 'Rye, 2.60 crowns. Cloudy, minus two. Alois sighs like a deflating loaf.',
      },
      {
        label: '“Tell them yourself, Alois. You’re on air.”',
        tags: ['live', 'onair'],
        trust: 7,
        heat: 6,
        log: 'Put a baker on air to speak to the morning queues.',
        result: '“Good morning, Prague,” says Alois, “the bread is fresh and so are we.”',
      },
    ],
  },
  {
    id: 'actress',
    slot: 'dawn',
    at: '03:34',
    name: 'Eliška',
    place: 'Actress, a theatre on strike',
    text: 'No play tonight. No play all week. The theatres are on strike. We open the doors and talk with whoever comes in. Tonight a bus driver stood on our stage and spoke for an hour. Will you read our listing? “Tonight: the truth. Free entry.”',
    choices: [
      {
        label: 'Read it like any other theatre listing',
        tags: ['strike', 'onair'],
        trust: 8,
        heat: 8,
        log: 'Read a striking theatre’s listing: “Tonight: the truth.”',
        result: '“…Free entry.” It sounds exactly like a listing. It sounds like nothing ever has.',
      },
      {
        label: '“Theatre listings are for the morning programme.”',
        trust: -1,
        heat: 0,
        result: '“Then I’ll call the morning programme,” she says, “if there is one.”',
      },
      {
        label: 'Ask her for a monologue, live',
        tags: ['live', 'onair'],
        trust: 6,
        heat: 4,
        result:
          'She gives you Hamlet, of all things, at half past three in the morning. Nobody switches off.',
      },
    ],
  },

  {
    id: 'lenka_3',
    character: 'lenka',
    required: true,
    at: '03:58',
    name: 'Lenka',
    place: 'Faculty of Arts',
    variants: [
      {
        when: 'gaveName',
        name: 'Jana',
        place: 'Lenka’s roommate',
        text: 'This is Jana, Lenka’s roommate. They took Lenka from the faculty at two. They knew which faculty, which floor. She told me to call you. She said: “Ask him who he talked to.”',
        choices: [
          {
            label: 'On air: “A student from the Faculty of Arts was detained tonight.”',
            tags: ['students', 'onair'],
            trust: 8,
            heat: 14,
            set: ['announcedArrest'],
            log: 'Announced the student’s arrest on air.',
            result:
              'You can’t take back what you told the pensioner. You can make sure Prague knows.',
          },
          {
            label: '“I’m sorry.” That’s all.',
            trust: -2,
            heat: 0,
            result: '“Sorry,” Jana repeats. “I’ll tell her. She’ll know what it means.”',
          },
          {
            label: 'Hang up',
            trust: -5,
            heat: -2,
            result: 'You hang up. The red light on line one stays dark for a long time.',
          },
        ],
      },
      {
        when: { min: { lenka: 3 } },
        text: 'It’s Lenka! The whole faculty is awake. We’ve printed what you read on leaflets. In the morning we take them to the factories. Will you say one last thing for us before dawn?',
        choices: [
          {
            label: '“Monday at noon. We’ll all be there.”',
            tags: ['strike', 'onair'],
            trust: 10,
            heat: 12,
            set: ['promisedMonday'],
            log: 'Promised the students, on air: “Monday at noon. We’ll all be there.”',
            result:
              'You hear cheering in the porter’s lodge, then someone shushing it, then more cheering.',
          },
          {
            label: 'Play her the song that isn’t allowed',
            tags: ['banned', 'onair'],
            music: true,
            trust: 8,
            heat: 10,
            result:
              'She doesn’t say anything. She doesn’t need to. You can hear the faculty singing.',
          },
          {
            label: '“Get some sleep, Lenka.”',
            trust: 2,
            heat: 0,
            result: '“Sleep,” she laughs. “Sure. Next week.”',
          },
        ],
      },
      {
        when: 'lenkaAbandoned',
        name: 'Pavel',
        place: 'Student, just released',
        text: 'It’s Pavel. They let me go an hour ago. Lenka asked me to call you. She said: “Ask if he’s still playing records.”',
        choices: [
          {
            label: '“Not any more.” Then, on air: “Monday. Noon.”',
            tags: ['strike', 'onair'],
            trust: 9,
            heat: 11,
            set: ['announcedStrike'],
            log: 'Answered the students at last: “Monday. Noon.”',
            result: 'Pavel laughs, then coughs, then laughs again. “I’ll tell her.”',
          },
          {
            label: '“Tell her I’m sorry.”',
            trust: 1,
            heat: 0,
            result: '“She knows,” Pavel says. “That’s why she sent me.”',
          },
          {
            label: 'Hang up',
            trust: -4,
            heat: -1,
            result: 'Three calls. Three times you chose the record. That’s a pattern.',
          },
        ],
      },
      {
        text: 'It’s Lenka. I don’t know why I keep calling you. Maybe because you’re the only one awake. Pavel says radio people are cowards. Prove him wrong? Say one true thing before six.',
        choices: [
          {
            label: '“On Friday, on Národní, the police beat children. That’s true.”',
            tags: ['police', 'onair'],
            trust: 10,
            heat: 14,
            log: 'Said the truth about Národní třída on air.',
            result: 'One true sentence. It’s amazing how loud one sentence can be.',
          },
          {
            label: '“The truth is, I’m scared too.”',
            tags: ['onair'],
            trust: 6,
            heat: 3,
            set: ['admittedFear'],
            result: '“Okay,” she says. “That counts.”',
          },
          {
            label: '“Nothing on this frequency is true, Lenka. Go to bed.”',
            trust: -5,
            heat: -2,
            result: 'She goes to bed. Pavel wins the argument.',
          },
        ],
      },
    ],
  },

  {
    id: 'marie_3',
    character: 'marie',
    required: true,
    at: '04:25',
    name: 'Marie',
    place: 'Karviná',
    variants: [
      {
        when: { min: { marie: 3 } },
        text: 'Marie! The pit voted early. They’ll stop on Monday at noon with everyone else. Jiří said: tell the man on the radio we heard him. Or the woman. Whoever you are. I’m making him dumplings at half past four in the morning, can you imagine?',
        choices: [
          {
            label: 'On air: “Karviná stops on Monday. Prague, did you hear that?”',
            tags: ['strike', 'onair'],
            trust: 10,
            heat: 10,
            set: ['minersJoin'],
            log: 'Told Prague the Karviná miners would join the strike.',
            result: 'Prague heard it. So did the Office. So did every pit in Ostrava.',
          },
          {
            label: 'Play a song for the two of them',
            tags: ['onair'],
            music: true,
            trust: 5,
            heat: 0,
            set: ['minersJoin'],
            result: 'Dumplings and a love song at dawn. History can wait four minutes.',
          },
        ],
      },
      {
        when: 'karvinaOnAir',
        text: 'They heard you, all right. So did the foreman. Jiří has been suspended for “agitation”. He’s sitting in the kitchen laughing. He says it’s the best thing that’s happened to him in twenty years.',
        choices: [
          {
            label: 'On air: “Jiří from Karviná, suspended for listening.”',
            tags: ['names', 'onair'],
            trust: 8,
            heat: 12,
            set: ['jiriSuspended'],
            log: 'Named a suspended miner on air.',
            result: 'By morning, three other pits have heard of Jiří. The foreman starts to worry.',
          },
          {
            label: 'Off air: “He won’t be suspended for long.”',
            trust: 3,
            heat: 0,
            set: ['jiriSuspended'],
            result: '“From your lips,” says Marie, “to God’s ear. Or the Ministry’s.”',
          },
        ],
      },
      {
        when: { anyOf: [{ flags: ['marieDiscouraged'] }, { max: { marie: 1 } }] },
        text: 'Marie. The brigade didn’t vote in the end. Nobody wanted to be the first. Jiří says it’s better this way. I don’t know. I keep the radio on anyway.',
        choices: [
          {
            label: '“Monday is still coming, Marie.”',
            tags: ['strike', 'onair'],
            trust: 5,
            heat: 6,
            set: ['minersStayed'],
            result: '“Monday,” she says, as if trying the word on.',
          },
          {
            label: '“He’s probably right.”',
            trust: -3,
            heat: -1,
            set: ['minersStayed'],
            result: '“Probably,” she says. Neither of you believes it.',
          },
        ],
      },
      {
        text: 'Marie. Jiří’s brigade will join the strike, quietly. They’ll stand by the machines for two hours. It’s not much, is it?',
        choices: [
          {
            label: 'On air: “It’s everything.”',
            tags: ['strike', 'onair'],
            trust: 7,
            heat: 7,
            set: ['minersJoin'],
            log: 'Told the miners, on air, that two quiet hours are everything.',
            result: 'Marie is quiet for a moment. “I’ll tell him you said that.”',
          },
          {
            label: 'Play them a song',
            tags: ['onair'],
            music: true,
            trust: 3,
            heat: 0,
            set: ['minersJoin'],
            result: 'A song for a brigade that will stand still on Monday.',
          },
        ],
      },
    ],
  },

  {
    id: 'cleaner',
    at: '04:55',
    name: 'Věra',
    place: 'Cleaner, this building',
    variants: [
      {
        when: { heatMin: 60 },
        text: 'It’s Věra, I clean your corridor. I’ve had my little radio on all night while I mop. There are two men in the lobby who aren’t from the radio. I made you coffee. It’s on the stool outside the studio. Are you all right?',
      },
      {
        text: 'It’s Věra, I clean your corridor. I’ve had my little radio on all night while I mop. Whatever happens at six, I made you coffee. It’s on the stool outside the studio. Are you all right?',
      },
    ],
    choices: [
      {
        label: 'On air: “I’m all right, Věra. Thank you, from all of us.”',
        tags: ['onair'],
        trust: 4,
        heat: 0,
        result:
          'Prague learns that the night host has a coffee and a friend. It helps more than it should.',
      },
      {
        label: '“I don’t know, Věra. Ask me at six.”',
        trust: 2,
        heat: 0,
        result: '“I will,” she says. “I’ll be here. I’m always here.”',
      },
      {
        when: { heatMin: 60 },
        label: '“If they take me, tell my mother I’m sorry.”',
        trust: 1,
        heat: 0,
        set: ['leftMessage'],
        result: '“Tell her yourself,” says Věra. “You’ll see her for Christmas.”',
      },
    ],
  },

  // Triggered: rings as soon as Trust falls to 20, once per night.
  {
    id: 'director',
    trigger: { trustMax: 20 },
    name: 'Comrade Director',
    place: 'Station director, at home in his pyjamas',
    text: 'Do you know what I’m looking at? The switchboard report. Nobody is calling. Nobody. My own wife has switched over to Vienna. Whatever you are doing, stop it. Give them a reason to listen.',
    choices: [
      {
        label: '“They’ll come back. Give me an hour.”',
        trust: 2,
        heat: 0,
        result: '“An hour,” he says, and goes to switch his wife back.',
      },
      {
        label: 'Put him on air, pyjamas and all',
        tags: ['live', 'onair'],
        trust: 7,
        heat: 3,
        log: 'Put the station director on air in his pyjamas.',
        result:
          '“This is the director. Please keep listening.” Half of Prague turns the volume up just to hear him squirm.',
      },
    ],
  },
];

// Memos and notes land on the desk instead of ringing. A memo with a `rule`
// forbids choices carrying any of its tags for the next `calls` calls.
const MEMOS = [
  {
    id: 'memo_1',
    at: '22:42',
    title: 'Directive 47/89',
    text: 'Effective immediately: no reporting on the events of 17 November, on so-called “strikes”, or on rumours of casualties. Listener dedications must carry no political content. Compliance will be monitored.',
    rule: {
      forbid: ['students', 'strike', 'police'],
      calls: 4,
      penalty: 7,
      summary: 'No students, no strikes, no police.',
    },
    choices: [
      {
        label: 'Initial it and pin it to the console',
        result: 'You pin it next to the clock, where you can’t miss it. That’s the idea.',
      },
      {
        label: 'Read the directive out on air',
        tags: ['onair'],
        trust: 12,
        heat: 13,
        set: ['readMemo'],
        log: 'Read a censor’s directive out on air.',
        result:
          '“…compliance will be monitored.” You fold the paper. “Good evening, Office. We know you’re listening.”',
      },
    ],
  },
  {
    id: 'memo_2',
    at: '00:55',
    title: 'Directive 52/89',
    variants: [
      {
        when: 'readMemo',
        text: 'Your broadcast of internal correspondence has been noted at the highest level. Further: no listener may be put on air live. All calls are to be summarised by the presenter. There will be no further warnings.',
        rule: { forbid: ['live'], calls: 3, penalty: 10, summary: 'No callers live on air.' },
      },
      {
        text: 'No listener may be put on air live. All calls are to be summarised by the presenter, in approved language. Recent lapses of discipline have been noted.',
      },
    ],
    rule: { forbid: ['live'], calls: 3, penalty: 7, summary: 'No callers live on air.' },
    choices: [
      {
        label: 'Initial it and pin it up',
        result: 'Two memos on the console now. They look like they’re breeding.',
      },
      {
        label: 'Read this one on air too',
        tags: ['onair'],
        trust: 10,
        heat: 15,
        set: ['readMemo2'],
        log: 'Read a second censor’s directive on air.',
        result:
          'You read it in the voice you use for the shipping forecast. It works horribly well.',
      },
    ],
  },
  {
    id: 'memo_3',
    at: '03:00',
    title: 'Directive 58/89',
    text: 'The words “strike”, “Civic Forum” and “Monday” are not to be used on air. From 04:00, music is to be selected from the attached approved list only. Your engineer has been instructed accordingly.',
    rule: {
      forbid: ['strike'],
      calls: 3,
      penalty: 8,
      summary: 'Never say “strike” or “Monday”.',
    },
    choices: [
      {
        label: 'Initial it and pin it up',
        result: 'The approved list is mostly brass bands. Somebody has underlined one polka twice.',
      },
      {
        label: 'Read out the forbidden words, slowly',
        tags: ['onair'],
        trust: 12,
        heat: 13,
        set: ['readMemo3'],
        log: 'Read the list of forbidden words on air, slowly.',
        result: '“Strike. Civic Forum. Monday.” Three words, now in every kitchen in Prague.',
      },
    ],
  },
  {
    // Triggered: lands on the desk as soon as Heat reaches 80, once per night.
    id: 'warning',
    trigger: { heatMin: 80 },
    title: 'Final warning',
    text: 'Your programme is now monitored minute by minute. The duty officer at the transmitter has his hand on the switch. One more provocation and The Night Line ends tonight.',
    choices: [
      {
        label: 'Pin it up and lower your voice',
        trust: 0,
        heat: -5,
        result:
          'You pin it where the clock was. For a while, you watch the memo instead of the time.',
      },
      {
        label: 'Read it on air: let Prague hear the threat',
        tags: ['onair'],
        trust: 10,
        heat: 10,
        set: ['readWarning'],
        log: 'Read the Office’s final warning on air.',
        result:
          '“…ends tonight.” You put the paper down. “Well, Prague. Shall we see whether it does?”',
      },
    ],
  },
  {
    id: 'signoff',
    at: '05:30',
    style: 'note',
    title: 'Sign-off',
    text: 'Half past five. The official sign-off sheet lies on the desk: “Good morning, comrades. A new working day for the Republic begins.” You have one last thing to say before six.',
    choices: [
      {
        label: 'Read the official sign-off',
        trust: -4,
        heat: -6,
        set: ['officialSignOff'],
        log: 'Signed off with the official text.',
        result: '“…for the Republic begins.” It sounds older than it did yesterday.',
      },
      {
        label: '“See you all on Monday. At noon.”',
        tags: ['strike', 'onair'],
        trust: 8,
        heat: 10,
        set: ['mondaySignOff'],
        log: 'Signed off with “See you all on Monday. At noon.”',
        result: 'Everyone who needs to understand it understands it. So does the Office.',
      },
      {
        label: 'Thirty seconds of silence for Národní třída',
        tags: ['onair'],
        trust: 7,
        heat: 6,
        set: ['silentSignOff'],
        log: 'Signed off with thirty seconds of silence for Národní třída.',
        result:
          'Dead air, on purpose. The longest thirty seconds of your career. Nobody tunes away.',
      },
    ],
  },
];

// Random events slip in between calls. type: 'static' (retune the dial in
// time), 'flicker' (power cut, then a choice) or 'call' (a phone call).
const RANDOM_EVENTS = [
  {
    id: 'static',
    type: 'static',
    max: 2,
    weight: 3,
    name: 'Interference',
    text: 'A wall of static rolls over 69.80. The signal is drifting, and listeners are losing you.',
    success: { trust: 1, result: 'You ride the dial back onto the signal. Clear as a bell.' },
    fail: {
      trust: -4,
      result:
        'Two minutes of hiss. Somewhere, a listener twists the dial over to Radio Free Europe.',
    },
  },
  {
    id: 'flicker',
    type: 'flicker',
    max: 1,
    weight: 2,
    name: 'Power cut',
    variants: [
      {
        when: { heatMin: 60 },
        text: 'The desk lamp stutters and dies. For forty seconds the transmitter is silent. Then the hum comes back. Old wiring, maybe. Or somebody wanted you to know they can.',
      },
      {
        text: 'The desk lamp stutters and dies. For forty seconds the transmitter is silent. Then the hum comes back, and the red light with it.',
      },
    ],
    choices: [
      {
        label: '“Technical difficulties, dear listeners. Our apologies.”',
        trust: -1,
        heat: 0,
        result: 'The oldest sentence in broadcasting. It works, mostly.',
      },
      {
        label: '“Someone up there doesn’t like this programme.”',
        tags: ['onair'],
        trust: 4,
        heat: 5,
        result: 'Half of Prague laughs. The other half checks their own lights.',
      },
    ],
  },
  {
    id: 'silent',
    type: 'call',
    max: 2,
    weight: 2,
    name: 'Unknown caller',
    place: 'No name, no voice',
    sound: 'breath',
    variants: [
      {
        when: 'silentOnce',
        text: '…\n\nThe same silence again. The same clock ticking on their end. Whoever it is, they’re still there.',
      },
      { text: '…\n\nNothing. Breathing, maybe. Somewhere on their end, a clock is ticking.' },
    ],
    choices: [
      {
        label: '“Hello? Who is this?”',
        trust: 1,
        heat: 0,
        set: ['silentOnce'],
        result: 'Nothing. Then a soft click.',
      },
      {
        label: 'On air: “Whoever you are, we’re still here.”',
        tags: ['onair'],
        trust: 4,
        heat: 3,
        set: ['silentOnce', 'answeredSilence'],
        log: 'Told a silent caller, on air: “We’re still here.”',
        result:
          'A long breath out, like someone putting down something heavy. Then the line clears.',
      },
      {
        label: 'Hang up',
        trust: 0,
        heat: 0,
        set: ['silentOnce'],
        result: 'The line clears. The silence stays with you a while.',
      },
    ],
  },
];

// Endings. 'offAir' (Heat 100) and 'silence' (Trust 0) end the night early.
// Otherwise, at 06:00, the first ending whose `when` matches wins; the last
// one has no condition and catches everything else.
// Placeholders: {time} {trust} {heat} {songs}.
const ENDINGS = [
  {
    id: 'offAir',
    kind: 'bad',
    title: 'Off Air',
    text: 'At {time} the studio door opens without a knock. A man in a grey coat nods to the engineer, and the engineer pulls your fader down. The last thing Prague hears from you is the hum of the transmitter. Within a week the men who switched you off are gone themselves. Nobody gives you back the hours.',
  },
  {
    id: 'silence',
    kind: 'bad',
    title: 'Dead Air',
    text: 'By {time} the switchboard is dark. Across Prague, radios are tuned to Vienna, to Radio Free Europe, to anything but you. You keep talking for a while, to nobody, which is what the Office wanted all along: dead air with a voice in it.',
  },
  {
    id: 'crowd',
    title: 'The Crowd at the Door',
    // The crowd only comes if you told Prague you were in danger.
    when: { heatMin: 75, trustMin: 60, any: ['exposedThreat', 'readWarning'] },
    text: 'At six the pips sound and you take off your headphones. Two men in leather coats are waiting in the lobby. But you told Prague you were in danger, and Prague came: the street outside is full of students with candles, a baker with a tray of rolls, Věra with her mop. The men look at the crowd, then at each other, and decide to finish their cigarettes somewhere else.',
  },
  {
    id: 'coats',
    title: 'Two Coats in the Lobby',
    when: { heatMin: 75 },
    text: 'You make it to six, but you burned too bright, and nobody knew you were in danger. Two men in leather coats walk you to a black Tatra, politely. You spend the weekend answering the same questions in a room without a window. On Wednesday a lieutenant opens the door and says, embarrassed, that you may go. The world outside has changed its mind.',
  },
  {
    id: 'square',
    title: 'The Voice of the Square',
    when: {
      trustMin: 75,
      not: ['gaveName', 'readPropaganda', 'censorDeal'],
      any: [
        'lenkaRead',
        'announcedStrike',
        'promisedMonday',
        'readMemo',
        'exposedCensor',
        'mondaySignOff',
        'karvinaOnAir',
      ],
    },
    text: 'On Monday at noon the whole country stops for two hours. On Wenceslas Square, loudspeakers play a tape of your night: the calls, the voices, your voice. People who have never met you know how you sound when you are afraid and say it anyway. In December the station offers you the morning show. You turn it down. You like the night.',
  },
  {
    id: 'jukebox',
    title: 'The Jukebox',
    when: { songsMin: 6 },
    text: 'You played {songs} records and said almost nothing. It worked: nobody came for you, and nobody remembered you. Years later, at a flea market, a man sells you a box of the very records you played that night. “Good music, these,” he says. “Somebody played them all night in eighty-nine, the night before everything happened.”',
  },
  {
    id: 'lifeboat',
    title: 'The Lifeboat',
    when: 'censorDeal',
    text: 'At six the phone rings once more. “Only a simple pensioner,” says the voice. “Just checking that our arrangement stands.” In December the Office is dissolved and Mr Dvořáček becomes a consultant to the new broadcasting council. He remembers his friends. You will spend the nineties wondering what that makes you.',
  },
  {
    id: 'mouthpiece',
    title: 'The Mouthpiece',
    when: { anyOf: [{ flags: ['readPropaganda'] }, { trustMax: 34 }] },
    text: 'You survived the night by saying what they wanted said. On 29 November the Party’s “leading role” is struck from the constitution. In January a new director listens to the tape of your show, all eight hours of it, and moves you to the weather desk. Some nights you still dream of the switchboard, all dark.',
  },
  {
    id: 'watchman',
    title: 'The Night Watchman',
    text: 'You kept the lights on without burning the building down. You bent a few rules and kept a few promises. On Monday at noon you stand in the street with everyone else, jingling your keys, and nobody recognises your voice. That’s all right. Someone had to stay awake.',
  },
];

// What became of the people you met. For each entry, the first variant whose
// `when` matches is shown; if none match, the entry is left out.
const EPILOGUES = [
  {
    who: 'Lenka',
    variants: [
      {
        when: 'gaveName',
        text: 'Lenka was held for forty-eight hours. She never found out who told them which faculty. You know.',
      },
      {
        when: { min: { lenka: 3 } },
        text: 'Lenka finished her degree in 1993. She still has a cassette of your show, labelled in red: “The night it was said out loud.”',
      },
      {
        when: 'lenkaAbandoned',
        text: 'Lenka never called the show again. She works in radio now, as it happens. Mornings.',
      },
      { text: 'Lenka marched on Monday at noon. She didn’t mention you, which is fair.' },
    ],
  },
  {
    who: 'Marie and Jiří',
    variants: [
      {
        when: 'minersJoin',
        text: 'On Monday at noon Jiří’s brigade stood by their machines for two hours. Marie says it was the quietest the pit has ever been.',
      },
      {
        when: 'jiriSuspended',
        text: 'Jiří was suspended for “agitation” and reinstated in January with back pay. He framed the suspension letter.',
      },
      {
        when: 'minersStayed',
        text: 'Jiří’s brigade worked through the strike. Marie still keeps the radio on at night.',
      },
      { text: 'Marie and Jiří watched the strike on television. For once, they believed it.' },
    ],
  },
  {
    who: 'Mr Dvořáček',
    variants: [
      {
        when: 'censorConfessed',
        text: 'The “pensioner” said his real name on air at a quarter past three. In 1990 he testified before a parliamentary commission and asked to be introduced as “a former listener”.',
      },
      {
        when: 'censorDeal',
        text: 'Mr Dvořáček landed on his feet, as such men do. He sends you a card every Christmas. It is never signed.',
      },
      {
        when: 'exposedCensor',
        text: 'Mr Dvořáček stopped calling after you unmasked him. His file on you, found in 1991, ends mid-sentence.',
      },
      { text: 'Mr Dvořáček kept listening to the show for years. Old habits.' },
    ],
  },
  {
    who: 'The tape',
    variants: [
      {
        when: 'tapeCopied',
        text: 'Franta’s copy of the night survives in an archive, mislabelled “Weather, Nov. 89”.',
      },
      {
        when: 'tapeLost',
        text: 'The tape of your night was “chewed by the machine”. Only your listeners remember it.',
      },
      {
        when: 'tapeGiven',
        text: 'The Office got its tape. By the time it arrived, there was nobody left there to listen.',
      },
    ],
  },
  {
    who: 'The silent caller',
    variants: [
      {
        when: 'answeredSilence',
        text: 'In 1990 a letter arrives: “I called you that night and couldn’t speak. My son was in the cells. Thank you for saying you were still there.”',
      },
    ],
  },
  {
    who: 'The rumour',
    variants: [
      {
        when: 'ignoredCorrection',
        text: 'The “dead student” was alive and well, and the papers never let you forget that you said otherwise.',
      },
    ],
  },
  {
    who: 'Radek',
    variants: [
      {
        when: 'reportedSoldier',
        text: 'The conscript you reported spent the revolution in a military cell. He was released in December. He knows your voice.',
      },
    ],
  },
  {
    who: 'The typist',
    variants: [
      {
        when: 'reportedResignation',
        text: 'On Friday evening the entire Party leadership resigned, exactly as she said. You told Prague a day early.',
      },
      {
        when: 'knewResignation',
        text: 'On Friday evening the entire Party leadership resigned. You turned over the memo and read your own handwriting.',
      },
    ],
  },
];
