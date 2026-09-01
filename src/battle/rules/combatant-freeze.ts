import { armorClass, initiative, maxHp } from '../../combat';
import type { RandomSource } from '../../combat';

/** The four attributes a build spends its budget on. */
export type CombatantAttributes = {
  strength: number;
  magic: number;
  dexterity: number;
  constitution: number;
};

export type FrozenCombatant = CombatantAttributes & {
  armorClass: number;
  maxHp: number;
  currentHp: number;
  initiative: number;
};

/**
 * A copy of the build, not a reference to it. Once a battle is accepted the
 * fight cannot change rules halfway through, so editing or deleting the build
 * afterwards must not reach the combatant.
 *
 * Initiative is rolled here, which is why the die comes in as an argument:
 * the freeze stays a pure function of its inputs and a scripted source
 * replays it exactly.
 */
export function freezeCombatant(
  build: CombatantAttributes,
  random: RandomSource,
): FrozenCombatant {
  const hitPoints = maxHp(build.constitution);

  return {
    strength: build.strength,
    magic: build.magic,
    dexterity: build.dexterity,
    constitution: build.constitution,
    armorClass: armorClass(build.dexterity),
    maxHp: hitPoints,
    currentHp: hitPoints,
    initiative: initiative(build.dexterity, random),
  };
}
