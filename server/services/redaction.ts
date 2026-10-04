/**
 * Redaction utility to detect and scrub sensitive financial and personal credentials
 * before persistence, indexing, or logging.
 */

const SENSITIVE_PATTERNS = [
  // 16-digit credit/debit card numbers with optional dashes or spaces
  { regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: '[REDACTED_CARD]' },
  
  // 3-4 digit CVV/CVC when preceded by label
  { regex: /\b(?:cvv|cvc|security\s*code)[\s:=]+([0-9]{3,4})\b/gi, replacement: '$1: [REDACTED_CVV]' },

  // OTP / Verification codes
  { regex: /\b(?:otp|one\s*time\s*password|verification\s*code)\s*(?:is|:|:=|=|\-)?\s*([0-9]{4,8})\b/gi, replacement: 'OTP: [REDACTED_OTP]' },
  { regex: /\b([0-9]{4,8})\s+(?:is\s+your\s+(?:otp|verification\s+code))\b/gi, replacement: '[REDACTED_OTP] is your code' },

  // UPI PIN / MPIN / ATM PIN
  { regex: /\b(?:upi\s*pin|mpin|atm\s*pin|netbanking\s*pin|pin)\s*(?:is|:|:=|=|\-)?\s*([0-9]{4,6})\b/gi, replacement: 'PIN: [REDACTED_PIN]' },

  // Passwords
  { regex: /\b(?:password|passwd|pwd)[\s:=]+(\S+)/gi, replacement: 'password: [REDACTED_PASSWORD]' },

  // Indian Bank IFSC code: 4 letters, 0, 6 alphanumeric
  { regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replacement: '[REDACTED_IFSC]' },

  // Bank account numbers (9 to 18 digits preceded by account/a/c)
  { regex: /\b(?:account\s*(?:no|number)?|a\/c)[\s:=#]+([0-9]{9,18})\b/gi, replacement: 'A/C: [REDACTED_ACCOUNT]' },

  // Aadhaar numbers (12 digits, often 4 4 4)
  { regex: /\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b/g, replacement: '[REDACTED_AADHAAR]' },

  // PAN card number (5 letters, 4 digits, 1 letter)
  { regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, replacement: '[REDACTED_PAN]' },
];

/**
 * Redacts known sensitive credential formats from a text string.
 */
export function redactSensitiveData(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let result = text;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * Checks whether text contains explicit requests or disclosures of credentials.
 */
export function detectCredentialKeywords(text: string): {
  hasOtpRequest: boolean;
  hasPinRequest: boolean;
  hasPasswordRequest: boolean;
} {
  const lower = text.toLowerCase();
  return {
    hasOtpRequest: /\b(otp|one\s*time\s*password|verification\s*code)\b/i.test(lower),
    hasPinRequest: /\b(upi\s*pin|mpin|atm\s*pin|pin\s*number)\b/i.test(lower),
    hasPasswordRequest: /\b(password|passwd|login\s*credentials|netbanking\s*password)\b/i.test(lower),
  };
}
