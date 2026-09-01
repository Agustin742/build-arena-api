import type { Build, BuildSkill, Skill } from '../generated/prisma/client';
import { toPublicSkill } from '../skill/skill.mapper';
import type { PublicSkill } from '../skill/skill.mapper';

/** A build row with its kit resolved into full catalog entries. */
export type BuildWithSkills = Build & {
  skills: (BuildSkill & { skill: Skill })[];
};

export type PublicBuild = {
  id: string;
  name: string;
  strength: number;
  magic: number;
  dexterity: number;
  constitution: number;
  skills: PublicSkill[];
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicBuild(build: BuildWithSkills): PublicBuild {
  return {
    id: build.id,
    name: build.name,
    strength: build.strength,
    magic: build.magic,
    dexterity: build.dexterity,
    constitution: build.constitution,
    skills: build.skills.map((entry) => toPublicSkill(entry.skill)),
    createdAt: build.createdAt,
    updatedAt: build.updatedAt,
  };
}
