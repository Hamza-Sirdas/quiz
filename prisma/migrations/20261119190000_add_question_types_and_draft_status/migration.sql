-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'MULTI_SELECT', 'ORDERING');

-- AlterTable
ALTER TABLE "Quiz"
ADD COLUMN "status" "QuizStatus" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
ALTER TABLE "Question"
ADD COLUMN "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
ADD COLUMN "explanation" VARCHAR(600) NOT NULL DEFAULT '',
ADD COLUMN "allowPartialCredit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GameAnswer"
ADD COLUMN "answerPayload" JSONB;

-- CreateIndex
CREATE INDEX "Quiz_ownerId_status_idx" ON "Quiz"("ownerId", "status");
