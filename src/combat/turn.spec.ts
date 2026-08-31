import { resolveTurn } from './turn';
import type { RandomSource } from './random-source';
import type { Combatant, CombatSkill, TurnInput } from './types';

const buildCombatant = (overrides: Partial<Combatant> = {}): Combatant => ({
  id: 'combatant-1',
  userId: 'user-1',
  strength: 10,
  magic: 10,
  dexterity: 10,
  constitution: 10,
  armorClass: 10,
  maxHp: 30,
  currentHp: 30,
  initiative: 0,
  reactionAvailable: true,
  conditions: [],
  ...overrides,
});

const powerStrike: CombatSkill = {
  code: 'POWER_STRIKE',
  type: 'ACTION',
  requiredAttribute: 'STRENGTH',
  damageDice: '1d8',
  appliesCondition: null,
  conditionRounds: null,
};

const fireball: CombatSkill = {
  code: 'FIREBALL',
  type: 'ACTION',
  requiredAttribute: 'MAGIC',
  damageDice: '2d6',
  appliesCondition: null,
  conditionRounds: null,
};

const dodge: CombatSkill = {
  code: 'DODGE',
  type: 'REACTION',
  requiredAttribute: 'DEXTERITY',
  damageDice: null,
  appliesCondition: null,
  conditionRounds: null,
};

const arcaneWard: CombatSkill = {
  code: 'ARCANE_WARD',
  type: 'REACTION',
  requiredAttribute: 'MAGIC',
  damageDice: null,
  appliesCondition: null,
  conditionRounds: null,
};

const brace: CombatSkill = {
  code: 'BRACE',
  type: 'REACTION',
  requiredAttribute: 'CONSTITUTION',
  damageDice: null,
  appliesCondition: null,
  conditionRounds: null,
};

const buildInput = (overrides: Partial<TurnInput> = {}): TurnInput => ({
  round: 1,
  actor: buildCombatant({ id: 'actor-1' }),
  defender: buildCombatant({ id: 'defender-1' }),
  action: { actorId: 'actor-1', skill: powerStrike },
  reaction: null,
  random: { rollD20: jest.fn(), rollDice: jest.fn() },
  ...overrides,
});

describe('resolveTurn — steps 1 to 5', () => {
  it('step 1: DODGE raises the effective armor class before the roll is evaluated (R7)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(13),
      rollDice: jest.fn().mockReturnValue(5),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 12 }); // mod +1
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 12,
      dexterity: 14, // mod +2
    });
    const input = buildInput({
      actor,
      defender,
      action: { actorId: 'actor-1', skill: powerStrike },
      reaction: { actorId: 'defender-1', skill: dodge },
      random,
    });

    const result = resolveTurn(input);

    // Effective armor class is 14 (12 + 2), so a roll total of 14 (13 + 1)
    // meets it exactly.
    expect(result.turns[0].hit).toBe(true);
    expect(result.turns[0].attackRoll).toBe(13);
  });

  it('step 1: without DODGE the same total would have missed a higher armor class', () => {
    // Proves DODGE actually changes the comparison, not just a numeric
    // coincidence: base armor class 10, DODGE raises it to 12, and a total
    // of 11 hits the base but misses the boosted value.
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(11),
      rollDice: jest.fn(),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 10 }); // mod 0
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      dexterity: 14, // mod +2
    });
    const input = buildInput({
      actor,
      defender,
      action: { actorId: 'actor-1', skill: powerStrike },
      reaction: { actorId: 'defender-1', skill: dodge },
      random,
    });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(false);
  });

  it('step 2: the action roll uses the already-modified armor class and hits exactly', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(13),
      rollDice: jest.fn().mockReturnValue(4),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 12 }); // mod +1
    const defender = buildCombatant({ id: 'defender-1', armorClass: 14 });
    const input = buildInput({ actor, defender, random });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(true);
    expect(result.turns[0].targetValue).toBe(14);
  });

  it('step 3: damage is calculated only after a confirmed hit — a miss rolls no damage dice', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(5),
      rollDice: jest.fn(),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 10 });
    const defender = buildCombatant({ id: 'defender-1', armorClass: 18 });
    const input = buildInput({ actor, defender, random });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(false);
    expect(result.turns[0].damage).toBe(0);
    expect(random.rollDice).not.toHaveBeenCalled();
  });

  it('step 4: BRACE mitigates the calculated damage after the roll (R5)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(6), // raw damage 6 + mod(0) = wait, see below
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 10 }); // mod 0
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 12,
      constitution: 14, // mod +2
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: brace },
      random,
    });

    const result = resolveTurn(input);

    // rawDamage 6 -> BRACE reduces by mod(constitution)=2 -> 4.
    expect(result.turns[0].hit).toBe(true);
    expect(result.turns[0].damage).toBe(4);
  });

  it('step 5: HP is reduced by the mitigated value, not the raw value', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(8), // raw damage 8
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 10 });
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 12,
      constitution: 14, // mod +2
      currentHp: 10,
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: brace },
      random,
    });

    const result = resolveTurn(input);

    // rawDamage 8 -> BRACE reduces by 2 -> mitigated 6 -> currentHp 10-6=4.
    expect(result.turns[0].damage).toBe(6);
    expect(result.defender.currentHp).toBe(4);
  });

  it('ARCANE_WARD adds the magic modifier to the save total, not the difficulty (R8)', () => {
    // Attacker magic mod +2, unpoisoned -> saveDifficulty = 8 + 2 = 10.
    // Defender constitution mod +1, magic mod +2 (ward bonus). Roll 6 -> total
    // without ward is 7 (fails); with ward (+2) it becomes 9 (still fails).
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(6),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const actor = buildCombatant({ id: 'actor-1', magic: 14 }); // mod +2
    const defender = buildCombatant({
      id: 'defender-1',
      constitution: 12, // mod +1
      magic: 14, // mod +2, feeds ARCANE_WARD's bonus
    });
    const input = buildInput({
      actor,
      defender,
      action: { actorId: 'actor-1', skill: fireball },
      reaction: { actorId: 'defender-1', skill: arcaneWard },
      random,
    });

    const result = resolveTurn(input);

    expect(result.turns[0].targetValue).toBe(10);
    // A failed save still counts as the action having landed.
    expect(result.turns[0].hit).toBe(true);
  });
});
