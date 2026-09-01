-- Phase 6, transient real-time state. Every column is nullable and is
-- cleared in the same transaction that ends the situation it describes:
-- reactionDeadline IS NOT NULL <=> pendingActionSkillCode IS NOT NULL, and
-- disconnectDeadline IS NOT NULL <=> disconnectedUserId IS NOT NULL. No
-- NOT NULL, no DEFAULT, no backfill, no index, no constraint: purely
-- additive, so rollback is four DROP COLUMNs and every existing row stays
-- valid throughout.

-- AlterTable
ALTER TABLE "Battle" ADD COLUMN "pendingActionSkillCode" TEXT;
ALTER TABLE "Battle" ADD COLUMN "reactionDeadline" TIMESTAMP(3);
ALTER TABLE "Battle" ADD COLUMN "disconnectedUserId" TEXT;
ALTER TABLE "Battle" ADD COLUMN "disconnectDeadline" TIMESTAMP(3);
