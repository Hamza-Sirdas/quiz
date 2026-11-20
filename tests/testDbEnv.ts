import 'dotenv/config';

/**
 * Stage 14 testlerini ve yük testlerini gerçek kullanıcı verilerinden ayırmak için
 * PostgreSQL bağlantısını izole `quizora_test` şemasına yönlendirir.
 *
 * NOT: `import { prisma } ...` satırlarından ÖNCE içe aktarılmalıdır.
 */
export function configureIsolatedTestDatabaseEnv(schemaName = 'quizora_test'): string {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error('DATABASE_URL ortam değişkeni tanımlı değil.');
  }

  const parsed = new URL(rawUrl);
  parsed.searchParams.set('schema', schemaName);
  const isolatedUrl = parsed.toString();
  process.env.DATABASE_URL = isolatedUrl;
  return isolatedUrl;
}

configureIsolatedTestDatabaseEnv();
