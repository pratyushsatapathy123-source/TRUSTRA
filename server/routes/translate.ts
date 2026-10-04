/**
 * Translation route: POST /api/translate
 */

import { Router, type Request, type Response } from 'express';
import { TranslateRequestSchema } from '../schemas/analysis.ts';
import { geminiService } from '../services/gemini.ts';
import { logger } from '../utils/logger.ts';

export const translateRouter = Router();

translateRouter.post('/translate', async (req: Request, res: Response) => {
  try {
    const parsed = TranslateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: true,
        message: parsed.error.issues[0]?.message || 'Invalid translation request.',
      });
    }

    const { text, targetLanguage } = parsed.data;
    const translatedText = await geminiService.translateText(text, targetLanguage);

    return res.json({
      translatedText,
      language: targetLanguage,
    });
  } catch (error) {
    logger.error('Error in /api/translate', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: true,
      message: 'Failed to translate content.',
    });
  }
});
