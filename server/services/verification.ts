/**
 * Claim verification coordination service with Firestore caching.
 */

import { geminiService } from './gemini.ts';
import { firestoreService } from './firestore.ts';
import { logger } from '../utils/logger.ts';

export interface ClaimVerificationItem {
  claim: string;
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE';
  explanation: string;
  sources: Array<{ title: string; url: string }>;
}

export const verificationService = {
  async verifyClaims(
    claims: Array<{ claim: string; importance?: string }>,
    context = '',
    analysisId?: string
  ): Promise<{ results: ClaimVerificationItem[] }> {
    logger.info('Starting claim verification pipeline', { claimCount: claims.length, analysisId });

    // Limit to top 4 claims to conserve latency and search quota
    const targets = claims.slice(0, 4);

    const results = await geminiService.verifyClaimsBatch(targets, context);

    if (analysisId) {
      try {
        await firestoreService.saveVerificationResults(analysisId, results);
      } catch (err) {
        logger.warn('Failed to save verification results to Firestore', { error: err });
      }
    }

    return { results };
  },
};
