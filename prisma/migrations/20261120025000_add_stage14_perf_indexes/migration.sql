-- CreateIndex
CREATE INDEX "GameParticipant_sessionId_kicked_idx" ON "GameParticipant"("sessionId", "kicked");

-- CreateIndex
CREATE INDEX "Quiz_ownerId_updatedAt_idx" ON "Quiz"("ownerId", "updatedAt" DESC);
