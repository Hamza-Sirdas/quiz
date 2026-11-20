import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireTeacher } from '../middleware/requireTeacher';

export const dashboardRouter = Router();

dashboardRouter.use(requireTeacher);

dashboardRouter.get('/summary', async (req, res) => {
  const teacherId = req.teacher!.id;

  const [rawQuizzes, completedSessionsCount, totalParticipantsCount] =
    await Promise.all([
      prisma.quiz.findMany({
        where: { ownerId: teacherId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          visibility: true,
          shareToken: true,
          allowPublicPreview: true,
          originalQuizId: true,
          aiGenerated: true,
          aiGenerationMethod: true,
          aiSourceType: true,
          aiSourceSummary: true,
          aiGeneratedAt: true,
          title: true,
          description: true,
          category: true,
          coverImageUrl: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { questions: true },
          },
        },
      }),
      prisma.gameSession.count({
        where: { hostTeacherId: teacherId, status: 'FINISHED' },
      }),
      prisma.gameParticipant.count({
        where: {
          kicked: false,
          session: {
            hostTeacherId: teacherId,
            status: 'FINISHED',
          },
        },
      }),
    ]);

  const quizzes = rawQuizzes.map((quiz) => ({
    id: quiz.id,
    status: quiz.status,
    visibility: quiz.visibility,
    shareToken: quiz.shareToken,
    allowPublicPreview: quiz.allowPublicPreview,
    originalQuizId: quiz.originalQuizId,
    aiGenerated: quiz.aiGenerated,
    aiGenerationMethod: quiz.aiGenerationMethod,
    aiSourceType: quiz.aiSourceType,
    aiSourceSummary: quiz.aiSourceSummary,
    aiGeneratedAt: quiz.aiGeneratedAt ? quiz.aiGeneratedAt.toISOString() : null,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    coverImageUrl: quiz.coverImageUrl,
    questionCount: quiz._count.questions,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
  }));

  const totalQuizzes = quizzes.length;
  const publishedCount = quizzes.filter((q) => q.status === 'PUBLISHED').length;
  const draftCount = quizzes.filter((q) => q.status === 'DRAFT').length;
  const totalQuestions = quizzes.reduce(
    (sum, quiz) => sum + quiz.questionCount,
    0,
  );

  res.json({
    totalQuizzes,
    publishedCount,
    draftCount,
    totalQuestions,
    completedSessionsCount,
    totalParticipantsCount,
    lastUpdatedAt: quizzes[0]?.updatedAt ?? null,
    recentQuizzes: quizzes.slice(0, 4),
    quizzes,
  });
});
