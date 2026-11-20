import http from 'node:http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@shared/gameTypes';
import { getServerConfig, isOriginAllowed } from './config/env';
import { GameManager, type GameManagerOptions } from './game/GameManager';
import { logger } from './lib/logger';
import { csrfProtection } from './middleware/csrfProtection';
import { enforceHttps } from './middleware/enforceHttps';
import { errorHandler } from './middleware/errorHandler';
import { resolveTeacherIdFromCookieHeader } from './middleware/requireTeacher';
import { UPLOADS_DIR } from './middleware/upload';
import { createAiRouter } from './routes/ai';
import { createAuthRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { exploreRouter } from './routes/explore';
import { createGamesRouter } from './routes/games';
import { createHealthRouter } from './routes/health';
import { quizzesRouter } from './routes/quizzes';
import { uploadsRouter } from './routes/uploads';
import type { EmailSender } from './services/emailService';
import type { AiQuizProvider } from './services/geminiProvider';
import { registerGameSockets } from './socket/registerGameSockets';

export interface CreateServerAppOptions extends GameManagerOptions {
  emailSender?: EmailSender;
  aiQuizProvider?: AiQuizProvider;
  aiRateLimitMax?: number;
  aiDailyLimitMax?: number;
  aiNowFn?: () => Date;
}

export function createServerApp(options: CreateServerAppOptions = {}) {
  const config = getServerConfig();
  const app = express();
  const httpServer = http.createServer(app);

  if (config.isProd && config.allowedOrigins.length === 0) {
    logger.warn('cors_origins_empty', {
      note: 'Production modunda CORS_ORIGINS boş; tarayıcı kaynaklı cross-origin istekler reddedilir.',
    });
  }

  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin, config.allowedOrigins));
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(enforceHttps);

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin, config.allowedOrigins));
      },
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  io.use((socket, next) => {
    void resolveTeacherIdFromCookieHeader(socket.handshake.headers.cookie)
      .then((teacherId) => {
        if (teacherId) {
          (socket.data as { teacherId?: string }).teacherId = teacherId;
        }
        next();
      })
      .catch(() => next());
  });

  const gameManager = new GameManager(options);
  gameManager.attachSocketServer(io);
  registerGameSockets(io, gameManager);

  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(UPLOADS_DIR, {
      maxAge: '30d',
      immutable: true,
    }),
  );

  app.use('/api/health', createHealthRouter(gameManager));
  app.use('/api', csrfProtection);
  app.use('/api/auth', createAuthRouter(options.emailSender));
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/explore', exploreRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/games', createGamesRouter(gameManager));
  app.use(
    '/api/ai',
    createAiRouter({
      aiQuizProvider: options.aiQuizProvider,
      rateLimitMax: options.aiRateLimitMax,
      dailyLimitMax: options.aiDailyLimitMax,
      nowFn: options.aiNowFn,
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'İstenen API uç noktası bulunamadı.' });
  });

  app.use(errorHandler);

  return { app, httpServer, io, gameManager, config };
}
