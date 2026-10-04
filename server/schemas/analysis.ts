import { z } from 'zod';

export const SignalSchema = z.object({
  name: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  explanation: z.string().min(1),
});

export const ClaimSchema = z.object({
  claim: z.string().min(1),
  type: z.string().default('financial'),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH', 'low', 'medium', 'high']).transform((val) => val.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH'),
  riskReason: z.string().min(1),
});

export const SafeActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  icon: z.string().optional().default('shield'),
});

export const AnalysisResultSchema = z.object({
  analysisId: z.string().min(1),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
  riskScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  signals: z.array(SignalSchema).default([]),
  claims: z.array(ClaimSchema).default([]),
  evidenceStatus: z.enum(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'INSUFFICIENT_EVIDENCE']),
  simpleExplanation: z.string().min(1),
  safeActions: z.array(z.union([SafeActionSchema, z.string()])).default([]),
  disclaimer: z.string().min(1),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type SafeAction = z.infer<typeof SafeActionSchema>;

export const AnalyzeRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message exceeds maximum length'),
  language: z.enum(['en', 'hi', 'or']).default('en'),
});

export const VerifyClaimsRequestSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string().min(1),
      importance: z.enum(['low', 'medium', 'high', 'LOW', 'MEDIUM', 'HIGH']).optional().default('high'),
    })
  ).min(1, 'At least one claim is required'),
  context: z.string().optional().default(''),
});

export const ClaimVerificationResultSchema = z.object({
  claim: z.string(),
  status: z.enum(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE']),
  explanation: z.string(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
    })
  ).default([]),
});

export const VerifyClaimsResponseSchema = z.object({
  results: z.array(ClaimVerificationResultSchema),
});

export const TranslateRequestSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  targetLanguage: z.enum(['en', 'hi', 'or']),
});
