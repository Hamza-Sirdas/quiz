import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { resolveCategoryFilterValues } from '../../shared/quizTypes';
import { createHttpRateLimiter } from '../game/rateLimiter';
import { prisma } from '../lib/prisma';
import { optionalTeacher } from '../middleware/requireTeacher';

export const exploreRouter = Router();

exploreRouter.use(optionalTeacher);

const exploreLimiter = createHttpRateLimiter({
  windowMs: 60 * 1000,
  max: 90,
  message:
    'Çok fazla keşfet veya paylaşım sorgusu gönderildi. Lütfen kısa bir süre sonra tekrar deneyin.',
});

exploreRouter.use(exploreLimiter);

exploreRouter.get('/', async (req, res) => {
  const viewerId = req.teacher?.id ?? null;
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  const category =
    typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 60) : '';
  const sort =
    typeof req.query.sort === 'string' ? req.query.sort.trim() : 'newest';

  const minQuestionsRaw = Number(req.query.minQuestions);
  const maxQuestionsRaw = Number(req.query.maxQuestions);
  const minQuestions =
    Number.isFinite(minQuestionsRaw) && minQuestionsRaw > 0
      ? Math.floor(minQuestionsRaw)
      : null;
  const maxQuestions =
    Number.isFinite(maxQuestionsRaw) && maxQuestionsRaw > 0
      ? Math.floor(maxQuestionsRaw)
      : null;

  const pageRaw = Number(req.query.page);
  const pageSizeRaw = Number(req.query.pageSize);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 48
      ? Math.floor(pageSizeRaw)
      : 12;

  const where: Prisma.QuizWhereInput = {
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
  };

  if (category && category !== 'Tümü') {
    const categoryValues = resolveCategoryFilterValues(category);
    where.category =
      categoryValues.length > 1 ? { in: categoryValues } : categoryValues[0];
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.QuizOrderByWithRelationInput =
    sort === 'oldest'
      ? { createdAt: 'asc' }
      : sort === 'title_asc'
        ? { title: 'asc' }
        : sort === 'questions_desc'
          ? { questions: { _count: 'desc' } }
          : sort === 'questions_asc'
            ? { questions: { _count: 'asc' } }
            : { updatedAt: 'desc' };

  const quizSelect = {
    id: true,
    ownerId: true,
    title: true,
    description: true,
    category: true,
    coverImageUrl: true,
    allowPublicPreview: true,
    visibility: true,
    createdAt: true,
    updatedAt: true,
    owner: {
      select: {
        name: true,
      },
    },
    _count: {
      select: { questions: true },
    },
  } satisfies Prisma.QuizSelect;

  type ExploreRow = Prisma.QuizGetPayload<{ select: typeof quizSelect }>;

  let totalCount = 0;
  let totalPages = 1;
  let safePage = 1;
  let pagedItems: ExploreRow[] = [];

  if (minQuestions === null && maxQuestions === null) {
    const [counted, firstPageRows] = await Promise.all([
      prisma.quiz.count({ where }),
      prisma.quiz.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: quizSelect,
      }),
    ]);

    totalCount = counted;
    totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    safePage = Math.min(page, totalPages);
    pagedItems =
      safePage === page
        ? firstPageRows
        : await prisma.quiz.findMany({
            where,
            orderBy,
            skip: (safePage - 1) * pageSize,
            take: pageSize,
            select: quizSelect,
          });
  } else {
    const rawQuizzes = await prisma.quiz.findMany({
      where,
      orderBy,
      select: quizSelect,
    });

    const filtered = rawQuizzes.filter((q) => {
      const count = q._count.questions;
      if (minQuestions !== null && count < minQuestions) return false;
      if (maxQuestions !== null && count > maxQuestions) return false;
      return true;
    });

    totalCount = filtered.length;
    totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    pagedItems = filtered.slice(startIndex, startIndex + pageSize);
  }

  const quizzes = pagedItems.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    coverImageUrl: quiz.coverImageUrl,
    questionCount: quiz._count.questions,
    authorName: quiz.owner?.name ?? 'QUIZORA Öğretmeni',
    isOwnQuiz: Boolean(viewerId && quiz.ownerId === viewerId),
    allowPublicPreview: quiz.allowPublicPreview,
    visibility: quiz.visibility,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
  }));

  res.json({
    quizzes,
    pagination: {
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
    },
  });
});

exploreRouter.get('/share/:shareToken', async (req, res) => {
  const shareToken = String(req.params.shareToken ?? '').trim();
  const viewerId = req.teacher?.id ?? null;

  if (!shareToken || shareToken.length < 16) {
    res.status(404).json({
      code: 'SHARE_LINK_INVALID',
      message: 'Paylaşım bağlantısı geçersiz veya iptal edilmiş.',
    });
    return;
  }

  const quiz = await prisma.quiz.findFirst({
    where: {
      shareToken,
      status: 'PUBLISHED',
      visibility: { in: ['UNLISTED', 'PUBLIC'] },
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
        },
      },
      originalQuiz: {
        select: {
          id: true,
          title: true,
        },
      },
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

  if (!quiz) {
    res.status(404).json({
      code: 'SHARE_LINK_EXPIRED',
      message:
        'Bu paylaşım bağlantısının süresi dolmuş, bağlantı iptal edilmiş veya quiz özel duruma alınmış.',
    });
    return;
  }

  const isOwnQuiz = Boolean(viewerId && quiz.ownerId === viewerId);
  const canPreviewQuestions = isOwnQuiz || quiz.allowPublicPreview;

  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      category: quiz.category,
      coverImageUrl: quiz.coverImageUrl,
      questionCount: quiz.questions.length,
      authorName: quiz.owner?.name ?? 'QUIZORA Öğretmeni',
      isOwnQuiz,
      allowPublicPreview: quiz.allowPublicPreview,
      visibility: quiz.visibility,
      originalQuizId: quiz.originalQuizId,
      originalQuizTitle: quiz.originalQuiz?.title ?? null,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      questions: canPreviewQuestions ? quiz.questions : [],
    },
  });
});

exploreRouter.get('/:quizId', async (req, res) => {
  const quizId = String(req.params.quizId ?? '').trim();
  const tokenQuery =
    typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const viewerId = req.teacher?.id ?? null;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
        },
      },
      originalQuiz: {
        select: {
          id: true,
          title: true,
        },
      },
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

  if (!quiz) {
    res.status(404).json({
      code: 'QUIZ_NOT_FOUND',
      message: 'Aradığınız quiz bulunamadı veya silinmiş.',
    });
    return;
  }

  const isOwnQuiz = Boolean(viewerId && quiz.ownerId === viewerId);

  if (!isOwnQuiz) {
    if (quiz.status !== 'PUBLISHED') {
      res.status(403).json({
        code: 'QUIZ_PRIVATE',
        message: 'Bu quiz henüz yayınlanmamış veya özel olarak ayarlanmış.',
      });
      return;
    }

    if (quiz.visibility === 'PRIVATE') {
      if (tokenQuery.length > 0) {
        res.status(403).json({
          code: 'SHARE_LINK_EXPIRED',
          message:
            'Bu paylaşım bağlantısının süresi dolmuş, bağlantı iptal edilmiş veya quiz özel duruma alınmış.',
        });
        return;
      }
      res.status(403).json({
        code: 'QUIZ_PRIVATE',
        message:
          'Bu quiz özel olarak ayarlanmıştır. Yalnızca quiz sahibi görüntüleyebilir.',
      });
      return;
    }

    if (quiz.visibility === 'UNLISTED') {
      const hasValidToken =
        Boolean(quiz.shareToken) &&
        tokenQuery.length > 0 &&
        quiz.shareToken === tokenQuery;
      if (!hasValidToken) {
        res.status(403).json({
          code: 'SHARE_LINK_EXPIRED',
          message:
            'Bu bağlantıya özel quize erişmek için geçerli bir paylaşım bağlantısı gereklidir veya bağlantı iptal edilmiştir.',
        });
        return;
      }
    } else if (tokenQuery.length > 0 && quiz.shareToken !== tokenQuery) {
      // PUBLIC quiz veya eski token ile erişim: eğer token açıkça gönderildiyse ve iptal edildiyse bilgi ver
    }
  }

  const canPreviewQuestions = isOwnQuiz || quiz.allowPublicPreview;

  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      category: quiz.category,
      coverImageUrl: quiz.coverImageUrl,
      questionCount: quiz.questions.length,
      authorName: quiz.owner?.name ?? 'QUIZORA Öğretmeni',
      isOwnQuiz,
      allowPublicPreview: quiz.allowPublicPreview,
      visibility: quiz.visibility,
      originalQuizId: quiz.originalQuizId,
      originalQuizTitle: quiz.originalQuiz?.title ?? null,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      questions: canPreviewQuestions ? quiz.questions : [],
    },
  });
});
