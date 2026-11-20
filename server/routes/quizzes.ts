import crypto from 'node:crypto';
import type {
  AiGenerationMethod,
  Prisma,
  QuizStatus,
  QuizVisibility,
} from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { resolveCategoryFilterValues } from '../../shared/quizTypes';
import { createHttpRateLimiter } from '../game/rateLimiter';
import { prisma } from '../lib/prisma';
import { requireTeacher } from '../middleware/requireTeacher';
import {
  QUIZ_VISIBILITY_VALUES,
  quizPayloadSchema,
  type ValidatedQuizPayload,
} from '../schemas/quizSchema';

export const quizzesRouter = Router();

quizzesRouter.use(requireTeacher);

const shareMutationLimiter = createHttpRateLimiter({
  windowMs: 60 * 1000,
  max: 45,
  message:
    'Çok fazla paylaşım veya kopyalama isteği gönderildi. Lütfen kısa bir süre sonra tekrar deneyin.',
});

export function generateQuizShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

const quizDetailInclude = {
  originalQuiz: {
    select: {
      id: true,
      title: true,
    },
  },
  questions: {
    orderBy: { order: 'asc' as const },
    include: {
      options: {
        orderBy: { order: 'asc' as const },
      },
    },
  },
};

function mapQuestionsCreate(questions: ValidatedQuizPayload['questions']) {
  return questions.map((question, questionIndex) => ({
    order: questionIndex + 1,
    type: question.type,
    text: question.text,
    explanation: question.explanation,
    sourceReference: question.sourceReference ?? null,
    difficulty: question.difficulty ?? null,
    allowPartialCredit:
      question.type === 'MULTI_SELECT' ? Boolean(question.allowPartialCredit) : false,
    imageUrl: question.imageUrl,
    timeLimitSec: question.timeLimitSec,
    points: question.points,
    options: {
      create: question.options.map((option, optionIndex) => ({
        order: optionIndex + 1,
        text: option.text,
        isCorrect: question.type === 'ORDERING' ? true : option.isCorrect,
      })),
    },
  }));
}

function serializeQuizDetail(quiz: {
  id: string;
  status: QuizStatus;
  visibility: QuizVisibility;
  shareToken: string | null;
  allowPublicPreview: boolean;
  originalQuizId: string | null;
  originalQuiz?: { id: string; title: string } | null;
  aiGenerated: boolean;
  aiGenerationMethod: AiGenerationMethod | null;
  aiSourceType: string | null;
  aiSourceSummary: string | null;
  aiGeneratedAt: Date | null;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  questions: unknown[];
}) {
  return {
    id: quiz.id,
    status: quiz.status,
    visibility: quiz.visibility,
    shareToken: quiz.shareToken,
    allowPublicPreview: quiz.allowPublicPreview,
    originalQuizId: quiz.originalQuizId,
    originalQuizTitle: quiz.originalQuiz?.title ?? null,
    aiGenerated: quiz.aiGenerated,
    aiGenerationMethod: quiz.aiGenerationMethod,
    aiSourceType: quiz.aiSourceType,
    aiSourceSummary: quiz.aiSourceSummary,
    aiGeneratedAt: quiz.aiGeneratedAt ? quiz.aiGeneratedAt.toISOString() : null,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    coverImageUrl: quiz.coverImageUrl,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
    questions: quiz.questions,
  };
}

quizzesRouter.get('/', async (req, res) => {
  const teacherId = req.teacher!.id;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const category =
    typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const statusQuery =
    typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const visibilityQuery =
    typeof req.query.visibility === 'string' ? req.query.visibility.trim() : '';

  const where: Prisma.QuizWhereInput = {
    ownerId: teacherId,
  };

  if (category && category !== 'Tümü') {
    const categoryValues = resolveCategoryFilterValues(category);
    where.category =
      categoryValues.length > 1 ? { in: categoryValues } : categoryValues[0];
  }

  if (statusQuery === 'DRAFT' || statusQuery === 'PUBLISHED') {
    where.status = statusQuery as QuizStatus;
  }

  if (
    visibilityQuery === 'PRIVATE' ||
    visibilityQuery === 'UNLISTED' ||
    visibilityQuery === 'PUBLIC'
  ) {
    where.visibility = visibilityQuery as QuizVisibility;
  } else if (visibilityQuery === 'SHARED') {
    where.OR = [
      { visibility: { in: ['PUBLIC', 'UNLISTED'] } },
      { shareToken: { not: null } },
    ];
  }

  if (search) {
    const searchCond: Prisma.QuizWhereInput = {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ],
    };
    where.AND = Array.isArray(where.AND)
      ? [...where.AND, searchCond]
      : where.AND
        ? [where.AND, searchCond]
        : [searchCond];
  }

  const rawQuizzes = await prisma.quiz.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      originalQuiz: {
        select: { id: true, title: true },
      },
      _count: {
        select: { questions: true },
      },
    },
  });

  const quizzes = rawQuizzes.map((quiz) => ({
    id: quiz.id,
    status: quiz.status,
    visibility: quiz.visibility,
    shareToken: quiz.shareToken,
    allowPublicPreview: quiz.allowPublicPreview,
    originalQuizId: quiz.originalQuizId,
    originalQuizTitle: quiz.originalQuiz?.title ?? null,
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

  res.json({ quizzes });
});

quizzesRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  const teacherId = req.teacher!.id;

  const quiz = await prisma.quiz.findFirst({
    where: { id, ownerId: teacherId },
    include: quizDetailInclude,
  });

  if (!quiz) {
    res.status(404).json({ message: 'İstenen quiz bulunamadı.' });
    return;
  }

  res.json({ quiz: serializeQuizDetail(quiz) });
});

quizzesRouter.post('/', async (req, res) => {
  const teacherId = req.teacher!.id;
  const payload = quizPayloadSchema.parse(req.body);

  const effectiveVisibility: QuizVisibility =
    payload.status === 'DRAFT' ? 'PRIVATE' : payload.visibility;
  const initialShareToken =
    effectiveVisibility === 'UNLISTED' ? generateQuizShareToken() : null;

  const isAiGenerated = Boolean(payload.aiGenerated);
  const aiGeneratedAt =
    isAiGenerated && payload.aiGeneratedAt
      ? new Date(payload.aiGeneratedAt)
      : isAiGenerated
        ? new Date()
        : null;

  const quiz = await prisma.quiz.create({
    data: {
      ownerId: teacherId,
      status: payload.status,
      visibility: effectiveVisibility,
      shareToken: initialShareToken,
      allowPublicPreview: payload.allowPublicPreview,
      aiGenerated: isAiGenerated,
      aiGenerationMethod: isAiGenerated ? (payload.aiGenerationMethod ?? null) : null,
      aiSourceType: isAiGenerated ? (payload.aiSourceType ?? null) : null,
      aiSourceSummary: isAiGenerated ? (payload.aiSourceSummary ?? null) : null,
      aiGeneratedAt,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      coverImageUrl: payload.coverImageUrl,
      questions: {
        create: mapQuestionsCreate(payload.questions),
      },
    },
    include: quizDetailInclude,
  });

  res.status(201).json({ quiz: serializeQuizDetail(quiz) });
});

quizzesRouter.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const teacherId = req.teacher!.id;
  const payload = quizPayloadSchema.parse(req.body);

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.quiz.findFirst({
      where: { id, ownerId: teacherId },
      select: {
        id: true,
        visibility: true,
        shareToken: true,
      },
    });

    if (!existing) {
      return null;
    }

    const nextVisibility: QuizVisibility =
      payload.status === 'DRAFT'
        ? 'PRIVATE'
        : req.body && typeof req.body.visibility === 'string'
          ? payload.visibility
          : existing.visibility;

    let nextShareToken = existing.shareToken;
    if (nextVisibility === 'PRIVATE') {
      nextShareToken = null;
    } else if (nextVisibility === 'UNLISTED' && !nextShareToken) {
      nextShareToken = generateQuizShareToken();
    }

    await tx.question.deleteMany({
      where: { quizId: id },
    });

    return tx.quiz.update({
      where: { id },
      data: {
        status: payload.status,
        visibility: nextVisibility,
        shareToken: nextShareToken,
        allowPublicPreview:
          req.body && typeof req.body.allowPublicPreview === 'boolean'
            ? payload.allowPublicPreview
            : undefined,
        ...(typeof payload.aiGenerated === 'boolean'
          ? { aiGenerated: payload.aiGenerated }
          : {}),
        ...(payload.aiGenerationMethod !== undefined
          ? { aiGenerationMethod: payload.aiGenerationMethod }
          : {}),
        ...(payload.aiSourceType !== undefined
          ? { aiSourceType: payload.aiSourceType }
          : {}),
        ...(payload.aiSourceSummary !== undefined
          ? { aiSourceSummary: payload.aiSourceSummary }
          : {}),
        ...(payload.aiGeneratedAt !== undefined
          ? {
              aiGeneratedAt: payload.aiGeneratedAt
                ? new Date(payload.aiGeneratedAt)
                : null,
            }
          : {}),
        title: payload.title,
        description: payload.description,
        category: payload.category,
        coverImageUrl: payload.coverImageUrl,
        questions: {
          create: mapQuestionsCreate(payload.questions),
        },
      },
      include: quizDetailInclude,
    });
  });

  if (!updated) {
    res.status(404).json({ message: 'Güncellenecek quiz bulunamadı.' });
    return;
  }

  res.json({ quiz: serializeQuizDetail(updated) });
});

const updateShareSettingsSchema = z.object({
  visibility: z.enum(QUIZ_VISIBILITY_VALUES).optional(),
  allowPublicPreview: z.boolean().optional(),
  action: z.enum(['GENERATE_LINK', 'REVOKE_LINK']).optional(),
});

quizzesRouter.patch('/:id/share', shareMutationLimiter, async (req, res) => {
  const id = String(req.params.id);
  const teacherId = req.teacher!.id;
  const parsed = updateShareSettingsSchema.parse(req.body ?? {});

  const existing = await prisma.quiz.findFirst({
    where: { id, ownerId: teacherId },
    select: {
      id: true,
      status: true,
      visibility: true,
      allowPublicPreview: true,
      shareToken: true,
    },
  });

  if (!existing) {
    res.status(404).json({ message: 'İstenen quiz bulunamadı.' });
    return;
  }

  let nextVisibility: QuizVisibility =
    parsed.visibility ?? existing.visibility;
  let nextShareToken: string | null = existing.shareToken;
  const nextAllowPublicPreview: boolean =
    parsed.allowPublicPreview ?? existing.allowPublicPreview;

  if (parsed.action === 'REVOKE_LINK') {
    nextShareToken = null;
    if (nextVisibility === 'UNLISTED') {
      nextVisibility = 'PRIVATE';
    }
  } else if (parsed.action === 'GENERATE_LINK') {
    nextShareToken = generateQuizShareToken();
    if (nextVisibility === 'PRIVATE') {
      nextVisibility = 'UNLISTED';
    }
  }

  if (nextVisibility === 'PRIVATE') {
    nextShareToken = null;
  } else if (nextVisibility === 'UNLISTED' && !nextShareToken) {
    nextShareToken = generateQuizShareToken();
  }

  if (existing.status === 'DRAFT' && nextVisibility !== 'PRIVATE') {
    res.status(400).json({
      code: 'DRAFT_CANNOT_BE_SHARED',
      message:
        'Taslak durumundaki quizler paylaşılamaz. Önce quizi yayına hazır olarak kaydedin.',
    });
    return;
  }

  const updated = await prisma.quiz.update({
    where: { id },
    data: {
      visibility: nextVisibility,
      shareToken: nextShareToken,
      allowPublicPreview: nextAllowPublicPreview,
    },
    select: {
      id: true,
      visibility: true,
      allowPublicPreview: true,
      shareToken: true,
    },
  });

  res.json({
    share: {
      quizId: updated.id,
      visibility: updated.visibility,
      allowPublicPreview: updated.allowPublicPreview,
      shareToken: updated.shareToken,
    },
  });
});

const cloneQuizSchema = z.object({
  shareToken: z.string().trim().max(128).optional().nullable(),
});

quizzesRouter.post('/:id/clone', shareMutationLimiter, async (req, res) => {
  const sourceId = String(req.params.id);
  const teacherId = req.teacher!.id;
  const { shareToken } = cloneQuizSchema.parse(req.body ?? {});

  const cloned = await prisma.$transaction(async (tx) => {
    const source = await tx.quiz.findUnique({
      where: { id: sourceId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!source) {
      return { status: 'NOT_FOUND' as const };
    }

    const isOwner = source.ownerId === teacherId;
    const isPublic =
      source.status === 'PUBLISHED' && source.visibility === 'PUBLIC';
    const isValidShareLink =
      source.status === 'PUBLISHED' &&
      (source.visibility === 'UNLISTED' || source.visibility === 'PUBLIC') &&
      Boolean(source.shareToken) &&
      typeof shareToken === 'string' &&
      shareToken.length > 0 &&
      source.shareToken === shareToken;

    if (!isOwner && !isPublic && !isValidShareLink) {
      return { status: 'FORBIDDEN' as const };
    }

    const newQuiz = await tx.quiz.create({
      data: {
        ownerId: teacherId,
        status: source.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        visibility: 'PRIVATE',
        shareToken: null,
        allowPublicPreview: true,
        originalQuizId: source.id,
        aiGenerated: source.aiGenerated,
        aiGenerationMethod: source.aiGenerationMethod,
        aiSourceType: source.aiSourceType,
        aiSourceSummary: source.aiSourceSummary,
        aiGeneratedAt: source.aiGeneratedAt,
        title: source.title,
        description: source.description,
        category: source.category,
        coverImageUrl: source.coverImageUrl,
        questions: {
          create: source.questions.map((question, qIndex) => ({
            order: qIndex + 1,
            type: question.type,
            text: question.text,
            explanation: question.explanation,
            sourceReference: question.sourceReference,
            difficulty: question.difficulty,
            allowPartialCredit: question.allowPartialCredit,
            imageUrl: question.imageUrl,
            timeLimitSec: question.timeLimitSec,
            points: question.points,
            options: {
              create: question.options.map((opt, optIndex) => ({
                order: optIndex + 1,
                text: opt.text,
                isCorrect: opt.isCorrect,
              })),
            },
          })),
        },
      },
      include: quizDetailInclude,
    });

    return { status: 'OK' as const, quiz: newQuiz };
  });

  if (cloned.status === 'NOT_FOUND') {
    res.status(404).json({
      code: 'QUIZ_NOT_FOUND',
      message: 'Kopyalanmak istenen quiz bulunamadı veya artık erişilebilir değil.',
    });
    return;
  }

  if (cloned.status === 'FORBIDDEN') {
    res.status(403).json({
      code: 'CLONE_FORBIDDEN',
      message:
        'Bu quiz özeldir veya paylaşım bağlantısı iptal edilmiştir; kütüphanenize kopyalanamaz.',
    });
    return;
  }

  res.status(201).json({ quiz: serializeQuizDetail(cloned.quiz) });
});

quizzesRouter.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const teacherId = req.teacher!.id;

  const deleted = await prisma.quiz.deleteMany({
    where: { id, ownerId: teacherId },
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: 'İstenen quiz bulunamadı.' });
    return;
  }

  res.json({ deletedId: id });
});
