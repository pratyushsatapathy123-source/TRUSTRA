/**
 * Input sanitization and defensive prompt injection detection.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|directions)/i,
  /forget\s+(you\s+are|your\s+role|instructions)/i,
  /system\s*prompt\s*override/i,
  /you\s+are\s+now\s+(an?\s+)?investment\s+advis/i,
  /give\s+me\s+(a\s+)?stock\s+(tip|recommendation|pick)/i,
  /predict\s+the\s+stock\s+price/i,
  /tell\s+me\s+which\s+stock\s+to\s+buy/i,
];

export interface CleanedContent {
  cleanedText: string;
  hasInjectionRisk: boolean;
  isAdvisoryRequest: boolean;
}

export function cleanAndNormalizeInput(raw: string, maxLength = 5000): CleanedContent {
  if (!raw || typeof raw !== 'string') {
    return { cleanedText: '', hasInjectionRisk: false, isAdvisoryRequest: false };
  }

  // Strip non-printable control characters except standard newlines and tabs
  let normalized = raw.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');

  // Normalize excessive repeated spaces and line breaks
  normalized = normalized.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // Enforce reasonable length
  if (normalized.length > maxLength) {
    normalized = normalized.slice(0, maxLength);
  }

  let hasInjectionRisk = false;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      hasInjectionRisk = true;
      break;
    }
  }

  // Check if user is asking for investment advice rather than asking to verify a message
  const isAdvisoryRequest = /(which\s+stock\s+should\s+i\s+buy|give\s+me\s+stock\s+tips|recommend\s+a\s+mutual\s+fund|will\s+[a-z0-9]+\s+go\s+up|crypto\s+price\s+prediction)/i.test(normalized);

  return {
    cleanedText: normalized,
    hasInjectionRisk,
    isAdvisoryRequest,
  };
}
