/**
 * Balance evidence for the combat engine.
 *
 * `overview.md` §4.1 calls the derived stats "valores iniciales, sujetos a
 * balanceo" and never says what balanced would look like. §2.3 and §4.7 do:
 * no archetype may dominate, and the d20 must keep mattering. Those are
 * measurable, so this measures them instead of arguing about them.
 *
 * It drives the REAL engine out of dist/, so what it reports is what players
 * would get. Nothing here re-implements a rule.
 *
 *   pnpm build && node scripts/balance-sim.mjs
 *   node scripts/balance-sim.mjs --duels 20000 --seed 7
 *
 * Plain .mjs on purpose: a .ts file outside src/ that the build tsconfig
 * picks up makes nest emit dist/src/main.js and breaks the Render start.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let engine;
try {
  engine = require('../dist/combat/index.js');
} catch {
  console.error(
    '\nNo dist/ to read. Run `pnpm build` first — this drives the compiled engine on purpose.\n',
  );
  process.exit(1);
}

const { resolveTurn, startRound, armorClass, maxHp, actionResolutionOf } =
  engine;

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};

const DUELS = arg('duels', 20000);
const SEED = arg('seed', 1);
/** A duel this long is a stalemate, and a stalemate is itself a finding. */
const ROUND_CAP = 60;

// ------------------------------------------------------------------ the dice

/**
 * xorshift32: seeded, so a run is reproducible and two candidate number sets
 * can be compared over the exact same stream of luck rather than over two
 * different ones.
 */
function makeRandom(seed) {
  let state = seed >>> 0 || 1;

  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  return {
    rollD20: () => 1 + Math.floor(next() * 20),
    rollDice: (notation) => {
      const [count, faces] = notation.split('d').map(Number);
      let total = 0;
      for (let die = 0; die < count; die += 1) {
        total += 1 + Math.floor(next() * faces);
      }
      return total;
    },
  };
}

// ------------------------------------------------------------- the catalogue

/** The seeded catalog, copied by value: prisma/seed.ts is the source. */
const SKILLS = {
  POWER_STRIKE: { code: 'POWER_STRIKE', type: 'ACTION', requiredAttribute: 'STRENGTH', damageDice: '1d8', appliesCondition: null, conditionRounds: null, cost: 4 },
  RECKLESS_BLOW: { code: 'RECKLESS_BLOW', type: 'ACTION', requiredAttribute: 'STRENGTH', damageDice: '1d10', appliesCondition: null, conditionRounds: null, cost: 5 },
  PRECISE_SHOT: { code: 'PRECISE_SHOT', type: 'ACTION', requiredAttribute: 'DEXTERITY', damageDice: '1d10', appliesCondition: null, conditionRounds: null, cost: 5 },
  FIREBALL: { code: 'FIREBALL', type: 'ACTION', requiredAttribute: 'MAGIC', damageDice: '2d6', appliesCondition: null, conditionRounds: null, cost: 5 },
  VENOM_BOLT: { code: 'VENOM_BOLT', type: 'ACTION', requiredAttribute: 'MAGIC', damageDice: '1d4', appliesCondition: 'POISONED', conditionRounds: 3, cost: 4 },
  MIND_SPIKE: { code: 'MIND_SPIKE', type: 'ACTION', requiredAttribute: 'MAGIC', damageDice: '1d10', appliesCondition: 'STUNNED', conditionRounds: 1, cost: 7 },
  BRACE: { code: 'BRACE', type: 'REACTION', requiredAttribute: 'CONSTITUTION', damageDice: null, appliesCondition: null, conditionRounds: null, cost: 3 },
  PARRY: { code: 'PARRY', type: 'REACTION', requiredAttribute: 'STRENGTH', damageDice: null, appliesCondition: null, conditionRounds: null, cost: 4 },
  DODGE: { code: 'DODGE', type: 'REACTION', requiredAttribute: 'DEXTERITY', damageDice: null, appliesCondition: null, conditionRounds: null, cost: 4 },
  ARCANE_WARD: { code: 'ARCANE_WARD', type: 'REACTION', requiredAttribute: 'MAGIC', damageDice: null, appliesCondition: null, conditionRounds: null, cost: 5 },
  COUNTER: { code: 'COUNTER', type: 'REACTION', requiredAttribute: 'STRENGTH', damageDice: '1d6', appliesCondition: null, conditionRounds: null, cost: 6 },
  RIPOSTE: { code: 'RIPOSTE', type: 'REACTION', requiredAttribute: 'DEXTERITY', damageDice: '1d8', appliesCondition: 'WEAKENED', conditionRounds: 2, cost: 7 },
};

/**
 * A candidate catalog, applied over the seeded one so two number sets can be
 * compared over the identical stream of luck:
 *
 *   node scripts/balance-sim.mjs --patch '{"PRECISE_SHOT":{"damageDice":"1d8"}}'
 *
 * Only fields that exist on a seeded skill may be patched — a typo silently
 * creating a new field would show up as "the numbers did not move" rather
 * than as an error.
 */
function applyPatch() {
  const index = process.argv.indexOf('--patch');
  if (index === -1) {
    return null;
  }

  const patch = JSON.parse(process.argv[index + 1]);

  for (const [code, fields] of Object.entries(patch)) {
    if (!SKILLS[code]) {
      throw new Error(`--patch names a skill that is not in the catalog: ${code}`);
    }
    for (const [field, value] of Object.entries(fields)) {
      if (!(field in SKILLS[code])) {
        throw new Error(`--patch names a field ${code} does not have: ${field}`);
      }
      SKILLS[code][field] = value;
    }
  }

  return patch;
}

const PATCH = applyPatch();

/** src/build/rules/attribute-cost.ts, indexed from the base value of 8. */
const CUMULATIVE_COST = [0, 1, 2, 3, 4, 5, 7, 9];
const ATTRIBUTE_BUDGET = 20;
const KIT_BUDGET = 18;

const spreadCost = (spread) =>
  ['strength', 'magic', 'dexterity', 'constitution'].reduce(
    (total, key) => total + CUMULATIVE_COST[spread[key] - 8],
    0,
  );

const kitCost = (codes) =>
  codes.reduce((total, code) => total + SKILLS[code].cost, 0);

// ------------------------------------------------------------- the archetypes

/**
 * Five legal builds, each spending the budget a different way. They are the
 * shapes §2.3's rock-paper-scissors is supposed to hold between, so if one
 * of them dominates the ranking has a favourite before anyone plays.
 */
const ARCHETYPES = [
  {
    name: 'brute',
    spread: { strength: 15, magic: 8, dexterity: 12, constitution: 14 },
    kit: ['POWER_STRIKE', 'RECKLESS_BLOW', 'PARRY', 'BRACE'],
  },
  {
    name: 'mage',
    spread: { strength: 8, magic: 15, dexterity: 12, constitution: 14 },
    kit: ['FIREBALL', 'VENOM_BOLT', 'ARCANE_WARD', 'BRACE'],
  },
  {
    name: 'duelist',
    spread: { strength: 12, magic: 8, dexterity: 15, constitution: 14 },
    kit: ['PRECISE_SHOT', 'POWER_STRIKE', 'DODGE', 'PARRY'],
  },
  {
    name: 'tank',
    spread: { strength: 12, magic: 8, dexterity: 14, constitution: 15 },
    kit: ['POWER_STRIKE', 'PRECISE_SHOT', 'BRACE', 'DODGE'],
  },
  {
    name: 'hybrid',
    spread: { strength: 13, magic: 13, dexterity: 13, constitution: 12 },
    kit: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
  },
  // The same duelist, having learned the hard way to carry BRACE — the only
  // reaction under 5 points that answers a spell. It is here to separate a
  // bad build from a bad rule: if this one is fine, the duelist above was
  // just misplayed; if it still loses, the numbers are the problem.
  {
    name: 'duelistB',
    spread: { strength: 12, magic: 8, dexterity: 15, constitution: 14 },
    kit: ['PRECISE_SHOT', 'POWER_STRIKE', 'DODGE', 'BRACE'],
  },
  // A brute that spends nothing on constitution, to price what RECKLESS_BLOW
  // is worth on its own.
  {
    name: 'gambler',
    spread: { strength: 15, magic: 8, dexterity: 14, constitution: 10 },
    kit: ['POWER_STRIKE', 'RECKLESS_BLOW', 'PARRY', 'BRACE'],
  },
];

/** A build the rules would refuse makes every number below meaningless. */
function assertLegal(archetype) {
  const spent = spreadCost(archetype.spread);
  const kit = kitCost(archetype.kit);
  const actions = archetype.kit.filter((c) => SKILLS[c].type === 'ACTION');
  const reactions = archetype.kit.filter((c) => SKILLS[c].type === 'REACTION');

  const problems = [];
  if (spent > ATTRIBUTE_BUDGET) problems.push(`spread costs ${spent}/${ATTRIBUTE_BUDGET}`);
  if (kit > KIT_BUDGET) problems.push(`kit costs ${kit}/${KIT_BUDGET}`);
  if (actions.length !== 2) problems.push(`${actions.length} actions`);
  if (reactions.length !== 2) problems.push(`${reactions.length} reactions`);

  return { spent, kit, problems };
}

/**
 * A candidate that raises a cost can push a build past the kit budget. That
 * is a real consequence and must be reported as one — but note what it does
 * NOT do: cost never enters a duel, only legality. Repricing a skill cannot
 * close a mechanical gap between two reactions, it can only stop a build
 * from carrying both.
 */
function reportLegality() {
  const illegal = ARCHETYPES.map((archetype) => ({
    archetype,
    ...assertLegal(archetype),
  })).filter((entry) => entry.problems.length > 0);

  if (illegal.length === 0) {
    return;
  }

  console.log('\nThis catalog makes some of these builds illegal:\n');
  for (const entry of illegal) {
    console.log(
      `  ${entry.archetype.name.padEnd(8)} ${entry.problems.join(', ')}`,
    );
  }
  console.log(
    '\nThey are simulated anyway, so the combat numbers stay comparable.',
  );
  console.log(
    'A player could not field them as they stand — that is the finding.\n',
  );
}

// ------------------------------------------------------------------ the duel

const combatantFrom = (archetype, id) => ({
  id,
  userId: `user-${id}`,
  ...archetype.spread,
  armorClass: armorClass(archetype.spread.dexterity),
  maxHp: maxHp(archetype.spread.constitution),
  currentHp: maxHp(archetype.spread.constitution),
  initiative: 0,
  reactionAvailable: true,
  conditions: [],
});

const averageOf = (notation) => {
  const [count, faces] = notation.split('d').map(Number);
  return (count * (faces + 1)) / 2;
};

const modifier = (value) => Math.floor((value - 10) / 2);

/** Chance a d20 lands at or above `target`, with 20 always in and 1 always out. */
const atLeast = (target) => Math.min(19, Math.max(1, 21 - target)) / 20;

/**
 * What a skill is worth against THIS defender, per declaration. A physical
 * skill can miss outright; a magic one never does, it is only halved by a
 * successful save. Ranking by the damage die alone would have both sides
 * play badly — and a simulation of bad play is evidence about the policy,
 * not about the numbers.
 */
function expectedDamage(skill, self, defender) {
  const dice = averageOf(skill.damageDice ?? '0d0');

  if (actionResolutionOf(skill) === 'PHYSICAL') {
    const attack = modifier(self[skill.requiredAttribute.toLowerCase()]);
    return atLeast(defender.armorClass - attack) * (dice + attack);
  }

  const difficulty = 8 + modifier(self.magic);
  const saves = atLeast(difficulty - modifier(defender.constitution));

  // Magic carries no attribute bonus on its dice, and a save halves rather
  // than negates: the floor is never zero.
  return dice * (saves * 0.5 + (1 - saves));
}

/**
 * The policy both sides play, stated out loud: the action with the highest
 * expected damage against the combatant actually in front of them, and the
 * first applicable reaction in kit order. A different policy would move
 * these numbers, so they describe the design under THIS policy, not the
 * ceiling a clever player could reach.
 */
const chooseAction = (archetype, self, defender) =>
  archetype.kit
    .map((code) => SKILLS[code])
    .filter((skill) => skill.type === 'ACTION')
    .sort(
      (a, b) =>
        expectedDamage(b, self, defender) - expectedDamage(a, self, defender),
    )[0];

const chooseReaction = (archetype, actionSkill, combatant) => {
  if (!combatant.reactionAvailable) {
    return null;
  }

  const resolution = actionResolutionOf(actionSkill);

  return (
    archetype.kit
      .map((code) => SKILLS[code])
      .filter((skill) => skill.type === 'REACTION')
      .find((skill) => {
        const behavior = engine.REACTION_TABLE[skill.code];
        return behavior && engine.isApplicable(behavior, resolution);
      }) ?? null
  );
};

/** One duel. Returns the winner's name, or null on a stalemate. */
function duel(archetypeA, archetypeB, random) {
  let a = combatantFrom(archetypeA, 'a');
  let b = combatantFrom(archetypeB, 'b');

  const rollInitiative = (combatant) =>
    random.rollD20() + Math.floor((combatant.dexterity - 10) / 2);

  // Higher initiative acts first; a tie goes to A, deterministically, the
  // same way the gateway breaks it in favour of the challenger.
  let actorIsA = rollInitiative(a) >= rollInitiative(b);

  for (let round = 1; round <= ROUND_CAP; round += 1) {
    const actorArch = actorIsA ? archetypeA : archetypeB;
    const defenderArch = actorIsA ? archetypeB : archetypeA;

    const started = startRound({ round, actor: actorIsA ? a : b });
    if (actorIsA) a = started.actor;
    else b = started.actor;

    const actionSkill = chooseAction(
      actorArch,
      actorIsA ? a : b,
      actorIsA ? b : a,
    );
    const reactionSkill = chooseReaction(
      defenderArch,
      actionSkill,
      actorIsA ? b : a,
    );

    const result = resolveTurn({
      round,
      actor: actorIsA ? a : b,
      defender: actorIsA ? b : a,
      action: { actorId: actorIsA ? a.id : b.id, skill: actionSkill },
      reaction: reactionSkill
        ? { actorId: actorIsA ? b.id : a.id, skill: reactionSkill }
        : null,
      random,
    });

    if (actorIsA) {
      a = result.actor;
      b = result.defender;
    } else {
      b = result.actor;
      a = result.defender;
    }

    if (result.defeatedId) {
      return result.defeatedId === 'a' ? archetypeB.name : archetypeA.name;
    }

    actorIsA = !actorIsA;
  }

  return null;
}

// ---------------------------------------------------------------- the report

const pct = (value, total) => ((value / total) * 100).toFixed(1).padStart(5);

function main() {
  console.log(
    `\nBalance simulation — ${DUELS} duels per pairing, seed ${SEED}`,
  );
  console.log(
    PATCH
      ? `Candidate catalog: ${JSON.stringify(PATCH)}\n`
      : 'Seeded catalog, unmodified\n',
  );

  console.log('Builds, all legal under the same budgets:\n');
  for (const archetype of ARCHETYPES) {
    const { spent, kit } = assertLegal(archetype);
    const combatant = combatantFrom(archetype, 'x');
    console.log(
      `  ${archetype.name.padEnd(8)} spread ${String(spent).padStart(2)}/20  kit ${String(kit).padStart(2)}/18  ` +
        `AC ${combatant.armorClass}  HP ${combatant.maxHp}  [${archetype.kit.join(' ')}]`,
    );
  }

  reportLegality();

  const wins = new Map();
  const stalemates = new Map();
  const totals = new Map();
  for (const archetype of ARCHETYPES) {
    wins.set(archetype.name, 0);
    totals.set(archetype.name, 0);
  }

  const cells = new Map();

  for (let i = 0; i < ARCHETYPES.length; i += 1) {
    for (let j = i + 1; j < ARCHETYPES.length; j += 1) {
      const left = ARCHETYPES[i];
      const right = ARCHETYPES[j];
      // Each pairing gets its own stream, so adding an archetype cannot
      // silently shift every other pairing's luck.
      const random = makeRandom(SEED * 7919 + i * 131 + j);

      let leftWins = 0;
      let drawn = 0;

      for (let duelIndex = 0; duelIndex < DUELS; duelIndex += 1) {
        const winner = duel(left, right, random);
        if (winner === null) drawn += 1;
        else if (winner === left.name) leftWins += 1;
      }

      const decided = DUELS - drawn;
      cells.set(`${left.name}|${right.name}`, { leftWins, decided, drawn });

      wins.set(left.name, wins.get(left.name) + leftWins);
      wins.set(right.name, wins.get(right.name) + (decided - leftWins));
      totals.set(left.name, totals.get(left.name) + decided);
      totals.set(right.name, totals.get(right.name) + decided);
      stalemates.set(`${left.name}|${right.name}`, drawn);
    }
  }

  console.log('\nHead to head — the row build’s win rate against the column build:\n');
  const header = ARCHETYPES.map((a) => a.name.padStart(7)).join(' ');
  console.log(`         ${header}`);

  for (const row of ARCHETYPES) {
    const cellsForRow = ARCHETYPES.map((column) => {
      if (row.name === column.name) return '      -';
      const forward = cells.get(`${row.name}|${column.name}`);
      if (forward) {
        return pct(forward.leftWins, forward.decided).padStart(7);
      }
      const reverse = cells.get(`${column.name}|${row.name}`);
      return pct(reverse.decided - reverse.leftWins, reverse.decided).padStart(7);
    }).join(' ');
    console.log(`${row.name.padEnd(8)} ${cellsForRow}`);
  }

  console.log('\nOverall:\n');
  const overall = ARCHETYPES.map((archetype) => ({
    name: archetype.name,
    rate: (wins.get(archetype.name) / totals.get(archetype.name)) * 100,
  })).sort((a, b) => b.rate - a.rate);

  for (const entry of overall) {
    console.log(`  ${entry.name.padEnd(8)} ${entry.rate.toFixed(1).padStart(5)}%`);
  }

  const totalStalemates = [...stalemates.values()].reduce((a, b) => a + b, 0);
  const pairings = stalemates.size;
  console.log(
    `\n  stalemates (over ${ROUND_CAP} rounds): ${totalStalemates} of ${
      pairings * DUELS
    }`,
  );

  const spread = overall[0].rate - overall[overall.length - 1].rate;
  console.log(
    `  spread between best and worst archetype: ${spread.toFixed(1)} points\n`,
  );

  // The extremes are what §2.3 and §4.7 are actually about: a matchup nobody
  // can lose freezes the ranking regardless of how even the averages look.
  const worst = [...cells.entries()]
    .map(([key, cell]) => {
      const [left, right] = key.split('|');
      const rate = (cell.leftWins / cell.decided) * 100;
      return { left, right, rate };
    })
    .sort((a, b) => Math.abs(b.rate - 50) - Math.abs(a.rate - 50))[0];

  console.log(
    `  most lopsided matchup: ${worst.left} vs ${worst.right} at ${worst.rate.toFixed(1)}%\n`,
  );
}

main();
