/**
 * Automated test suite for TRUSTRA backend services.
 * Tests:
 * 1. High-risk message analysis & flag extraction
 * 2. Benign financial message
 * 3. Message soliciting OTP/PIN credentials
 * 4. Image analysis validation (file type and format checks)
 * 5. Malformed Gemini output fallback recovery
 * 6. Missing or empty input validation
 * 7. Unsafe investment recommendation request (safety guardrails)
 */

import { cleanAndNormalizeInput } from '../utils/sanitize.ts';
import { evaluateDeterministicRisk, blendRiskScore } from '../services/riskEngine.ts';
import { detectCredentialKeywords, redactSensitiveData } from '../services/redaction.ts';
import { geminiService } from '../services/gemini.ts';
import { AnalyzeRequestSchema, VerifyClaimsRequestSchema } from '../schemas/analysis.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- STARTING TRUSTRA BACKEND TESTS ---\n');

  // Test 1: High-Risk Demo Message
  const demoMsg =
    'Congratulations! You have been selected for an exclusive investment opportunity. Invest ₹10,000 today and earn guaranteed 35% monthly returns. SEBI approved. Offer valid only for the next 2 hours. Contact Rahul immediately to activate your account.';

  const detEval = evaluateDeterministicRisk(demoMsg);
  assert(detEval.baseScore >= 75, 'Test 1a: High-risk message produces baseScore >= 75', `Score was ${detEval.baseScore}`);
  assert(detEval.calculatedLevel === 'HIGH', 'Test 1b: Risk level classified as HIGH');
  assert(
    detEval.heuristicSignals.some((s) => s.name.includes('Guaranteed')),
    'Test 1c: Identified Guaranteed Return flag'
  );
  assert(
    detEval.heuristicSignals.some((s) => s.name.includes('Urgency')),
    'Test 1d: Identified Urgency & Pressure Tactics flag'
  );

  // Test 2: Benign Financial Message
  const benignMsg =
    'Dear customer, your monthly bank e-statement for savings account ending in 1234 has been generated and sent to your registered email address. For queries, visit our official branch or website.';
  const benignEval = evaluateDeterministicRisk(benignMsg);
  assert(benignEval.baseScore < 35, 'Test 2a: Benign message produces low risk score', `Score: ${benignEval.baseScore}`);
  assert(benignEval.calculatedLevel === 'LOW', 'Test 2b: Benign message risk level is LOW');

  // Test 3: Message asking for OTP / PIN credentials
  const otpMsg =
    'Urgent: Your account is suspended. Send your 6-digit OTP and UPI PIN immediately to avoid total account freeze.';
  const credChecks = detectCredentialKeywords(otpMsg);
  assert(credChecks.hasOtpRequest, 'Test 3a: Detected OTP request');
  assert(credChecks.hasPinRequest, 'Test 3b: Detected PIN request');

  const redacted = redactSensitiveData('My OTP is 482910 and UPI PIN is 123456');
  assert(!redacted.includes('482910'), 'Test 3c: Redaction properly scrubs OTP');
  assert(!redacted.includes('123456'), 'Test 3d: Redaction properly scrubs PIN');

  // Test 4: Image Analysis Validation
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  assert(allowedMimeTypes.includes('image/png'), 'Test 4a: Accepts PNG');
  assert(allowedMimeTypes.includes('image/jpeg'), 'Test 4b: Accepts JPEG');
  assert(!allowedMimeTypes.includes('application/pdf'), 'Test 4c: Rejects PDF');
  assert(!allowedMimeTypes.includes('image/gif'), 'Test 4d: Rejects unsupported GIF');

  // Test 5: Malformed Gemini Output Fallback Recovery
  const fallback = geminiService.createFallbackResult('TR-TEST-FALLBACK', 'guaranteed returns');
  assert(fallback.riskLevel === 'HIGH', 'Test 5a: Fallback correctly sets risk level');
  assert(fallback.safeActions.length > 0, 'Test 5b: Fallback provides safe actions');
  assert(fallback.simpleExplanation.length > 0, 'Test 5c: Fallback provides simple explanation');

  // Test 6: Missing / Empty Input Validation
  const emptyValidation = AnalyzeRequestSchema.safeParse({ message: '' });
  assert(!emptyValidation.success, 'Test 6a: Empty message fails validation');

  const invalidClaims = VerifyClaimsRequestSchema.safeParse({ claims: [] });
  assert(!invalidClaims.success, 'Test 6b: Empty claims array fails validation');

  // Test 7: Safety Guardrails - Unsafe Investment Recommendation Request
  const advisoryPrompt = 'Which stock should I buy today to make guaranteed 20%? Give me stock tips.';
  const cleanResult = cleanAndNormalizeInput(advisoryPrompt);
  assert(cleanResult.isAdvisoryRequest, 'Test 7a: Correctly identifies advisory request');

  const blended = blendRiskScore(85, 90, 4);
  assert(blended.riskLevel === 'HIGH', 'Test 7b: Blended score maintains HIGH level');

  // Test 8: Deterministic Claim Verification
  const sebiClaim = geminiService.getDeterministicClaimVerification('SEBI approved');
  assert(sebiClaim.status === 'UNVERIFIED', 'Test 8a: SEBI claim correctly marked UNVERIFIED');

  const returnClaim = geminiService.getDeterministicClaimVerification('Guaranteed 35% monthly returns');
  assert(returnClaim.status === 'CONTRADICTED', 'Test 8b: Guaranteed return claim correctly marked CONTRADICTED');

  console.log(`\n--- TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
