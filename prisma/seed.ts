import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import {
  Attribute,
  ConditionType,
  SkillType,
} from '../src/generated/prisma/enums';

type SkillSeed = {
  code: string;
  name: string;
  description: string;
  type: SkillType;
  cost: number;
  requiredAttribute: Attribute;
  requiredValue: number;
  damageDice: string | null;
  appliesCondition: ConditionType | null;
  conditionRounds: number | null;
};

const skills: SkillSeed[] = [
  {
    code: 'POWER_STRIKE',
    name: 'Power Strike',
    description: 'A heavy swing that trades finesse for raw damage.',
    type: SkillType.ACTION,
    cost: 4,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 12,
    damageDice: '1d8',
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'RECKLESS_BLOW',
    name: 'Reckless Blow',
    description: 'All the weight of the body behind a single opening.',
    type: SkillType.ACTION,
    cost: 5,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 14,
    damageDice: '1d10',
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'PRECISE_SHOT',
    name: 'Precise Shot',
    description: 'A measured strike aimed where the guard is thinnest.',
    type: SkillType.ACTION,
    cost: 5,
    requiredAttribute: Attribute.DEXTERITY,
    requiredValue: 13,
    damageDice: '1d10',
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'FIREBALL',
    name: 'Fireball',
    description: 'A burst of flame the target must brace against.',
    type: SkillType.ACTION,
    cost: 5,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 12,
    damageDice: '2d6',
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'VENOM_BOLT',
    name: 'Venom Bolt',
    description: 'Little damage on impact, and poison that lingers.',
    type: SkillType.ACTION,
    cost: 4,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 11,
    damageDice: '1d4',
    appliesCondition: ConditionType.POISONED,
    conditionRounds: 3,
  },
  {
    code: 'MIND_SPIKE',
    name: 'Mind Spike',
    description: 'Raw force against the mind, leaving the target reeling.',
    type: SkillType.ACTION,
    cost: 7,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 14,
    damageDice: '1d10',
    appliesCondition: ConditionType.STUNNED,
    conditionRounds: 1,
  },
  {
    code: 'BRACE',
    name: 'Brace',
    description: 'Absorb the hit with the body instead of avoiding it.',
    type: SkillType.REACTION,
    cost: 3,
    requiredAttribute: Attribute.CONSTITUTION,
    requiredValue: 12,
    damageDice: null,
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'PARRY',
    name: 'Parry',
    description: 'Meet the incoming blow and turn part of it aside.',
    type: SkillType.REACTION,
    cost: 4,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 12,
    damageDice: null,
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'DODGE',
    name: 'Dodge',
    description: 'Step out of the line of attack before it lands.',
    type: SkillType.REACTION,
    cost: 4,
    requiredAttribute: Attribute.DEXTERITY,
    requiredValue: 12,
    damageDice: null,
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'ARCANE_WARD',
    name: 'Arcane Ward',
    description: 'A thin barrier raised against magical damage.',
    type: SkillType.REACTION,
    cost: 5,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 12,
    damageDice: null,
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'COUNTER',
    name: 'Counter',
    description: 'Take the hit to answer it in the same motion.',
    type: SkillType.REACTION,
    cost: 6,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 14,
    damageDice: '1d6',
    appliesCondition: null,
    conditionRounds: null,
  },
  {
    code: 'RIPOSTE',
    name: 'Riposte',
    description: 'Slip the attack and answer at the exposed opening.',
    type: SkillType.REACTION,
    cost: 7,
    requiredAttribute: Attribute.DEXTERITY,
    requiredValue: 14,
    damageDice: '1d8',
    appliesCondition: ConditionType.WEAKENED,
    conditionRounds: 2,
  },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    for (const skill of skills) {
      await prisma.skill.upsert({
        where: { code: skill.code },
        create: skill,
        update: skill,
      });
    }

    const total = await prisma.skill.count();

    console.log(
      `Skill catalog seeded: ${skills.length} upserted, ${total} rows in the catalog`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
