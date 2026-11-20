import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function parseArgs(argv) {
  let email = '';
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--email' && argv[i + 1]) {
      email = argv[i + 1].trim().toLowerCase();
      i += 1;
    }
  }

  return { email, dryRun };
}

async function main() {
  const { email, dryRun } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const orphanQuizzes = await prisma.quiz.count({ where: { ownerId: null } });
    const orphanSessions = await prisma.gameSession.count({
      where: { hostTeacherId: null },
    });

    console.log(
      `Sahipsiz kayıt özeti -> Quiz: ${orphanQuizzes}, GameSession: ${orphanSessions}`,
    );

    if (dryRun || !email) {
      if (!email) {
        console.log(
          'Kullanım: node scripts/claim-orphan-data.mjs --email ogretmen@okul.edu.tr [--dry-run]',
        );
      }
      return;
    }

    const teacher = await prisma.teacher.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!teacher) {
      console.error(`Belirtilen e-posta ile öğretmen hesabı bulunamadı: ${email}`);
      process.exitCode = 1;
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedQuizzes = await tx.quiz.updateMany({
        where: { ownerId: null },
        data: { ownerId: teacher.id },
      });
      const updatedSessions = await tx.gameSession.updateMany({
        where: { hostTeacherId: null },
        data: { hostTeacherId: teacher.id },
      });
      return { updatedQuizzes: updatedQuizzes.count, updatedSessions: updatedSessions.count };
    });

    console.log(
      `Aktarım tamamlandı (${teacher.email}) -> Quiz: ${result.updatedQuizzes}, GameSession: ${result.updatedSessions}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
