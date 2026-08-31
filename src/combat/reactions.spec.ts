import { isApplicable, REACTION_TABLE } from './reactions';

describe('isApplicable', () => {
  it('DODGE against a magic action does not apply (R4)', () => {
    expect(isApplicable(REACTION_TABLE.DODGE, 'MAGIC')).toBe(false);
  });

  it('DODGE applies to a physical action', () => {
    expect(isApplicable(REACTION_TABLE.DODGE, 'PHYSICAL')).toBe(true);
  });

  it('PARRY applies only to a physical action (R6)', () => {
    expect(isApplicable(REACTION_TABLE.PARRY, 'PHYSICAL')).toBe(true);
    expect(isApplicable(REACTION_TABLE.PARRY, 'MAGIC')).toBe(false);
  });

  it('RIPOSTE applies only to a physical action (R10)', () => {
    expect(isApplicable(REACTION_TABLE.RIPOSTE, 'PHYSICAL')).toBe(true);
    expect(isApplicable(REACTION_TABLE.RIPOSTE, 'MAGIC')).toBe(false);
  });

  it('ARCANE_WARD applies only to a magic action (R8)', () => {
    expect(isApplicable(REACTION_TABLE.ARCANE_WARD, 'MAGIC')).toBe(true);
    expect(isApplicable(REACTION_TABLE.ARCANE_WARD, 'PHYSICAL')).toBe(false);
  });

  it('BRACE applies to either action type (R5)', () => {
    expect(isApplicable(REACTION_TABLE.BRACE, 'PHYSICAL')).toBe(true);
    expect(isApplicable(REACTION_TABLE.BRACE, 'MAGIC')).toBe(true);
  });

  it('COUNTER applies to either action type (R9)', () => {
    expect(isApplicable(REACTION_TABLE.COUNTER, 'PHYSICAL')).toBe(true);
    expect(isApplicable(REACTION_TABLE.COUNTER, 'MAGIC')).toBe(true);
  });
});

describe('REACTION_TABLE shape', () => {
  it('BRACE reduces damage by the constitution modifier, floor 1, answers any action (R5)', () => {
    expect(REACTION_TABLE.BRACE).toEqual({
      answers: 'ANY',
      defense: null,
      mitigation: { kind: 'FLAT', from: 'CONSTITUTION', minimum: 1 },
      counter: null,
    });
  });

  it('PARRY halves physical damage with no defense or counter (R6)', () => {
    expect(REACTION_TABLE.PARRY).toEqual({
      answers: 'PHYSICAL',
      defense: null,
      mitigation: { kind: 'HALVE' },
      counter: null,
    });
  });

  it('DODGE adds dexterity to armor class with no mitigation or counter (R7)', () => {
    expect(REACTION_TABLE.DODGE).toEqual({
      answers: 'PHYSICAL',
      defense: { bonusFrom: 'DEXTERITY', target: 'ARMOR_CLASS' },
      mitigation: null,
      counter: null,
    });
  });

  it('ARCANE_WARD adds magic to the save roll with no mitigation or counter (R8)', () => {
    expect(REACTION_TABLE.ARCANE_WARD).toEqual({
      answers: 'MAGIC',
      defense: { bonusFrom: 'MAGIC', target: 'SAVE_ROLL' },
      mitigation: null,
      counter: null,
    });
  });

  it('COUNTER triggers on a hit with strength, no defense or mitigation (R9)', () => {
    expect(REACTION_TABLE.COUNTER).toEqual({
      answers: 'ANY',
      defense: null,
      mitigation: null,
      counter: { on: 'HIT', bonusFrom: 'STRENGTH' },
    });
  });

  it('RIPOSTE triggers on a miss with dexterity, no defense or mitigation (R10)', () => {
    expect(REACTION_TABLE.RIPOSTE).toEqual({
      answers: 'PHYSICAL',
      defense: null,
      mitigation: null,
      counter: { on: 'MISS', bonusFrom: 'DEXTERITY' },
    });
  });
});
