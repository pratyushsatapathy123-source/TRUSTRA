/**
 * Verification routes: POST /api/verify-claims
 */

import { Router, type Request, type Response } from 'express';
import { VerifyClaimsRequestSchema } from '../schemas/analysis.ts';
import { verificationService } from '../services/verification.ts';
import { logger } from '../utils/logger.ts';

export const verifyRouter = Router();

verifyRouter.post('/verify-claims', async (req: Request, res: Response) => {
  try {
    const parsed = VerifyClaimsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: true,
        message: parsed.error.issues[0]?.message || 'Invalid claims format.',
      });
    }

    const { claims, context } = parsed.data;
    const analysisId = typeof req.body.analysisId === 'string' ? req.body.analysisId : undefined;

    const data = await verificationService.verifyClaims(claims, context, analysisId);
    return res.json(data);
  } catch (error) {
    logger.error('Error in /api/verify-claims', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: true,
      message: 'Failed to verify claims with public directories. Please try again.',
    });
  }
});
