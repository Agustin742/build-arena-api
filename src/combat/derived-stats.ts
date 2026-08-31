import { modifier } from './arithmetic';
import type { RandomSource } from './random-source';

/** `10 + mod(dexterity)` (overview.md §4.1). */
export const armorClass = (dexterity: number): number =>
  10 + modifier(dexterity);

/** `30 + mod(constitution) * 5` (overview.md §4.1). */
export const maxHp = (constitution: number): number =>
  30 + modifier(constitution) * 5;

/** `rollD20() + mod(dexterity)` (overview.md §4.1). */
export const initiative = (dexterity: number, random: RandomSource): number =>
  random.rollD20() + modifier(dexterity);
