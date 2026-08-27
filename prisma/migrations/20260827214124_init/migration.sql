-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('ACTION', 'REACTION');

-- CreateEnum
CREATE TYPE "Attribute" AS ENUM ('STRENGTH', 'MAGIC', 'DEXTERITY', 'CONSTITUTION');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "BattleStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'FINISHED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('POISONED', 'STUNNED', 'WEAKENED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "magic" INTEGER NOT NULL,
    "dexterity" INTEGER NOT NULL,
    "constitution" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "SkillType" NOT NULL,
    "cost" INTEGER NOT NULL,
    "requiredAttribute" "Attribute" NOT NULL,
    "requiredValue" INTEGER NOT NULL,
    "damageDice" TEXT,
    "appliesCondition" "ConditionType",
    "conditionRounds" INTEGER,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildSkill" (
    "buildId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "BuildSkill_pkey" PRIMARY KEY ("buildId","skillId")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "status" "BattleStatus" NOT NULL DEFAULT 'PENDING',
    "ranked" BOOLEAN NOT NULL DEFAULT true,
    "winnerId" TEXT,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "activeUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleCombatant" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT,
    "strength" INTEGER NOT NULL,
    "magic" INTEGER NOT NULL,
    "dexterity" INTEGER NOT NULL,
    "constitution" INTEGER NOT NULL,
    "armorClass" INTEGER NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "currentHp" INTEGER NOT NULL,
    "initiative" INTEGER NOT NULL,
    "reactionAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BattleCombatant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveCondition" (
    "id" TEXT NOT NULL,
    "combatantId" TEXT NOT NULL,
    "type" "ConditionType" NOT NULL,
    "roundsRemaining" INTEGER NOT NULL,

    CONSTRAINT "ActiveCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleTurn" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "SkillType" NOT NULL,
    "skillCode" TEXT,
    "attackRoll" INTEGER,
    "targetValue" INTEGER,
    "hit" BOOLEAN,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_rating_idx" ON "User"("rating");

-- CreateIndex
CREATE INDEX "Build_userId_idx" ON "Build"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Build_userId_name_key" ON "Build"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_code_key" ON "Skill"("code");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "Battle_challengerId_status_idx" ON "Battle"("challengerId", "status");

-- CreateIndex
CREATE INDEX "Battle_opponentId_status_idx" ON "Battle"("opponentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BattleCombatant_battleId_userId_key" ON "BattleCombatant"("battleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveCondition_combatantId_type_key" ON "ActiveCondition"("combatantId", "type");

-- CreateIndex
CREATE INDEX "BattleTurn_battleId_idx" ON "BattleTurn"("battleId");

-- CreateIndex
CREATE UNIQUE INDEX "BattleTurn_battleId_round_sequence_key" ON "BattleTurn"("battleId", "round", "sequence");

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildSkill" ADD CONSTRAINT "BuildSkill_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildSkill" ADD CONSTRAINT "BuildSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleCombatant" ADD CONSTRAINT "BattleCombatant_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleCombatant" ADD CONSTRAINT "BattleCombatant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleCombatant" ADD CONSTRAINT "BattleCombatant_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveCondition" ADD CONSTRAINT "ActiveCondition_combatantId_fkey" FOREIGN KEY ("combatantId") REFERENCES "BattleCombatant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleTurn" ADD CONSTRAINT "BattleTurn_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
