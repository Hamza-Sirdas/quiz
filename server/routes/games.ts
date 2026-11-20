import { Router } from 'express';
import { z } from 'zod';
import type { GameManager } from '../game/GameManager';
import { createHttpRateLimiter } from '../game/rateLimiter';
import { buildGameAnalyticsCsv } from '../lib/csv';
import { generateGameAnalyticsPdfBuffer } from '../lib/pdfReport';
import { prisma } from '../lib/prisma';
import { requireTeacher } from '../middleware/requireTeacher';
import {
  buildGameSessionAnalytics,
  listTeacherGameHistory,
} from '../services/analyticsService';

const createGameSchema = z.object({
  quizId: z
    .string({ error: 'Quiz kimliği gereklidir.' })
    .trim()
    .min(1, 'Quiz kimliği boş olamaz.'),
  classroomMode: z.boolean().optional(),
});

export function createGamesRouter(gameManager: GameManager): Router {
  const router = Router();

  const createLimiter = createHttpRateLimiter({
    windowMs: 60_000,
    max: 60,
    message: 'Çok fazla oyun oluşturma isteği gönderildi. Lütfen kısa süre bekleyin.',
  });

  const validateLimiter = createHttpRateLimiter({
    windowMs: 60_000,
    max: 120,
    message: 'Çok fazla PIN doğrulama isteği gönderildi. Lütfen kısa süre bekleyin.',
  });

  router.post('/', requireTeacher, createLimiter, async (req, res) => {
    const { quizId, classroomMode } = createGameSchema.parse(req.body);
    const created = await gameManager.createSession(quizId, req.teacher!.id, {
      classroomMode,
    });
    res.status(201).json(created);
  });

  router.get('/validate/:pin', validateLimiter, async (req, res) => {
    const pin = String(req.params.pin);
    const info = await gameManager.validatePin(pin);
    res.json(info);
  });

  router.get('/history', requireTeacher, async (req, res) => {
    const teacherId = req.teacher!.id;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const sort =
      req.query.sort === 'oldest' ? ('oldest' as const) : ('newest' as const);
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined;

    const history = await listTeacherGameHistory(teacherId, {
      search,
      sort,
      status,
    });

    res.json({ history });
  });

  async function loadOwnedSessionResults(id: string, teacherId: string) {
    const session = await prisma.gameSession.findFirst({
      where: { id, hostTeacherId: teacherId },
      include: {
        results: {
          orderBy: { rank: 'asc' },
        },
        answers: {
          select: {
            participantId: true,
            isCorrect: true,
          },
        },
      },
    });

    if (!session) return null;

    const wrongCounts = new Map<string, number>();
    for (const ans of session.answers) {
      if (!ans.isCorrect) {
        wrongCounts.set(
          ans.participantId,
          (wrongCounts.get(ans.participantId) ?? 0) + 1,
        );
      }
    }

    const computedResults = session.results.map((row) => {
      const wrongCount = wrongCounts.get(row.participantId) ?? 0;
      const unansweredCount = Math.max(
        0,
        row.totalQuestions - row.correctCount - wrongCount,
      );
      return {
        id: row.id,
        participantId: row.participantId,
        nickname: row.nickname,
        rank: row.rank,
        totalScore: row.totalScore,
        correctCount: row.correctCount,
        wrongCount,
        unansweredCount,
        totalQuestions: row.totalQuestions,
        avgResponseMs: row.avgResponseMs,
      };
    });

    return { session, computedResults };
  }

  router.get('/history/:id', requireTeacher, async (req, res) => {
    const id = String(req.params.id);
    const teacherId = req.teacher!.id;

    const loaded = await loadOwnedSessionResults(id, teacherId);
    if (!loaded) {
      res.status(404).json({ message: 'Yarışma kaydı bulunamadı.' });
      return;
    }

    const { session, computedResults } = loaded;
    res.json({
      session: {
        id: session.id,
        pin: session.pin,
        quizTitle: session.quizTitle,
        quizCategory: session.quizCategory,
        status: session.status,
        startedAt: session.startedAt ? session.startedAt.toISOString() : null,
        endedAt: session.endedAt ? session.endedAt.toISOString() : null,
        createdAt: session.createdAt.toISOString(),
        results: computedResults,
      },
    });
  });

  router.get('/history/:id/analytics', requireTeacher, async (req, res) => {
    const id = String(req.params.id);
    const teacherId = req.teacher!.id;

    const analytics = await buildGameSessionAnalytics(id, teacherId);
    if (!analytics) {
      res.status(404).json({ message: 'Yarışma analiz kaydı bulunamadı.' });
      return;
    }

    res.json({ analytics });
  });

  router.get('/history/:id/csv', requireTeacher, async (req, res) => {
    const id = String(req.params.id);
    const teacherId = req.teacher!.id;

    const analytics = await buildGameSessionAnalytics(id, teacherId);
    if (!analytics) {
      res.status(404).json({ message: 'Yarışma kaydı bulunamadı.' });
      return;
    }

    const csvContent = buildGameAnalyticsCsv(analytics);
    const safePin = analytics.pin.replace(/[^0-9A-Za-z_-]/g, '');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="quizora-sonuclar-${safePin || analytics.id}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csvContent);
  });

  router.get('/history/:id/pdf', requireTeacher, async (req, res) => {
    const id = String(req.params.id);
    const teacherId = req.teacher!.id;

    const analytics = await buildGameSessionAnalytics(id, teacherId);
    if (!analytics) {
      res.status(404).json({ message: 'Yarışma kaydı bulunamadı.' });
      return;
    }

    const pdfBuffer = await generateGameAnalyticsPdfBuffer(analytics);
    const safePin = analytics.pin.replace(/[^0-9A-Za-z_-]/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="quizora-analiz-${safePin || analytics.id}.pdf"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
  });

  return router;
}
