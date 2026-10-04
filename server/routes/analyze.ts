/**
 * Analysis routes: POST /api/analyze and POST /api/analyze-image
 */

import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { AnalyzeRequestSchema } from '../schemas/analysis.ts';
import { cleanAndNormalizeInput } from '../utils/sanitize.ts';
import { redactSensitiveData, detectCredentialKeywords } from '../services/redaction.ts';
import { evaluateDeterministicRisk, blendRiskScore } from '../services/riskEngine.ts';
import { geminiService } from '../services/gemini.ts';
import { firestoreService } from '../services/firestore.ts';
import { logger } from '../utils/logger.ts';

export const analyzeRouter = Router();

// Configure multer for in-memory file uploads (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Please upload PNG, JPEG, or WebP.'));
    }
  },
});

/**
 * POST /api/analyze
 * Analyzes financial message text for fraud and coercion signals.
 */
analyzeRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: true,
        message: parsed.error.issues[0]?.message || 'Invalid request body',
      });
    }

    const { message, language } = parsed.data;
    const { cleanedText, isAdvisoryRequest } = cleanAndNormalizeInput(message);

    if (!cleanedText) {
      return res.status(400).json({
        error: true,
        message: 'Message content cannot be empty.',
      });
    }

    const analysisId = `TR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // NON-NEGOTIABLE SAFETY GUARDRAIL: Refuse investment advisory requests
    if (isAdvisoryRequest) {
      return res.json({
        analysisId,
        riskLevel: 'LOW',
        riskScore: 0,
        confidence: 1.0,
        summary: 'TRUSTRA is strictly an investor safety and fraud-awareness system. It does not provide stock tips, buy/sell recommendations, or price predictions.',
        signals: [],
        claims: [],
        evidenceStatus: 'INSUFFICIENT_EVIDENCE',
        simpleExplanation: 'TRUSTRA helps you verify suspicious messages and protect you from fraud. We do not provide stock recommendations or financial advice.',
        safeActions: [
          {
            title: 'Consult a registered advisor',
            description: 'For investment advice, consult an officially registered Investment Adviser (RIA).',
            icon: 'verified_user',
          },
        ],
        disclaimer: 'TRUSTRA is an investor safety tool and does not provide financial or investment recommendations.',
      });
    }

    // Step 1: Deterministic risk and heuristic signal detection
    const deterministic = evaluateDeterministicRisk(cleanedText);

    // Step 2: Check for sensitive credential harvesting in the text
    const credentialChecks = detectCredentialKeywords(cleanedText);

    // Step 3: Run Gemini AI analysis pipeline
    const geminiResult = await geminiService.analyzeMessage(cleanedText, language, analysisId);

    // Step 4: Blend deterministic heuristics with Gemini reasoning
    const { finalScore, riskLevel } = blendRiskScore(
      deterministic.baseScore,
      geminiResult.riskScore,
      geminiResult.signals.length
    );

    // Merge any critical heuristic signals that Gemini might have missed
    const existingSignalNames = new Set(geminiResult.signals.map((s) => s.name.toLowerCase()));
    for (const hSignal of deterministic.heuristicSignals) {
      if (!existingSignalNames.has(hSignal.name.toLowerCase())) {
        geminiResult.signals.push(hSignal);
      }
    }

    // Merge heuristic claims if Gemini extracted too few
    if (geminiResult.claims.length === 0 && deterministic.heuristicClaims.length > 0) {
      geminiResult.claims = deterministic.heuristicClaims;
    }

    // If credential request detected, ensure high warning
    if (credentialChecks.hasOtpRequest || credentialChecks.hasPinRequest || credentialChecks.hasPasswordRequest) {
      geminiResult.signals.unshift({
        name: 'Credential Request Detected',
        severity: 'HIGH',
        explanation: 'Legitimate financial institutions never ask for OTPs, PINs, or net-banking passwords via chat or SMS.',
      });
    }

    const finalResult = {
      ...geminiResult,
      analysisId,
      riskScore: finalScore,
      riskLevel,
      confidence: Math.max(geminiResult.confidence, deterministic.confidence),
      safeActions: geminiResult.safeActions.length > 0
        ? geminiResult.safeActions
        : [
            {
              title: 'Do not transfer funds',
              description: 'Hold all payments regardless of deadline claims.',
              icon: 'do_not_disturb_on',
            },
            {
              title: 'Pause & consult family',
              description: 'Scammers rely on isolating you from advice.',
              icon: 'lock_clock',
            },
            {
              title: 'Cross-check regulatory directory',
              description: 'Use official directories, not numbers provided in SMS.',
              icon: 'fact_check',
            },
          ],
      disclaimer: 'TRUSTRA is an investor safety and educational tool. It is not an investment advisor and does not provide financial or legal advice.',
    };

    // Step 5: Privacy-conscious persistence to Firestore (NO raw message stored)
    firestoreService.saveAnalysis(finalResult, 'text', language).catch((err) => {
      logger.warn('Asynchronous Firestore save failed', { error: err });
    });

    return res.json(finalResult);
  } catch (error) {
    logger.error('Error processing /api/analyze', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: true,
      message: 'TRUSTRA could not complete the analysis. Please try again.',
    });
  }
});

/**
 * POST /api/analyze-image
 * Analyzes screenshot or image for financial claims and risk patterns.
 */
analyzeRouter.post('/analyze-image', upload.single('image'), async (req: Request, res: Response) => {
  try {
    let base64Data: string;
    let mimeType: string;
    const language = (req.body?.language as string) || 'en';

    if (req.file) {
      base64Data = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype;
    } else if (req.body?.image) {
      // Support base64 image passed via JSON payload
      const rawImage = req.body.image as string;
      const match = rawImage.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = rawImage;
        mimeType = req.body.mimeType || 'image/png';
      }
    } else {
      return res.status(400).json({
        error: true,
        message: 'No image provided. Please upload a screenshot (PNG, JPEG, or WebP).',
      });
    }

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      return res.status(400).json({
        error: true,
        message: 'Unsupported image format. Please upload PNG, JPEG, or WebP.',
      });
    }

    const analysisId = `TR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Ephemeral processing: send in-memory buffer to Gemini multimodal
    const geminiResult = await geminiService.analyzeImage(base64Data, mimeType, language, analysisId);

    // Save minimal metadata to Firestore (NEVER store raw screenshot)
    firestoreService.saveAnalysis(geminiResult, 'image', language).catch((err) => {
      logger.warn('Asynchronous Firestore image analysis save failed', { error: err });
    });

    return res.json(geminiResult);
  } catch (error) {
    logger.error('Error processing /api/analyze-image', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: true,
      message: 'TRUSTRA could not complete the image analysis. Please try again.',
    });
  }
});
