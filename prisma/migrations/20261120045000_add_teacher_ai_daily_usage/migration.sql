-- CreateTable
CREATE TABLE "TeacherAiDailyUsage" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "usageDate" VARCHAR(10) NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "inFlight" INTEGER NOT NULL DEFAULT 0,
    "lastModel" VARCHAR(80),
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAiDailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAiDailyUsage_teacherId_usageDate_key" ON "TeacherAiDailyUsage"("teacherId", "usageDate");

-- CreateIndex
CREATE INDEX "TeacherAiDailyUsage_teacherId_usageDate_idx" ON "TeacherAiDailyUsage"("teacherId", "usageDate");

-- AddForeignKey
ALTER TABLE "TeacherAiDailyUsage" ADD CONSTRAINT "TeacherAiDailyUsage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
