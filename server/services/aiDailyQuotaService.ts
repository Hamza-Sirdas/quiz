import {
  AI_DAILY_LIMIT_EXHAUSTED_MESSAGE,
  AI_LIMITS,
  type AiDailyQuotaStatus,
  type AiUsageSummary,
} from '../../shared/aiTypes';
import { prisma } from '../lib/prisma';
import { AiDomainError } from './aiQuestionValidator';

const ISTANBUL_TZ = 'Europe/Istanbul' as const;

const istanbulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISTANBUL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Türkiye saatiyle (Europe/Istanbul) "YYYY-MM-DD" gün anahtarını üretir.
 * Gece yarısı (00:00 Europe/Istanbul) geçildiğinde yeni gün anahtarı döner.
 */
export function getIstanbulDateKey(now: Date = new Date()): string {
  return istanbulDateFormatter.format(now);
}

export async function getTeacherDailyQuotaStatus(
  teacherId: string,
  dailyLimit: number = AI_LIMITS.DAILY_QUIZ_LIMIT,
  now: Date = new Date(),
): Promise<AiDailyQuotaStatus> {
  const usageDate = getIstanbulDateKey(now);
  const record = await prisma.teacherAiDailyUsage.findUnique({
    where: {
      teacherId_usageDate: {
        teacherId,
        usageDate,
      },
    },
  });

  const usedToday = record?.usedCount ?? 0;
  const remainingToday = Math.max(0, dailyLimit - usedToday);

  return {
    dailyLimit,
    usedToday,
    remainingToday,
    usageDate,
    timezone: ISTANBUL_TZ,
  };
}

/**
 * Öğretmenin günlük hakkını atomik olarak kontrol eder ve inFlight kilidi alır.
 * - Aynı öğretmenin eşzamanlı ikinci bir istek başlatmasını veritabanı satır kilidiyle engeller.
 * - Günlük 5 başarılı hak dolmuşsa DAILY_LIMIT_REACHED (429) fırlatır.
 */
export async function reserveDailyQuotaSlot(
  teacherId: string,
  dailyLimit: number = AI_LIMITS.DAILY_QUIZ_LIMIT,
  now: Date = new Date(),
): Promise<{ usageDate: string }> {
  const usageDate = getIstanbulDateKey(now);

  await prisma.teacherAiDailyUsage.upsert({
    where: {
      teacherId_usageDate: {
        teacherId,
        usageDate,
      },
    },
    create: {
      teacherId,
      usageDate,
      usedCount: 0,
      inFlight: 0,
    },
    update: {},
  });

  const reserved = await prisma.teacherAiDailyUsage.updateMany({
    where: {
      teacherId,
      usageDate,
      inFlight: 0,
      usedCount: { lt: dailyLimit },
    },
    data: {
      inFlight: { increment: 1 },
    },
  });

  if (reserved.count === 0) {
    const existing = await prisma.teacherAiDailyUsage.findUnique({
      where: {
        teacherId_usageDate: {
          teacherId,
          usageDate,
        },
      },
    });

    if ((existing?.usedCount ?? 0) >= dailyLimit) {
      throw new AiDomainError(
        'DAILY_LIMIT_REACHED',
        AI_DAILY_LIMIT_EXHAUSTED_MESSAGE,
        429,
        false,
      );
    }

    throw new AiDomainError(
      'GENERATION_IN_PROGRESS',
      'Devam eden bir yapay zekâ quiz oluşturma işleminiz zaten var. Lütfen tamamlanmasını bekleyin veya iptal edin.',
      409,
      false,
    );
  }

  return { usageDate };
}

/**
 * Yalnızca Gemini yanıtı VE sunucu şema doğrulaması başarıyla tamamlandığında
 * öğretmenin günlük kullanım sayacını 1 artırır ve inFlight kilidini serbest bırakır.
 */
export async function commitDailyQuotaSlot(
  teacherId: string,
  usageDate: string,
  usage: AiUsageSummary,
  dailyLimit: number = AI_LIMITS.DAILY_QUIZ_LIMIT,
): Promise<AiDailyQuotaStatus> {
  const updated = await prisma.teacherAiDailyUsage.update({
    where: {
      teacherId_usageDate: {
        teacherId,
        usageDate,
      },
    },
    data: {
      usedCount: { increment: 1 },
      inFlight: 0,
      lastModel: usage.model.slice(0, 80),
      totalTokens: { increment: Math.max(0, usage.totalTokens) },
    },
  });

  return {
    dailyLimit,
    usedToday: updated.usedCount,
    remainingToday: Math.max(0, dailyLimit - updated.usedCount),
    usageDate,
    timezone: ISTANBUL_TZ,
  };
}

/**
 * Başarısız API çağrılarında veya doğrulama hatalarında günlük hakkı düşmeden
 * yalnızca inFlight kilidini sıfırlar.
 */
export async function releaseDailyQuotaSlot(
  teacherId: string,
  usageDate: string,
): Promise<void> {
  await prisma.teacherAiDailyUsage
    .updateMany({
      where: {
        teacherId,
        usageDate,
        inFlight: { gt: 0 },
      },
      data: {
        inFlight: 0,
      },
    })
    .catch(() => undefined);
}
