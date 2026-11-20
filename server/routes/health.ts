import { Router } from 'express';
import type { GameManager } from '../game/GameManager';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export function createHealthRouter(gameManager?: GameManager): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        database: 'connected',
        uptimeSec: Math.round(process.uptime()),
        activeRooms: gameManager ? gameManager.getActiveRoomCount() : 0,
      });
    } catch (error) {
      logger.error('health_check_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      res.status(503).json({
        ok: false,
        database: 'disconnected',
        message: 'Veritabanı bağlantısı şu anda kurulamıyor.',
      });
    }
  });

  return router;
}
