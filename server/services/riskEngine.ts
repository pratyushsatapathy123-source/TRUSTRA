/**
 * Deterministic Safety Risk Engine for TRUSTRA.
 * Computes safety risk scores (0-100) and extracts high-confidence heuristic signals.
 */

import type { Signal, Claim } from '../schemas/analysis.ts';

export interface DeterministicEvaluation {
  baseScore: number;
  calculatedLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  heuristicSignals: Signal[];
  heuristicClaims: Claim[];
  confidence: number;
}

export function evaluateDeterministicRisk(text: string): DeterministicEvaluation {
  const lower = text.toLowerCase();
  const heuristicSignals: Signal[] = [];
  const heuristicClaims: Claim[] = [];
  let score = 5; // Clean baseline

  // 1. Guaranteed returns check
  const guaranteedRegex = /(guaranteed|assured|risk[- ]free|fixed return|100% safe return|\b\d+%\s*(monthly|per month|daily|weekly))/i;
  if (guaranteedRegex.test(text)) {
    score += 35;
    heuristicSignals.push({
      name: 'Guaranteed Return Promise',
      severity: 'HIGH',
      explanation: 'Promises of fixed or guaranteed returns violate securities standards and indicate potential Ponzi or illicit scheme characteristics.',
    });

    const matchReturn = text.match(/(\d+%\s*(?:monthly|daily|per month|annual|per day))/i) || ['Guaranteed returns'];
    heuristicClaims.push({
      claim: `Guaranteed ${matchReturn[0]} return`,
      type: 'financial',
      importance: 'HIGH',
      riskReason: 'Regulated capital markets never guarantee fixed compound returns.',
    });
  }

  // 2. Artificial urgency and scarcity
  const urgencyRegex = /(valid\s*(only\s*)?for\s*(\d+\s*(hours?|hrs?|minutes?|mins?))|limited\s*time|hurry|act\s*immediately|last\s*chance|expires\s*today|exclusive\s*opportunity|selected\s*for)/i;
  if (urgencyRegex.test(text)) {
    score += 25;
    heuristicSignals.push({
      name: 'Urgency & Pressure Tactics',
      severity: 'HIGH',
      explanation: 'Recipient is pressured to act quickly under time constraints, a known tactic designed to suppress deliberation and consultation with family.',
    });

    const matchUrgency = text.match(/(valid\s*(?:only\s*)?for\s*[^.,;]+|exclusive\s*opportunity|act\s*immediately)/i);
    heuristicClaims.push({
      claim: matchUrgency ? matchUrgency[0].trim() : 'Limited time pressure',
      type: 'urgency',
      importance: 'HIGH',
      riskReason: 'Manufactured temporal deadline to bypass standard verification.',
    });
  }

  // 3. Unverified regulatory or statutory authority claims
  const regulatoryRegex = /(sebi\s*approved|rbi\s*approved|rbi\s*authorized|government\s*approved|registered\s*with\s*sebi)/i;
  if (regulatoryRegex.test(text)) {
    score += 20;
    heuristicSignals.push({
      name: 'Unverified Regulatory Claim',
      severity: 'HIGH',
      explanation: 'Claims of SEBI or RBI approval are made without verifiable registration codes (e.g. INZxxxxxxxxx). SEBI never approves individual private returns or schemes.',
    });

    heuristicClaims.push({
      claim: 'SEBI approved claim',
      type: 'regulatory',
      importance: 'HIGH',
      riskReason: 'Regulatory seal claimed without registration identifier or official authorization.',
    });
  }

  // 4. Direct personal contact or unauthorized routing
  const contactRegex = /(contact\s+[a-z]+|dm\s+on\s+telegram|join\s+(?:telegram|whatsapp)\s+group|whatsapp\s+me|send\s+money\s+to\s+upi)/i;
  if (contactRegex.test(text)) {
    score += 15;
    heuristicSignals.push({
      name: 'Direct Individual Contact',
      severity: 'MEDIUM',
      explanation: 'Directs funds or communication toward an individual or private channel rather than institutional clearing corporations.',
    });

    const matchContact = text.match(/contact\s+[a-z]+/i);
    heuristicClaims.push({
      claim: matchContact ? matchContact[0] : 'Informal direct contact',
      type: 'identity',
      importance: 'MEDIUM',
      riskReason: 'Transactions routed to personal contacts evade institutional accounting.',
    });
  }

  // 5. Credential or OTP harvesting
  const credentialRegex = /\b(share\s*otp|send\s*pin|provide\s*password|netbanking\s*credentials|download\s*apk|install\s*anydesk)\b/i;
  if (credentialRegex.test(text)) {
    score += 40;
    heuristicSignals.push({
      name: 'Credential Harvesting Risk',
      severity: 'HIGH',
      explanation: 'Attempting to solicit OTPs, passwords, or device remote-control tools is an immediate severe threat indicator.',
    });
  }

  // Cap score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));

  let calculatedLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (finalScore >= 75) {
    calculatedLevel = 'HIGH';
  } else if (finalScore >= 25) {
    calculatedLevel = 'MEDIUM';
  }

  // Calculate confidence based on presence of distinct markers
  let confidence = 0.85;
  if (heuristicSignals.length >= 3) {
    confidence = 0.94;
  } else if (heuristicSignals.length >= 1) {
    confidence = 0.90;
  } else if (text.length < 30) {
    confidence = 0.65; // Short ambiguous text has lower confidence
  }

  return {
    baseScore: finalScore,
    calculatedLevel,
    heuristicSignals,
    heuristicClaims,
    confidence,
  };
}

/**
 * Merges deterministic calculations with Gemini contextual analysis
 * to ensure that scores are mathematically explainable and within safe bounds.
 */
export function blendRiskScore(
  deterministicScore: number,
  geminiScore: number,
  signalCount: number
): { finalScore: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' } {
  // If deterministic score is high because of critical triggers, keep it high
  let score: number;
  if (deterministicScore >= 75) {
    // Both agree or deterministic caught high risk signals
    score = Math.max(deterministicScore, geminiScore);
  } else if (deterministicScore >= 35) {
    // Weighted average
    score = Math.round(deterministicScore * 0.6 + geminiScore * 0.4);
  } else {
    // Low deterministic baseline, but Gemini may detect subtle nuance
    score = Math.round(deterministicScore * 0.4 + geminiScore * 0.6);
  }

  // Boost slightly if multiple signals were discovered
  if (signalCount >= 4 && score < 85) {
    score = Math.min(95, score + 10);
  }

  score = Math.min(100, Math.max(5, score));

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (score >= 75) {
    riskLevel = 'HIGH';
  } else if (score >= 25) {
    riskLevel = 'MEDIUM';
  }

  return { finalScore: score, riskLevel };
}
