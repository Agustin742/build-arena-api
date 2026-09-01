-- A challenge has to remember which build the challenger committed to when
-- they sent it, so that BOTH combatants can be frozen at the same instant:
-- the moment the challenge is accepted. Without this column the challenger's
-- side of the freeze would have nowhere to live while the battle is PENDING.

-- AlterTable
ALTER TABLE "Battle" ADD COLUMN "challengerBuildId" TEXT;

-- CreateIndex
CREATE INDEX "Battle_challengerBuildId_idx" ON "Battle"("challengerBuildId");

-- AddForeignKey
-- Nullable and SET NULL for the same reason as BattleCombatant.buildId: a
-- deleted build must not take a finished battle's history down with it. A
-- pending challenge whose build is gone can no longer be accepted, and the
-- service says so.
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_challengerBuildId_fkey" FOREIGN KEY ("challengerBuildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;
