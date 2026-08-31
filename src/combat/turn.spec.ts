import { resolveTurn } from './turn';
import { SequenceRandomSource } from './random-source';
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

describe('resolveTurn — step 9 emission, STUNNED skipping, and bias wiring', () => {
  it('step 9: exactly two turn results are always emitted, even with no reaction declared', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(5),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 12 });
    const defender = buildCombatant({ id: 'defender-1', armorClass: 10 });
    const input = buildInput({ actor, defender, reaction: null, random });

    const result = resolveTurn(input);

    expect(result.turns).toHaveLength(2);
    expect(result.turns[0].kind).toBe('ACTION');
    expect(result.turns[1].kind).toBe('REACTION');
    expect(result.turns[1].attackRoll).toBeNull();
    expect(result.turns[1].targetValue).toBeNull();
    expect(result.turns[1].hit).toBeNull();
    expect(result.turns[1].skillCode).toBeNull();
  });

  it("a stunned actor's action is recorded as skipped, not empty (R2, Decision B)", () => {
    const random: RandomSource = { rollD20: jest.fn(), rollDice: jest.fn() };
    const actor = buildCombatant({
      id: 'actor-1',
      conditions: [{ type: 'STUNNED', roundsRemaining: 1 }],
    });
    const defender = buildCombatant({ id: 'defender-1' });
    const input = buildInput({ actor, defender, reaction: null, random });

    const result = resolveTurn(input);

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toEqual({
      round: 1,
      sequence: 1,
      actorId: 'actor-1',
      kind: 'ACTION',
      skillCode: null,
      attackRoll: null,
      targetValue: null,
      hit: null,
      critical: false,
      damage: 0,
      skipped: true,
    });
    expect(result.events).toContainEqual({
      type: 'TURN_SKIPPED',
      combatantId: 'actor-1',
      reason: 'STUNNED',
    });
    expect(random.rollD20).not.toHaveBeenCalled();
    expect(random.rollDice).not.toHaveBeenCalled();
  });

  it('a stunned defender cannot use a reaction: PARRY is ignored and its mitigation does not apply', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(6), // rawDamage 6 + mod(0) = 6
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 10 });
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      currentHp: 30,
      conditions: [{ type: 'STUNNED', roundsRemaining: 1 }],
    });
    const parry: CombatSkill = {
      code: 'PARRY',
      type: 'REACTION',
      requiredAttribute: 'STRENGTH',
      damageDice: null,
      appliesCondition: null,
      conditionRounds: null,
    };
    const input = buildInput({
      actor,
      defender,
      reaction: { actorId: 'defender-1', skill: parry },
      random,
    });

    const result = resolveTurn(input);

    // PARRY would have halved 6 to 3; STUNNED suppresses it, so the full
    // 6 lands instead.
    expect(result.turns[0].damage).toBe(6);
    expect(result.defender.currentHp).toBe(24);
    expect(result.turns[1].skipped).toBe(true);
    expect(result.events).toContainEqual({
      type: 'REACTION_IGNORED',
      combatantId: 'defender-1',
      skillCode: 'PARRY',
      reason: 'STUNNED',
    });
  });

  it('disadvantage can suppress a critical: a discarded natural 20 never counts (bias + critical wiring)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValueOnce(20).mockReturnValueOnce(5),
      rollDice: jest.fn(),
    };
    const actor = buildCombatant({
      id: 'actor-1',
      strength: 10,
      conditions: [{ type: 'POISONED', roundsRemaining: 2 }], // disadvantage
    });
    const defender = buildCombatant({ id: 'defender-1', armorClass: 18 });
    const input = buildInput({ actor, defender, random });

    const result = resolveTurn(input);

    // DISADVANTAGE keeps the lower of the two rolls (5), so the drawn
    // natural 20 is discarded and never triggers a critical — bias can
    // only ever pull toward what it favors, never invent a result the
    // kept roll did not produce.
    expect(random.rollD20).toHaveBeenCalledTimes(2);
    expect(result.turns[0].attackRoll).toBe(5);
    expect(result.turns[0].critical).toBe(false);
    expect(result.turns[0].hit).toBe(false);
  });
});

describe('resolveTurn — step 8 is the pipeline’s terminal roll boundary', () => {
  const riposte: CombatSkill = {
    code: 'RIPOSTE',
    type: 'REACTION',
    requiredAttribute: 'DEXTERITY',
    damageDice: '1d8',
    appliesCondition: 'WEAKENED',
    conditionRounds: 2,
  };

  it(
    'PIN: nothing rolls after step 8 — a scripted source with exactly the ' +
      'pre-step-8 draws completes without exhausting, guarding R17 against a ' +
      'future phase silently inserting a post-condition roll',
    () => {
      // Exactly two draws: the actor's missed attack roll, then RIPOSTE's
      // 1d8 counter damage. If any code path rolled again after step 8
      // (e.g. re-rolling something once WEAKENED lands), this scripted
      // source would throw "exhausted" and this test would fail loudly —
      // which is precisely the point: today nothing does.
      const random = new SequenceRandomSource([3, 5]);
      const actor = buildCombatant({ id: 'actor-1', strength: 10 });
      const defender = buildCombatant({
        id: 'defender-1',
        armorClass: 18, // guarantees the natural 3 misses
        dexterity: 12, // mod +1
        currentHp: 30,
      });
      const input = buildInput({
        actor,
        defender,
        reaction: { actorId: 'defender-1', skill: riposte },
        random,
      });

      expect(() => resolveTurn(input)).not.toThrow();
    },
  );

  it("RIPOSTE's WEAKENED does not rewrite the missed action it answered (R10, R17, R11)", () => {
    const random = new SequenceRandomSource([3, 5]);
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

    // The action's own record stays a miss with 0 damage — applying
    // WEAKENED to the actor afterward (step 8) does not retroactively
    // touch the row step 2-5 already finalized (R17).
    expect(result.turns[0].hit).toBe(false);
    expect(result.turns[0].damage).toBe(0);
    expect(result.actor.conditions).toContainEqual({
      type: 'WEAKENED',
      roundsRemaining: 2,
    });
  });
});

describe('resolveTurn — determinism', () => {
  it('two SequenceRandomSource instances over the same script produce deep-equal results', () => {
    const actor = buildCombatant({ id: 'actor-1', strength: 14 }); // mod +2
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 12,
      currentHp: 30,
    });
    const script = [20, 6, 6]; // natural 20 -> critical, then 1d8 rolled twice
    const buildScriptedInput = (): TurnInput =>
      buildInput({
        actor,
        defender,
        reaction: null,
        random: new SequenceRandomSource(script),
      });

    const first = resolveTurn(buildScriptedInput());
    const second = resolveTurn(buildScriptedInput());

    expect(first).toEqual(second);
    expect(first.turns[0].critical).toBe(true);
  });

  it('resolveTurn does not mutate its input combatants or declarations', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(5),
    };
    const actor = buildCombatant({ id: 'actor-1', strength: 12 });
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      currentHp: 20,
    });
    const input = buildInput({ actor, defender, random });
    const snapshotActor = { ...actor };
    const snapshotDefender = { ...defender };

    resolveTurn(input);

    expect(actor).toEqual(snapshotActor);
    expect(defender).toEqual(snapshotDefender);
    expect(input.actor).toBe(actor);
    expect(input.defender).toBe(defender);
  });

  it('calling resolveTurn twice with independent scripted sources never shares state across calls', () => {
    const actor = buildCombatant({ id: 'actor-1', strength: 12 });
    const defender = buildCombatant({
      id: 'defender-1',
      armorClass: 10,
      currentHp: 30,
    });

    const firstResult = resolveTurn(
      buildInput({
        actor,
        defender,
        random: new SequenceRandomSource([15, 5]),
      }),
    );
    const secondResult = resolveTurn(
      buildInput({
        actor,
        defender,
        random: new SequenceRandomSource([15, 5]),
      }),
    );

    expect(firstResult).toEqual(secondResult);
    // The original combatants passed in are untouched between calls.
    expect(actor.currentHp).toBe(30);
    expect(defender.currentHp).toBe(30);
  });

  it("a condition applied this round never reaches the same round's reaction (R17)", () => {
    const rollD20 = jest.fn().mockReturnValue(5); // save 5 - 1 = 4, fails against 9
    const rollDice = jest
      .fn()
      .mockReturnValueOnce(8) // VENOM_BOLT 2d6
      .mockReturnValueOnce(4); // COUNTER 1d6
    const random: RandomSource = { rollD20, rollDice };
    const actor = buildCombatant({ id: 'actor-1', magic: 12 }); // mod +1, difficulty 9
    const defender = buildCombatant({
      id: 'defender-1',
      constitution: 8, // mod -1, so the save fails and POISONED lands
      strength: 14, // mod +2, feeds COUNTER
      currentHp: 30,
    });
    const input = buildInput({
      round: 3,
      actor,
      defender,
      action: { actorId: 'actor-1', skill: venomBolt },
      reaction: { actorId: 'defender-1', skill: counter },
      random,
    });

    const result = resolveTurn(input);

    // POISONED really landed on the defender during this very round.
    expect(result.defender.conditions).toContainEqual({
      type: 'POISONED',
      roundsRemaining: 3,
    });
    // Yet the defender's own reaction in round 3 was never biased by it: the
    // only d20 rolled all turn was the defender's saving throw, and COUNTER's
    // damage is the plain 1d6 plus mod(strength 14) = 6.
    expect(rollD20).toHaveBeenCalledTimes(1);
    expect(result.turns[1].damage).toBe(6);
    expect(result.actor.currentHp).toBe(24);
    expect(result.defender.currentHp).toBe(22);
  });
});
