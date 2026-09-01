import { SequenceRandomSource } from '../../combat';
import { freezeCombatant } from './combatant-freeze';

const build = {
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
};

describe('freezeCombatant', () => {
  it('copies the attributes instead of pointing at the build', () => {
    const frozen = freezeCombatant(build, new SequenceRandomSource([10]));

    expect(frozen).toMatchObject(build);
  });

  it('derives armour class, maximum hit points and initiative', () => {
    // mod(12) = 1, mod(10) = 0, and the d20 is scripted to 10.
    const frozen = freezeCombatant(build, new SequenceRandomSource([10]));

    expect(frozen.armorClass).toBe(11);
    expect(frozen.maxHp).toBe(30);
    expect(frozen.initiative).toBe(11);
  });

  it('starts the fight at full health', () => {
    const frozen = freezeCombatant(build, new SequenceRandomSource([10]));

    expect(frozen.currentHp).toBe(frozen.maxHp);
  });

  it('draws exactly one die, for initiative', () => {
    // Armour class and hit points are arithmetic, not rolls. If either one
    // ever starts rolling, this source runs dry and the test says so.
    const random = new SequenceRandomSource([7]);

    expect(() => freezeCombatant(build, random)).not.toThrow();
    expect(() => random.rollD20()).toThrow();
  });
});
