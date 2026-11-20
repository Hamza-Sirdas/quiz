-- AlterTable
ALTER TABLE "GameAnswer"
ADD COLUMN "isPartial" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "GameSession_hostTeacherId_status_createdAt_idx" ON "GameSession"("hostTeacherId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GameAnswer_sessionId_participantId_idx" ON "GameAnswer"("sessionId", "participantId");
