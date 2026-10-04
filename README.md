# TRUSTRA — AI Financial Safety Assistant
**Tagline: VERIFY BEFORE YOU TRUST.**

TRUSTRA helps users understand suspicious financial messages, investment claims, and potentially fraudulent communications before they send money or share sensitive credentials.

---

## 1. How the Backend Works

The TRUSTRA backend operates as a multi-stage safety pipeline:

1. **Stage 1 — Content Cleaning & Prompt Defense**: Normalizes input, strips control characters, detects prompt injection attempts, and enforces strict non-advisory safety guardrails.
2. **Stage 2 — Signal Detection**: Identifies 16 critical financial safety indicators (guaranteed returns, artificial scarcity, unverified regulatory seals, credential harvesting, etc.).
3. **Stage 3 — Claim Extraction**: Extracts discrete financial and regulatory claims.
4. **Stage 4 — Risk Scoring Engine**: Calculates an objective 0–100 Safety Risk Score combining deterministic heuristic rules and Gemini contextual reasoning.
5. **Stage 5 — Confidence Assessment**: Computes confidence based on evidence clarity.
6. **Stage 6 — Plain-Language & Vernacular Explanations**: Produces clear, non-technical explanations in English, Hindi (हिंदी), and Odia (ଓଡ଼ିଆ).

---

## 2. API Endpoints

- `POST /api/analyze`: Analyzes text messages and returns risk evaluation, signals, claims, and safe actions.
- `POST /api/analyze-image`: Analyzes screenshots using Gemini multimodal vision.
- `POST /api/verify-claims`: Performs factual cross-referencing with Google Search grounding.
- `POST /api/translate`: Translates safety explanations into Hindi or Odia while preserving cautions.
- `GET /api/health`: Confirms service health and configuration status.

---

## 3. How Firestore is Used

- Minimal, privacy-first persistence using `firebase-admin`.
- Collections: `analyses`, `verification_results`, `sessions`.
- **Privacy Rule**: Raw user messages and raw uploaded screenshots are **NEVER stored** permanently. Only calculated risk scores, flags, and safe action IDs are recorded.
- If Firestore credentials are not configured, the system gracefully falls back to volatile memory without crashing.

---

## 4. How Gemini is Used

- Uses the official `@google/genai` TypeScript SDK server-side (`gemini-3.8-flash`).
- API keys are handled exclusively via server-side environment variables (`GEMINI_API_KEY`) and are never exposed to the browser.
- Uses `responseSchema` for guaranteed structured JSON output.
- Uses Google Search grounding (`tools: [{ googleSearch: {} }]`) for factual claim verification.
- Enforces strict safety guardrails: refuses stock tips, buy/sell predictions, or financial promotions.

---

## 5. How to Test the Demo

1. Open the TRUSTRA interface.
2. Click **"Use demo message"** to load the representative high-risk message:
   > *"Congratulations! You have been selected for an exclusive investment opportunity. Invest ₹10,000 today and earn guaranteed 35% monthly returns. SEBI approved. Offer valid only for the next 2 hours. Contact Rahul immediately to activate your account."*
3. Click **"Check this message"**.
4. The server runs the live Gemini analysis and displays Screen 3 (Risk Assessment: High Risk ~91/100).
5. Click **"View claim verification"** to run factual cross-referencing against regulatory databases (Screen 4).
6. Click **"Continue to safety guidance"** to inspect protective next steps and shareable dossiers (Screen 5).

To run the automated test suite:
```bash
npm test
```


## 6. How to Deploy & Run

Development:
```bash
npm run dev
```

Build & Production:
```bash
npm run build
npm start
```
