import 'dotenv/config';
import { createServerApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const { httpServer, io, gameManager, config } = createServerApp();

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('server_shutdown_started', { signal });

  const forceTimer = setTimeout(() => {
    logger.warn('server_shutdown_forced');
    process.exit(1);
  }, 5000);
  forceTimer.unref?.();

  try {
    await gameManager.shutdownActiveRooms(
      'Sunucu yeniden başlatıldığı için aktif yarışma oturumu sonlandırıldı.',
    );
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await prisma.$disconnect();
    logger.info('server_shutdown_completed');
    process.exit(0);
  } catch (err) {
    logger.error('server_shutdown_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

async function bootstrap(): Promise<void> {
  try {
    const interruptedCount = await gameManager.markStaleSessionsInterrupted();
    if (interruptedCount > 0) {
      logger.info('stale_sessions_interrupted', { count: interruptedCount });
    }
  } catch (err) {
    logger.warn('stale_session_check_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  httpServer.listen(config.port, () => {
    logger.info('server_listening', {
      port: config.port,
      env: config.nodeEnv,
      allowedOriginsCount: config.allowedOrigins.length,
    });
  });
}

void bootstrap();
