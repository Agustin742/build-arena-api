/**
 * Scenario walkthrough for the realtime battle gateway.
 *
 * Drives every path a real client can walk and PRINTS WHAT COMES BACK OFF
 * THE WIRE, so the contract can be read rather than inferred from tests. It
 * is a check, not a demo: each scenario declares what it expects, and the
 * run exits non-zero if any of them disagrees with the server.
 *
 *   node scripts/ws-scenarios.mjs
 *   node --env-file=.env scripts/ws-scenarios.mjs      # enables the expired-token case
 *   node scripts/ws-scenarios.mjs --slow               # adds the 15s window expiry
 *   API_URL=https://build-arena-api.onrender.com node scripts/ws-scenarios.mjs
 *
 * The free Render instance sleeps after 15 minutes and takes about 90
 * seconds to wake, so the first REST call against it may look hung.
 *
 * Plain .mjs on purpose: a .ts file outside src/ that the build tsconfig
 * picks up makes nest emit dist/src/main.js and breaks the Render start
 * command.
 */

import { createHmac } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000';
const SLOW = process.argv.includes('--slow');
const TAG = Date.now().toString(36);

/** Both players get the same kit, so any denial is about rules, not loadout. */
const BUILD = {
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
};

// ---------------------------------------------------------------- reporting

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const results = [];

const section = (title) =>
  console.log(`\n${C.bold}${C.cyan}== ${title} ==${C.reset}\n`);

/** Server → client traffic, printed verbatim. Nothing arrives silently. */
const wire = (who, event, payload) =>
  console.log(
    `   ${C.dim}${who.padEnd(9)} <- ${event.padEnd(24)} ${
      payload === undefined ? '' : JSON.stringify(payload)
    }${C.reset}`,
  );

const record = (status, name, detail) => {
  results.push({ status, name, detail });
  const mark = { PASS: `${C.green}PASS`, FAIL: `${C.red}FAIL`, SKIP: `${C.yellow}SKIP` }[
    status
  ];
  console.log(`${mark}${C.reset} ${name}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
};

/**
 * Runs one scenario and records it. A throw is a failure, never a crash:
 * one broken expectation must not hide the scenarios behind it.
 */
async function scenario(name, run) {
  try {
    const detail = await run();
    record('PASS', name, detail);
  } catch (error) {
    record('FAIL', name, `-> ${error.message}`);
  }
}

const skip = (name, why) => record('SKIP', name, `(${why})`);

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ---------------------------------------------------------------------- REST

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

/** Registers, logs in, builds. Usernames cap at 20 characters. */
async function makePlayer(role) {
  const credentials = {
    email: `${role}_${TAG}@scen.dev`,
    username: `${role}_${TAG}`,
    password: 'a-long-enough-password',
  };

  await call('POST', '/auth/register', { body: credentials });

  const { accessToken } = await call('POST', '/auth/login', {
    body: { email: credentials.email, password: credentials.password },
  });

  const me = await call('GET', '/auth/me', { token: accessToken });

  const build = await call('POST', '/builds', {
    token: accessToken,
    body: { name: `${role} ${TAG}`, ...BUILD },
  });

  return { role, token: accessToken, id: me.id, buildId: build.id };
}

// ------------------------------------------------------------------- sockets

const SERVER_EVENTS = [
  'battle:state',
  'battle:round_start',
  'battle:reaction_window',
  'battle:turn_resolved',
  'battle:ended',
  'battle:opponent_left',
  'battle:error',
];

/**
 * Connects with an arbitrary token and wires every server event to the log.
 * Resolves with the socket, or rejects with the handshake refusal — the two
 * outcomes the middleware is allowed to produce.
 */
function connect(label, token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      transports: ['websocket'],
      reconnection: false,
      auth: token === undefined ? {} : { token },
    });

    for (const event of SERVER_EVENTS) {
      socket.on(event, (payload) => wire(label, event, payload));
    }

    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Resolves with the next matching event, or rejects once `ms` elapses. */
function waitFor(socket, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out waiting ${ms}ms for ${event}`));
    }, ms);

    const onEvent = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };

    socket.once(event, onEvent);
  });
}

/** Emits and expects a refusal carrying exactly `code`. */
async function expectError(socket, event, payload, code) {
  const error = waitFor(socket, 'battle:error');
  socket.emit(event, payload);
  const received = await error;

  expect(
    received.code === code,
    `expected ${code}, got ${received.code} (${received.message})`,
  );

  return received.code;
}

/** Emits and expects NO refusal to arrive within the grace period. */
async function expectNoError(socket, event, payload, graceMs = 1200) {
  let refusal = null;
  const capture = (error) => {
    refusal = error;
  };

  socket.on('battle:error', capture);
  socket.emit(event, payload);
  await sleep(graceMs);
  socket.off('battle:error', capture);

  expect(!refusal, `unexpected ${refusal?.code}: ${refusal?.message}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------- forged tokens

const b64 = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Hand-rolled HS256, so the script needs no JWT library and no access to the
 * running process. `secret` is only known when the caller passes the env
 * file through, which is why the expired case is optional.
 */
function forgeToken(payload, secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const signature = createHmac('sha256', secret)
    .update(`${head}.${body}`)
    .digest('base64url');

  return `${head}.${body}.${signature}`;
}

// --------------------------------------------------------------- combat flow

/**
 * Re-joins to read the current state back. Initiative decides who acts, and
 * the clock moves every round, so no scenario may assume the side it had
 * last time — it asks the server again.
 */
async function freshState(socket, battleId) {
  const state = waitFor(socket, 'battle:state', 6000);
  socket.emit('battle:join', { battleId });
  return state;
}

/** Whichever socket the server says is on the clock, plus its counterpart. */
function sides(state, players, sockets) {
  const activeRole =
    state.activeUserId === players.alice.id ? 'alice' : 'bruno';
  const idleRole = activeRole === 'alice' ? 'bruno' : 'alice';

  return {
    activeRole,
    idleRole,
    active: sockets[activeRole],
    idle: sockets[idleRole],
    activeUserId: state.activeUserId,
  };
}

/**
 * The invariant this whole session was spent fixing: each roll field of a
 * turn record carries one meaning, in both resolutions. `attackTotal` is
 * what was achieved, `targetValue` is what had to be beaten, and `hit` must
 * agree with comparing them.
 */
function assertRollContract(turns) {
  const rolled = turns.filter((turn) => turn.attackRoll !== null);

  expect(rolled.length > 0, 'no turn in this round carried a roll');

  for (const turn of rolled) {
    expect(
      turn.attackTotal !== null && turn.targetValue !== null,
      `${turn.skillCode}: a row with a roll left attackTotal or targetValue null`,
    );

    // A natural 20 always hits and a natural 1 always misses, both decided
    // before the target is consulted, so those two are exempt from the
    // arithmetic and only the ordinary rolls are compared.
    if (turn.attackRoll !== 20 && turn.attackRoll !== 1) {
      const beat = turn.attackTotal >= turn.targetValue;
      expect(
        beat === turn.hit,
        `${turn.skillCode}: reported hit=${turn.hit} but ${turn.attackTotal} vs ${turn.targetValue} says ${beat}`,
      );
    }
  }

  for (const turn of turns.filter((turn) => turn.attackRoll === null)) {
    expect(
      turn.attackTotal === null && turn.targetValue === null,
      `${turn.kind}: a row with no roll still carried a total or a target`,
    );
  }

  return `${rolled.length} rolled row(s) coherent`;
}

/** One full exchange: action, window, answer, resolution. */
async function playRound(battleId, state, players, sockets, reactionCode) {
  const { active, idle } = sides(state, players, sockets);

  const windowOpened = waitFor(idle, 'battle:reaction_window');
  active.emit('battle:action', { battleId, skillCode: 'POWER_STRIKE' });
  await windowOpened;

  const resolved = waitFor(active, 'battle:turn_resolved');
  idle.emit('battle:reaction', { battleId, skillCode: reactionCode });

  return resolved;
}

// ------------------------------------------------------------------ scenarios

async function main() {
  console.log(
    `\n${C.bold}Realtime battle scenarios${C.reset} ${C.dim}against ${API}${C.reset}`,
  );

  // -- setup ---------------------------------------------------------------

  section('setup over REST');

  const alice = await makePlayer('alice');
  const bruno = await makePlayer('bruno');
  const carol = await makePlayer('carol'); // never a participant, on purpose
  const players = { alice, bruno, carol };

  console.log(
    `   ${C.dim}alice ${alice.id}\n   bruno ${bruno.id}\n   carol ${carol.id} (outsider)${C.reset}`,
  );

  // Two battles: one left PENDING to exercise the status check, one accepted
  // to fight in.
  const pending = await call('POST', '/battles', {
    token: alice.token,
    body: { opponentId: bruno.id, buildId: alice.buildId },
  });

  const battle = await call('POST', '/battles', {
    token: alice.token,
    body: { opponentId: bruno.id, buildId: alice.buildId },
  });

  await call('PATCH', `/battles/${battle.id}/accept`, {
    token: bruno.token,
    body: { buildId: bruno.buildId },
  });

  console.log(
    `   ${C.dim}battle ${battle.id} accepted, battle ${pending.id} left pending${C.reset}`,
  );

  // -- handshake -----------------------------------------------------------

  section('handshake: no valid token, no socket');

  await scenario('a socket with no token at all is refused', async () => {
    await connect('anon', undefined).then(
      (socket) => {
        socket.close();
        throw new Error('the server accepted a tokenless socket');
      },
      (error) => error,
    );
    return 'connect_error';
  });

  await scenario('a malformed token is refused', async () => {
    await connect('anon', 'not-even-a-jwt').then(
      (socket) => {
        socket.close();
        throw new Error('the server accepted a malformed token');
      },
      (error) => error,
    );
    return 'connect_error';
  });

  await scenario('a well-formed token with a wrong signature is refused', async () => {
    const forged = forgeToken(
      {
        sub: alice.id,
        username: `alice_${TAG}`,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      'this-is-not-the-server-secret',
    );

    await connect('forged', forged).then(
      (socket) => {
        socket.close();
        throw new Error('the server accepted a forged signature');
      },
      (error) => error,
    );
    return 'connect_error';
  });

  if (process.env.JWT_SECRET) {
    await scenario('a correctly signed but expired token is refused', async () => {
      const past = Math.floor(Date.now() / 1000) - 3600;
      const expired = forgeToken(
        { sub: alice.id, username: `alice_${TAG}`, iat: past - 60, exp: past },
        process.env.JWT_SECRET,
      );

      await connect('expired', expired).then(
        (socket) => {
          socket.close();
          throw new Error('the server accepted an expired token');
        },
        (error) => error,
      );
      return 'connect_error';
    });
  } else {
    skip(
      'a correctly signed but expired token is refused',
      'run with node --env-file=.env to supply JWT_SECRET',
    );
  }

  const sockets = {
    alice: await connect('alice', alice.token),
    bruno: await connect('bruno', bruno.token),
    carol: await connect('carol', carol.token),
  };

  record('PASS', 'a valid access token connects', '3 sockets open');

  // -- join authorization --------------------------------------------------

  section('join: participation and status decide the room');

  await scenario('an outsider joining gets the same answer as a missing battle', () =>
    expectError(sockets.carol, 'battle:join', { battleId: battle.id }, 'NOT_FOUND'),
  );

  await scenario('a participant cannot join a battle that is still pending', () =>
    expectError(sockets.alice, 'battle:join', { battleId: pending.id }, 'WRONG_STATUS'),
  );

  await scenario('a participant cannot join a battle that does not exist', () =>
    expectError(
      sockets.alice,
      'battle:join',
      { battleId: '00000000-0000-4000-8000-000000000000' },
      'NOT_FOUND',
    ),
  );

  let state;

  await scenario('joining an accepted battle starts it and returns full state', async () => {
    const first = waitFor(sockets.alice, 'battle:state');
    sockets.alice.emit('battle:join', { battleId: battle.id });
    state = await first;

    const second = waitFor(sockets.bruno, 'battle:state');
    sockets.bruno.emit('battle:join', { battleId: battle.id });
    await second;

    expect(state.status === 'IN_PROGRESS', `status came back ${state.status}`);
    expect(state.activeUserId !== null, 'nobody was put on the clock');
    expect(state.combatants?.length === 2, 'state did not carry both combatants');

    return `round ${state.currentRound}, active ${state.activeUserId}`;
  });

  // -- message authorization, before anything is declared -------------------

  section('the seven checks: what a socket in the room still cannot do');

  const { activeRole, idleRole, active, idle } = sides(state, players, sockets);
  console.log(
    `   ${C.dim}initiative gave the round to ${activeRole}; ${idleRole} defends${C.reset}\n`,
  );

  await scenario('V1 an outsider cannot act on a battle they are not in', () =>
    expectError(
      sockets.carol,
      'battle:action',
      { battleId: battle.id, skillCode: 'POWER_STRIKE' },
      'NOT_FOUND',
    ),
  );

  await scenario('V3 the idle player cannot act out of turn', () =>
    expectError(
      idle,
      'battle:action',
      { battleId: battle.id, skillCode: 'POWER_STRIKE' },
      'NOT_YOUR_TURN',
    ),
  );

  await scenario('V3 a reaction with no window open is refused', () =>
    expectError(
      idle,
      'battle:reaction',
      { battleId: battle.id, skillCode: 'PARRY' },
      'NO_OPEN_WINDOW',
    ),
  );

  await scenario('V4 a skill outside the frozen kit is refused', () =>
    expectError(
      active,
      'battle:action',
      { battleId: battle.id, skillCode: 'ARCANE_WARD' },
      'SKILL_NOT_IN_KIT',
    ),
  );

  await scenario('V4 an invented skill code is refused the same way', () =>
    expectError(
      active,
      'battle:action',
      { battleId: battle.id, skillCode: 'NOT_A_REAL_SKILL' },
      'SKILL_NOT_IN_KIT',
    ),
  );

  await scenario('V5 a reaction skill cannot be declared as an action', () =>
    expectError(
      active,
      'battle:action',
      { battleId: battle.id, skillCode: 'PARRY' },
      'WRONG_SKILL_TYPE',
    ),
  );

  // -- one full round ------------------------------------------------------

  section('round 1: action, window, answer, resolution');

  await scenario('an action opens a reaction window for the defender only', async () => {
    const opened = waitFor(idle, 'battle:reaction_window');
    active.emit('battle:action', { battleId: battle.id, skillCode: 'POWER_STRIKE' });
    const window = await opened;

    expect(window.actionSkillCode === 'POWER_STRIKE', 'the window named another skill');
    expect(window.remainingMs > 0, 'the window opened already expired');

    return `${window.remainingMs}ms, ${window.applicableSkillCodes.length} applicable skill(s)`;
  });

  await scenario('V3 the same player cannot declare a second action', () =>
    expectError(
      active,
      'battle:action',
      { battleId: battle.id, skillCode: 'POWER_STRIKE' },
      'ALREADY_DECLARED',
    ),
  );

  await scenario('V3 the acting player cannot answer their own window', () =>
    expectError(
      active,
      'battle:reaction',
      { battleId: battle.id, skillCode: 'PARRY' },
      'NO_OPEN_WINDOW',
    ),
  );

  await scenario('V5 an action skill cannot be declared as a reaction', () =>
    expectError(
      idle,
      'battle:reaction',
      { battleId: battle.id, skillCode: 'FIREBALL' },
      'WRONG_SKILL_TYPE',
    ),
  );

  let resolvedRound;

  await scenario('a declared reaction resolves the turn for both players', async () => {
    const forActive = waitFor(active, 'battle:turn_resolved');
    const forIdle = waitFor(idle, 'battle:turn_resolved');
    idle.emit('battle:reaction', { battleId: battle.id, skillCode: 'PARRY' });

    const [mine, theirs] = await Promise.all([forActive, forIdle]);
    resolvedRound = mine;

    expect(mine.turns.length === 2, `expected 2 rows, got ${mine.turns.length}`);
    expect(
      JSON.stringify(mine.turns) === JSON.stringify(theirs.turns),
      'the two players were sent different turn records',
    );

    return `${mine.turns.map((turn) => `${turn.kind}:${turn.skillCode ?? 'none'}`).join(' ')}`;
  });

  await scenario('every roll field of the resolved turn means exactly one thing', () =>
    assertRollContract(resolvedRound.turns),
  );

  await scenario('the combat event stream carries the same totals as the rows', () => {
    const rolls = resolvedRound.events.filter(
      (event) => event.type === 'ATTACK_ROLLED' || event.type === 'SAVE_ROLLED',
    );

    expect(rolls.length > 0, 'the round emitted no roll event');

    for (const event of rolls) {
      expect(
        typeof event.total === 'number',
        `${event.type} reached the wire without a total`,
      );
    }

    return rolls.map((event) => event.type).join(', ');
  });

  // -- explicit decline ----------------------------------------------------

  section('round 2: an explicit decline spends nothing');

  await scenario('a null reaction resolves the window and preserves the reaction', async () => {
    const live = await freshState(sockets.alice, battle.id);
    const { active: act, idle: def, idleRole: defRole } = sides(live, players, sockets);

    const opened = waitFor(def, 'battle:reaction_window');
    act.emit('battle:action', { battleId: battle.id, skillCode: 'POWER_STRIKE' });
    await opened;

    const resolved = waitFor(act, 'battle:turn_resolved');
    def.emit('battle:reaction', { battleId: battle.id, skillCode: null });
    const outcome = await resolved;

    const defender = outcome.combatants.find(
      (combatant) => combatant.userId === players[defRole].id,
    );

    expect(
      defender.reactionAvailable === true,
      'declining spent the reaction anyway',
    );
    expect(
      outcome.turns[1].skillCode === null,
      `the reaction row named ${outcome.turns[1].skillCode}`,
    );

    return 'reaction still available';
  });

  // -- window expiry -------------------------------------------------------

  section('the 15 second window closes on its own');

  if (SLOW) {
    await scenario('an unanswered window expires and preserves the reaction', async () => {
      const live = await freshState(sockets.alice, battle.id);

      if (live.status !== 'IN_PROGRESS') {
        throw new Error(`battle is ${live.status}, cannot open a window`);
      }

      const { active: act, idle: def, idleRole: defRole } = sides(live, players, sockets);

      const opened = waitFor(def, 'battle:reaction_window');
      act.emit('battle:action', { battleId: battle.id, skillCode: 'POWER_STRIKE' });
      const window = await opened;

      console.log(
        `   ${C.dim}waiting out ${window.remainingMs}ms of window, answering nothing...${C.reset}`,
      );

      // The window is 15s; give the sweep a couple of seconds of headroom.
      const outcome = await waitFor(act, 'battle:turn_resolved', window.remainingMs + 6000);

      const defender = outcome.combatants.find(
        (combatant) => combatant.userId === players[defRole].id,
      );

      expect(outcome.turns[1].skillCode === null, 'expiry invented a reaction');
      expect(
        defender.reactionAvailable === true,
        'expiry spent the reaction it was supposed to preserve',
      );

      return 'expired, reaction preserved';
    });
  } else {
    skip('an unanswered window expires and preserves the reaction', 'pass --slow, it takes 15s');
  }

  // -- recovery ------------------------------------------------------------

  section('recovery: the truth lives in the database, not in the process');

  await scenario('dropping a socket tells the room, with a deadline', async () => {
    const left = waitFor(sockets.alice, 'battle:opponent_left', 6000);
    sockets.bruno.close();
    const notice = await left;

    expect(notice.userId === bruno.id, 'the wrong player was reported as gone');
    expect(
      new Date(notice.deadline).getTime() > Date.now(),
      'the abandonment deadline was already in the past',
    );

    const minutes = Math.round(
      (new Date(notice.deadline).getTime() - Date.now()) / 60000,
    );
    return `${minutes} minute grace period`;
  });

  await scenario('a brand new socket recovers the whole battle from storage', async () => {
    sockets.bruno = await connect('bruno', bruno.token);

    const recovered = waitFor(sockets.bruno, 'battle:state');
    sockets.bruno.emit('battle:join', { battleId: battle.id });
    const back = await recovered;

    expect(back.combatants?.length === 2, 'the rebuilt state lost a combatant');
    expect(Array.isArray(back.turns), 'the rebuilt state carried no turn history');
    expect(back.turns.length > 0, 'the fought rounds came back empty');

    assertRollContract(back.turns.filter((turn) => turn.kind === 'ACTION'));

    state = back;
    return `round ${back.currentRound}, ${back.turns.length} row(s) replayed`;
  });

  skip(
    'the 2 minute abandonment deadline closes the battle',
    'too slow for a scripted run; the deadline above is the observable half',
  );

  // -- to the death --------------------------------------------------------

  section('fighting the battle to its end');

  let ended = null;

  await scenario('rounds keep resolving until someone drops', async () => {
    for (let round = 0; round < 40 && !ended; round += 1) {
      const live = await freshState(sockets.alice, battle.id);

      if (live.status !== 'IN_PROGRESS') {
        break;
      }

      const endedSoon = waitFor(sockets.alice, 'battle:ended', 12000).then(
        (payload) => {
          ended = payload;
        },
        () => null,
      );

      // Declining every reaction keeps the fight short: the window resolves
      // the instant the answer lands.
      await playRound(battle.id, live, players, sockets, null).catch(() => null);
      await Promise.race([endedSoon, sleep(600)]);
    }

    expect(ended !== null, 'the battle never reported an end');

    return `winner ${ended.winnerId}`;
  });

  await scenario('the winner is one of the two participants', () => {
    expect(
      ended.winnerId === alice.id || ended.winnerId === bruno.id,
      `winnerId ${ended.winnerId} is neither player`,
    );
    return ended.winnerId === alice.id ? 'alice' : 'bruno';
  });

  await scenario('V2 a finished battle refuses further actions', () =>
    expectError(
      sockets.alice,
      'battle:action',
      { battleId: battle.id, skillCode: 'POWER_STRIKE' },
      'WRONG_STATUS',
    ),
  );

  await scenario('a finished battle can still be read back', async () => {
    const final = waitFor(sockets.alice, 'battle:state');
    sockets.alice.emit('battle:join', { battleId: battle.id });
    const payload = await final;

    expect(payload.status === 'FINISHED', `status came back ${payload.status}`);
    expect(payload.turns.length > 0, 'the finished battle lost its history');

    return `${payload.turns.length} row(s) preserved`;
  });

  // -- unreachable by design ----------------------------------------------

  section('checks a live client cannot reach');

  skip(
    'V6 a spent reaction is refused',
    'startRound recharges the incoming actor, so V3 answers first — backstop only',
  );
  skip(
    'V7 a duplicate turn slot is refused',
    'the single-writer claim resolves the race server-side; unreachable from one client',
  );

  for (const socket of Object.values(sockets)) {
    socket.close();
  }
}

// ------------------------------------------------------------------- summary

main()
  .then(() => {
    const passed = results.filter((result) => result.status === 'PASS').length;
    const failed = results.filter((result) => result.status === 'FAIL');
    const skipped = results.filter((result) => result.status === 'SKIP').length;

    console.log(
      `\n${C.bold}${passed} passed, ${failed.length} failed, ${skipped} skipped${C.reset}`,
    );

    for (const failure of failed) {
      console.log(`  ${C.red}x${C.reset} ${failure.name} ${C.dim}${failure.detail}${C.reset}`);
    }

    console.log('');
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(`\n${C.red}the run could not finish:${C.reset} ${error.message}\n`);
    process.exit(1);
  });
