-- CreateEnum
CREATE TYPE "QuizVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- AlterTable
ALTER TABLE "Quiz"
ADD COLUMN "visibility" "QuizVisibility" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN "shareToken" VARCHAR(128),
ADD COLUMN "allowPublicPreview" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "originalQuizId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_shareToken_key" ON "Quiz"("shareToken");

-- CreateIndex
CREATE INDEX "Quiz_ownerId_visibility_idx" ON "Quiz"("ownerId", "visibility");

-- CreateIndex
CREATE INDEX "Quiz_status_visibility_category_updatedAt_idx" ON "Quiz"("status", "visibility", "category", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Quiz_status_visibility_updatedAt_idx" ON "Quiz"("status", "visibility", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Quiz_originalQuizId_idx" ON "Quiz"("originalQuizId");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_originalQuizId_fkey" FOREIGN KEY ("originalQuizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;
