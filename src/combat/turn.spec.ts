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

const counter: CombatSkill = {
  code: 'COUNTER',
  type: 'REACTION',
  requiredAttribute: 'STRENGTH',
  damageDice: '1d6',
  appliesCondition: null,
  conditionRounds: null,
};

const riposte: CombatSkill = {
  code: 'RIPOSTE',
  type: 'REACTION',
  requiredAttribute: 'DEXTERITY',
  damageDice: '1d8',
  appliesCondition: 'WEAKENED',
  conditionRounds: 2,
};

const venomBolt: CombatSkill = {
  code: 'VENOM_BOLT',
  type: 'ACTION',
  requiredAttribute: 'MAGIC',
  damageDice: '2d6',
  appliesCondition: 'POISONED',
  conditionRounds: 3,
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

describe('resolveTurn — steps 6 to 8', () => {
  it('step 6: death short-circuits before any counter-attack, even with COUNTER declared and a hit', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(5), // action rawDamage = 5 + 2 = 7
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 14 }); // mod +2
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      currentHp: 7, // exactly killed by the incoming 7 damage
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: counter },
      random,
    });

    const result = resolveTurn(input);

    expect(result.defeatedId).toBe('defender-1');
    expect(result.defender.currentHp).toBe(0);
    // COUNTER's own turn result records no roll and no damage.
    expect(result.turns[1].damage).toBe(0);
    expect(result.turns[1].attackRoll).toBeNull();
    expect(
      result.events.some((event) => event.type === 'COUNTER_ATTACKED'),
    ).toBe(false);
    expect(random.rollDice).toHaveBeenCalledTimes(1); // only the action's die
  });

  it('step 7: COUNTER resolves only after confirming survival, dealing full damage back (R9)', () => {
    const rollDice = jest
      .fn()
      .mockReturnValueOnce(5) // action damage die
      .mockReturnValueOnce(4); // COUNTER's 1d6
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice,
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 14 }); // mod +2
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      strength: 14, // mod +2, feeds COUNTER's bonus
      currentHp: 30,
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: counter },
      random,
    });

    const result = resolveTurn(input);

    // Defender took the full 7 incoming damage (COUNTER never mitigates).
    expect(result.defender.currentHp).toBe(23);
    expect(result.defeatedId).toBeNull();
    expect(rollDice).toHaveBeenNthCalledWith(2, '1d6');
    // Counter damage 4 + mod(strength 14 = +2) = 6, returned to the attacker.
    expect(result.actor.currentHp).toBe(24);
    expect(result.turns[1].damage).toBe(6);
  });

  it('POISONED does not alter a COUNTER counter-attack: no extra rollD20, damage unaffected (R1, R9)', () => {
    const rollDice = jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(4);
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice,
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 14 });
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      strength: 14,
      currentHp: 30,
      conditions: [{ type: 'POISONED', roundsRemaining: 2 }],
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: counter },
      random,
    });

    const result = resolveTurn(input);

    // Only one rollD20 call total — the actor's own attack roll. COUNTER
    // never rolls, so POISONED's disadvantage has nothing to bite on.
    expect(random.rollD20).toHaveBeenCalledTimes(1);
    expect(result.turns[1].damage).toBe(6);
  });

  it('RIPOSTE fires on a miss, returns damage, and step 8 applies WEAKENED only after that damage is finalized (R10, R11 step 8)', () => {
    const rollDice = jest.fn().mockReturnValueOnce(5); // RIPOSTE's 1d8
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(3), // misses a high armor class
      rollDice,
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 10 });
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 18,
      dexterity: 12, // mod +1
      currentHp: 30,
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: riposte },
      random,
    });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(false);
    // rollDice('1d8') returns 5, + mod(dexterity 12 = +1) = 6.
    expect(rollDice).toHaveBeenCalledWith('1d8');
    expect(result.turns[1].damage).toBe(6);
    expect(result.actor.currentHp).toBe(24);
    expect(result.actor.conditions).toContainEqual({
      type: 'WEAKENED',
      roundsRemaining: 2,
    });
    expect(result.events).toContainEqual({
      type: 'CONDITION_APPLIED',
      combatantId: 'actor-1',
      condition: 'WEAKENED',
      rounds: 2,
      refreshed: false,
    });
  });

  it('RIPOSTE does not trigger on a hit: no counter damage and no WEAKENED applied', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(5),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 12 }); // mod +1
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      currentHp: 30,
    });
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: riposte },
      random,
    });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(true);
    expect(result.turns[1].damage).toBe(0);
    expect(result.actor.conditions).toEqual([]);
    expect(
      result.events.some((event) => event.type === 'COUNTER_ATTACKED'),
    ).toBe(false);
  });

  it('failed save applies the condition to the defender (R13)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(5), // defender's save roll
      rollDice: jest.fn().mockReturnValue(8), // 2d6 damage
    };
    const actor = buildCombatant({ id: 'actor-1', magic: 12 }); // mod +1, difficulty 9
    const defender = buildCombatant({
      id: 'defender-1',
      constitution: 8, // mod -1 -> total 5 - 1 = 4, fails against 9
      currentHp: 30,
    });
    const input = buildInput({
      actor,
      defender,
      action: { actorId: 'actor-1', skill: venomBolt },
      random,
    });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(true);
    expect(result.defender.conditions).toContainEqual({
      type: 'POISONED',
      roundsRemaining: 3,
    });
  });

  it('a successful save does not apply the condition, even though half damage still lands (R13)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15), // defender's save roll
      rollDice: jest.fn().mockReturnValue(8), // 2d6 damage
    };
    const actor = buildCombatant({ id: 'actor-1', magic: 12 }); // mod +1, difficulty 9
    const defender = buildCombatant({
      id: 'defender-1',
      constitution: 14, // mod +2 -> total 15 + 2 = 17, passes against 9
      currentHp: 30,
    });
    const input = buildInput({
      actor,
      defender,
      action: { actorId: 'actor-1', skill: venomBolt },
      random,
    });

    const result = resolveTurn(input);

    expect(result.turns[0].hit).toBe(false);
    expect(result.turns[0].damage).toBe(4); // floor(8 / 2), still dealt
    expect(result.defender.conditions).toEqual([]);
  });
});
