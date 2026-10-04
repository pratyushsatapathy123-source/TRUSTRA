/**
 * Health check route: GET /api/health
 */

import { Router, type Request, type Response } from 'express';
import { firestoreService } from '../services/firestore.ts';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  // Confirm service health without revealing secrets or keys
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const isFirestoreActive = firestoreService.isAvailable();

  return res.json({
    status: 'ok',
    service: 'trustra',
    configured: {
      ai: hasGeminiKey,
      storage: isFirestoreActive ? 'firestore' : 'volatile_memory',
    },
  });
});
