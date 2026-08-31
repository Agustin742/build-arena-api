import type { ActionResolution, ReactionBehavior } from '../types';

/**
 * Reaction behavior lives here, in the engine, not in the schema (D5):
 * a new reaction shape needs new engine code no matter where it is
 * stored, so encoding it as a schema column would buy a migration
 * against an applied production database for zero flexibility. What
 * already has a `Skill` column — `damageDice`, `appliesCondition`,
 * `conditionRounds` — stays data, read from the declared `CombatSkill`
 * at resolution time; this table carries only what the schema has no
 * column for.
 *
 * Every `bonusFrom` and `from` reads the REACTOR's own attributes.
 */
export const REACTION_TABLE: Readonly<Record<string, ReactionBehavior>> = {
  BRACE: {
    answers: 'ANY',
    defense: null,
    mitigation: { kind: 'FLAT', from: 'CONSTITUTION', minimum: 1 },
    counter: null,
  },
  PARRY: {
    answers: 'PHYSICAL',
    defense: null,
    mitigation: { kind: 'HALVE' },
    counter: null,
  },
  DODGE: {
    answers: 'PHYSICAL',
    defense: { bonusFrom: 'DEXTERITY', target: 'ARMOR_CLASS' },
    mitigation: null,
    counter: null,
  },
  ARCANE_WARD: {
    answers: 'MAGIC',
    defense: { bonusFrom: 'MAGIC', target: 'SAVE_ROLL' },
    mitigation: null,
    counter: null,
  },
  COUNTER: {
    answers: 'ANY',
    defense: null,
    mitigation: null,
    counter: { on: 'HIT', bonusFrom: 'STRENGTH' },
  },
  RIPOSTE: {
    answers: 'PHYSICAL',
    defense: null,
    mitigation: null,
    counter: { on: 'MISS', bonusFrom: 'DEXTERITY' },
  },
};

/**
 * Restricts each reaction to the action types it can answer (R4): PARRY,
 * DODGE, and RIPOSTE answer only physical actions; ARCANE_WARD answers
 * only magic actions; BRACE and COUNTER answer either. A reaction
 * declared against an inapplicable action type must not be applied.
 */
export const isApplicable = (
  behavior: ReactionBehavior,
  resolution: ActionResolution,
): boolean => behavior.answers === 'ANY' || behavior.answers === resolution;
