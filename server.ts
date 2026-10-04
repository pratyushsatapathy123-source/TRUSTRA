/**
 * TRUSTRA Full-Stack Server Entry Point
 * Runs Express backend with Vite middleware in development and static bundle in production.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { analyzeRouter } from './server/routes/analyze.ts';
import { verifyRouter } from './server/routes/verify.ts';
import { translateRouter } from './server/routes/translate.ts';
import { healthRouter } from './server/routes/health.ts';
import { logger } from './server/utils/logger.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Basic in-memory rate limiter for abuse prevention
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // Generous to not hinder demo

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-client';
  const now = Date.now();

  const clientData = rateLimitMap.get(clientIp);
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: true,
      message: 'Too many requests. Please wait and try again.',
    });
  }

  clientData.count += 1;
  return next();
}

// Global middlewares
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Apply rate limiting specifically to analysis endpoints
app.use('/api/analyze', rateLimiter);
app.use('/api/analyze-image', rateLimiter);

// Mount API routes
app.use('/api', analyzeRouter);
app.use('/api', verifyRouter);
app.use('/api', translateRouter);
app.use('/api', healthRouter);

// Global safe error handler - NEVER expose stack traces
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const errMsg = err instanceof Error ? err.message : String(err);
  logger.error('Unhandled server error', { error: errMsg });
  return res.status(500).json({
    error: true,
    message: 'TRUSTRA encountered an unexpected internal error. Please try again.',
  });
});

async function startServer() {
  if (!isProd) {
    // Development mode: attach Vite dev server middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    logger.info('Vite dev middleware attached');
  } else {
    // Production mode: serve compiled frontend
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    logger.info('Serving static production build from dist');
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`TRUSTRA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err);
  process.exit(1);
});
