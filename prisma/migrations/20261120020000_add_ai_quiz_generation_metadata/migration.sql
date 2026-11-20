-- CreateEnum
CREATE TYPE "AiGenerationMethod" AS ENUM ('TOPIC', 'PDF', 'TEXT');

-- AlterTable
ALTER TABLE "Quiz"
ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiGenerationMethod" "AiGenerationMethod",
ADD COLUMN "aiSourceType" VARCHAR(60),
ADD COLUMN "aiSourceSummary" VARCHAR(200),
ADD COLUMN "aiGeneratedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Question"
ADD COLUMN "sourceReference" VARCHAR(200),
ADD COLUMN "difficulty" VARCHAR(20);

-- CreateIndex
CREATE INDEX "Quiz_ownerId_aiGenerated_idx" ON "Quiz"("ownerId", "aiGenerated");
