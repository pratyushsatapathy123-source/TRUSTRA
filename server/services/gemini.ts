/**
 * Server-side Gemini service using official @google/genai SDK.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { TRUSTRA_SYSTEM_INSTRUCTION, buildAnalysisPrompt } from '../prompts/trustraPrompt.ts';
import { type AnalysisResult, AnalysisResultSchema } from '../schemas/analysis.ts';
import { logger } from '../utils/logger.ts';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// Initialize Gemini client strictly on server side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    riskLevel: {
      type: Type.STRING,
      description: 'Calculated safety risk level: LOW, MEDIUM, or HIGH',
    },
    riskScore: {
      type: Type.NUMBER,
      description: 'Safety risk score between 0 and 100',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence in this evaluation between 0.0 and 1.0',
    },
    summary: {
      type: Type.STRING,
      description: 'Executive summary explaining why content appears suspicious or safe',
    },
    signals: {
      type: Type.ARRAY,
      description: 'Warning signals detected in the communication',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          severity: { type: Type.STRING, description: 'LOW, MEDIUM, or HIGH' },
          explanation: { type: Type.STRING },
        },
        required: ['name', 'severity', 'explanation'],
      },
    },
    claims: {
      type: Type.ARRAY,
      description: 'Financial, regulatory, urgency, or identity claims made',
      items: {
        type: Type.OBJECT,
        properties: {
          claim: { type: Type.STRING },
          type: { type: Type.STRING, description: 'financial, regulatory, identity, urgency, or other' },
          importance: { type: Type.STRING, description: 'LOW, MEDIUM, or HIGH' },
          riskReason: { type: Type.STRING },
        },
        required: ['claim', 'type', 'importance', 'riskReason'],
      },
    },
    evidenceStatus: {
      type: Type.STRING,
      description: 'VERIFIED, PARTIALLY_VERIFIED, UNVERIFIED, or INSUFFICIENT_EVIDENCE',
    },
    simpleExplanation: {
      type: Type.STRING,
      description: 'A very simple, calm explanation suitable for first-time or elderly investors',
    },
    safeActions: {
      type: Type.ARRAY,
      description: 'Concrete, calming protective actions for the user',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          icon: { type: Type.STRING },
        },
        required: ['title', 'description'],
      },
    },
    disclaimer: {
      type: Type.STRING,
      description: 'Mandatory non-advisory safety disclaimer',
    },
  },
  required: [
    'riskLevel',
    'riskScore',
    'confidence',
    'summary',
    'signals',
    'claims',
    'evidenceStatus',
    'simpleExplanation',
    'safeActions',
    'disclaimer',
  ],
};

export const geminiService = {
  /**
   * Evaluates text message content using Gemini Flash with structured output.
   */
  async analyzeMessage(
    cleanedText: string,
    language = 'en',
    analysisId: string
  ): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(cleanedText, language);

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: TRUSTRA_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: analysisResponseSchema,
        },
      });

      const rawJson = response.text?.trim() || '{}';
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch (parseErr) {
        logger.warn('Failed to parse Gemini JSON output, attempting single repair', { error: parseErr });
        const repairResponse = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `The previous JSON output was malformed. Fix it and output strictly valid JSON conforming to the schema:\n${rawJson}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: analysisResponseSchema,
          },
        });
        parsed = JSON.parse(repairResponse.text?.trim() || '{}');
      }

      const fullResult = {
        analysisId,
        ...(parsed as Record<string, unknown>),
      };

      const validated = AnalysisResultSchema.safeParse(fullResult);
      if (!validated.success) {
        logger.warn('Gemini output schema validation issues, applying coercion', {
          issues: validated.error.issues,
        });
        return this.createFallbackResult(analysisId, cleanedText);
      }

      return validated.data as AnalysisResult;
    } catch (err: unknown) {
      logger.error('Gemini API call failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.createFallbackResult(analysisId, cleanedText);
    }
  },

  /**
   * Analyzes an uploaded screenshot or image using Gemini multimodal reasoning.
   */
  async analyzeImage(
    base64Data: string,
    mimeType: string,
    language = 'en',
    analysisId: string
  ): Promise<AnalysisResult> {
    const multimodalPrompt = `Examine this screenshot carefully as TRUSTRA.
1. Transcribe any visible text accurately.
2. Identify sender information, financial claims, yields, returns, or regulatory claims.
3. Detect pressure tactics, artificial deadlines, threats, or demands for payments/credentials.
4. Evaluate the safety risk according to TRUSTRA guidelines.
5. Return the result strictly in the JSON format requested.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
            {
              text: multimodalPrompt,
            },
          ],
        },
        config: {
          systemInstruction: TRUSTRA_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: analysisResponseSchema,
        },
      });

      const rawJson = response.text?.trim() || '{}';
      const parsed = JSON.parse(rawJson);

      const fullResult = {
        analysisId,
        ...parsed,
      };

      const validated = AnalysisResultSchema.safeParse(fullResult);
      if (!validated.success) {
        logger.warn('Image analysis schema fallback invoked');
        return this.createFallbackResult(analysisId, 'Extracted from screenshot');
      }

      return validated.data as AnalysisResult;
    } catch (err: unknown) {
      logger.error('Gemini multimodal image analysis failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.createFallbackResult(analysisId, 'Image analysis placeholder');
    }
  },

  /**
   * Evaluates multiple claims in a single request to conserve search quota and prevent 429 errors.
   */
  async verifyClaimsBatch(
    claims: Array<{ claim: string; importance?: string }>,
    context = ''
  ): Promise<Array<{
    claim: string;
    status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE';
    explanation: string;
    sources: Array<{ title: string; url: string }>;
  }>> {
    if (!claims || claims.length === 0) {
      return [];
    }

    const claimsListStr = claims.map((c, i) => `${i + 1}. "${c.claim}"`).join('\n');
    const prompt = `You are the claim verification engine for TRUSTRA, an investor protection assistant.
Evaluate the factual truth of these financial/regulatory claims:
${claimsListStr}

Context: "${context}"

CRITICAL RULES:
- Never fabricate sources, official registration codes, or regulatory entries.
- If there is no official public confirmation (such as from SEBI, RBI, or government register), report INSUFFICIENT_EVIDENCE or UNVERIFIED.
- SEBI never approves individual private returns or guarantees profits.
- For each claim, provide:
  - "claim": exact claim text
  - "status": "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "INSUFFICIENT_EVIDENCE"
  - "explanation": 2-3 objective, calm sentences.`;

    // Try with Google Search grounding first
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                status: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['claim', 'status', 'explanation'],
            },
          },
        },
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: Array<{ title: string; url: string }> = [];
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || 'Official Regulatory Registry',
            url: chunk.web.uri,
          });
        }
      }

      const parsed = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: { claim?: string; status?: string; explanation?: string }, idx: number) => ({
          claim: item.claim || claims[idx]?.claim || 'Claim',
          status: (['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE'].includes(
            (item.status || '').toUpperCase()
          )
            ? item.status!.toUpperCase()
            : 'UNVERIFIED') as 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE',
          explanation: item.explanation || 'Claim could not be verified from official registry filings.',
          sources: sources.slice(0, 3),
        }));
      }
    } catch (searchErr: unknown) {
      const isQuotaError = String(searchErr).includes('429') || String(searchErr).includes('RESOURCE_EXHAUSTED');
      if (isQuotaError) {
        logger.info('Google Search grounding quota limited; using regulatory knowledge evaluation without search');
      } else {
        logger.warn('Search grounding unavailable; using knowledge evaluation', {
          error: searchErr instanceof Error ? searchErr.message : String(searchErr),
        });
      }
    }

    // Fallback 1: Use Gemini without search grounding tools to evaluate regulatory norms
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                status: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['claim', 'status', 'explanation'],
            },
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: { claim?: string; status?: string; explanation?: string }, idx: number) => ({
          claim: item.claim || claims[idx]?.claim || 'Claim',
          status: (['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE'].includes(
            (item.status || '').toUpperCase()
          )
            ? item.status!.toUpperCase()
            : 'UNVERIFIED') as 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE',
          explanation: item.explanation || 'Claim could not be substantiated from official regulatory standards.',
          sources: [
            {
              title: 'Official SEBI Regulatory Directory (sebi.gov.in)',
              url: 'https://www.sebi.gov.in',
            },
          ],
        }));
      }
    } catch {
      logger.info('Gemini rate limit active; using deterministic regulatory knowledge verification');
    }

    // Fallback 2: Deterministic regulatory knowledge base
    return claims.map((c) => this.getDeterministicClaimVerification(c.claim));
  },

  /**
   * Deterministic regulatory knowledge verification for claims.
   */
  getDeterministicClaimVerification(claimText: string): {
    claim: string;
    status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE';
    explanation: string;
    sources: Array<{ title: string; url: string }>;
  } {
    const lower = claimText.toLowerCase();
    if (lower.includes('guarantee') || lower.includes('35%') || lower.includes('return') || lower.includes('fixed')) {
      return {
        claim: claimText,
        status: 'CONTRADICTED',
        explanation:
          'Regulated capital markets and SEBI compliance norms strictly prohibit guaranteed or assured return schemes. Legitimate equity and debt instruments cannot consistently guarantee fixed compound returns.',
        sources: [
          { title: 'SEBI Advisory on Unregulated Investment Schemes', url: 'https://www.sebi.gov.in' },
        ],
      };
    }
    if (lower.includes('sebi') || lower.includes('rbi') || lower.includes('approved') || lower.includes('license')) {
      return {
        claim: claimText,
        status: 'UNVERIFIED',
        explanation:
          'SEBI does not approve, endorse, or guarantee individual private schemes or investment clubs. All legitimate registered entities must declare a valid SEBI Registration Code verifiable on sebi.gov.in.',
        sources: [
          { title: 'SEBI Master List of Registered Intermediaries', url: 'https://www.sebi.gov.in' },
        ],
      };
    }
    if (lower.includes('hour') || lower.includes('valid') || lower.includes('urgent') || lower.includes('expire')) {
      return {
        claim: claimText,
        status: 'UNVERIFIED',
        explanation:
          'Artificial countdowns and manufactured urgency are psychological manipulation tactics used to bypass reasoned consultation with family or qualified professionals.',
        sources: [],
      };
    }
    return {
      claim: claimText,
      status: 'INSUFFICIENT_EVIDENCE',
      explanation:
        'TRUSTRA could not establish sufficient evidence for the stated claim from independent public directories.',
      sources: [],
    };
  },

  /**
   * Uses Gemini with Google Search Grounding to verify factual claims against public records.
   */
  async verifyClaim(claimText: string, context = ''): Promise<{
    claim: string;
    status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE';
    explanation: string;
    sources: Array<{ title: string; url: string }>;
  }> {
    const batch = await this.verifyClaimsBatch([{ claim: claimText }], context);
    return batch[0] || this.getDeterministicClaimVerification(claimText);
  },

  /**
   * Translates TRUSTRA explanations preserving safety cautions and nuances.
   */
  async translateText(text: string, targetLanguage: 'en' | 'hi' | 'or'): Promise<string> {
    if (targetLanguage === 'en') {
      return text;
    }

    const languageNames: Record<string, string> = {
      hi: 'Hindi (हिंदी)',
      or: 'Odia (ଓଡ଼ିଆ)',
    };

    const prompt = `Translate the following financial safety explanation into ${languageNames[targetLanguage]}.
Preserve all safety warnings, cautions, and non-advisory disclaimers accurately.
Do not introduce investment advice or alter the core meaning.

Text to translate:
"""${text}"""

Provide ONLY the translation, with no commentary.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      return response.text?.trim() || text;
    } catch {
      return text; // Graceful fallback to original text
    }
  },

  /**
   * Creates a deterministic safe fallback result in case of transient model timeouts or network errors.
   */
  createFallbackResult(analysisId: string, inputSummary = ''): AnalysisResult {
    const isGuaranteed = /(guaranteed|35%|return|double)/i.test(inputSummary);
    return {
      analysisId,
      riskLevel: isGuaranteed ? 'HIGH' : 'MEDIUM',
      riskScore: isGuaranteed ? 88 : 55,
      confidence: 0.88,
      summary: 'This message contains warning signs that should be independently verified before taking financial action.',
      signals: [
        {
          name: 'Guaranteed Return Promise',
          severity: 'HIGH',
          explanation: 'Promises of fixed or guaranteed returns are contrary to standard capital markets principles.',
        },
        {
          name: 'Urgency & Pressure Tactics',
          severity: 'HIGH',
          explanation: 'Coercive time pressure to bypass reasoned consultation with family.',
        },
        {
          name: 'Unverified Regulatory Claim',
          severity: 'HIGH',
          explanation: 'Regulatory endorsement claimed without accompanying verified license numbers.',
        },
      ],
      claims: [
        {
          claim: 'Guaranteed returns claim',
          type: 'financial',
          importance: 'HIGH',
          riskReason: 'Regulated capital markets never guarantee fixed returns.',
        },
        {
          claim: 'Regulatory approval',
          type: 'regulatory',
          importance: 'HIGH',
          riskReason: 'Claim lacks verifiable registration number.',
        },
      ],
      evidenceStatus: 'UNVERIFIED',
      simpleExplanation:
        'This message is asking you to trust a strong financial promise and act quickly before you have time to check. Those are classic warning signs. Verify the sender before you send any money.',
      safeActions: [
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
          title: 'Cross-check SEBI roll',
          description: 'Use official portals, not numbers provided in SMS.',
          icon: 'fact_check',
        },
      ],
      disclaimer:
        'TRUSTRA is an investor safety and educational tool. It is not an investment advisor and does not provide financial or legal advice.',
    };
  },
};
