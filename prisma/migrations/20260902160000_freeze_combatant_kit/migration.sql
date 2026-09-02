-- The kit a combatant fights with, frozen at the same instant as their stats.
-- Until now only the four attributes and the derived values were copied into
-- BattleCombatant; the skill list was read live from BuildSkill on every
-- message, so editing a build mid-battle changed the kit of a fight already
-- in progress.

-- CreateTable
CREATE TABLE "BattleCombatantSkill" (
    "combatantId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "BattleCombatantSkill_pkey" PRIMARY KEY ("combatantId","skillId")
);

-- AddForeignKey
ALTER TABLE "BattleCombatantSkill" ADD CONSTRAINT "BattleCombatantSkill_combatantId_fkey" FOREIGN KEY ("combatantId") REFERENCES "BattleCombatant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Straight to the catalog, never through BuildSkill. That is the whole point:
-- BattleCombatant.buildId is nullable and SET NULL, so a deleted build must
-- leave the frozen kit standing.
ALTER TABLE "BattleCombatantSkill" ADD CONSTRAINT "BattleCombatantSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill. Every combatant already on the table was frozen without a kit,
-- and the seven message validations refuse any skill that is not in the kit —
-- so leaving these rows empty would make every battle in flight unplayable.
-- The live build is the only record of what they were fighting with, so it is
-- what gets copied. A combatant whose build was already deleted has nothing
-- to copy and keeps the empty kit it effectively already had.
INSERT INTO "BattleCombatantSkill" ("combatantId", "skillId")
SELECT "BattleCombatant"."id", "BuildSkill"."skillId"
FROM "BattleCombatant"
JOIN "BuildSkill" ON "BuildSkill"."buildId" = "BattleCombatant"."buildId"
WHERE "BattleCombatant"."buildId" IS NOT NULL;
