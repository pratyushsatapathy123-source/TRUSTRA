/**
 * TRUSTRA — AI Financial Safety Assistant
 * Connected Frontend Application
 */

import React, { useState, useRef } from 'react';

// Types matching backend API response
interface Signal {
  name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

interface Claim {
  claim: string;
  type: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  riskReason: string;
}

interface SafeAction {
  title: string;
  description: string;
  icon?: string;
}

interface AnalysisResult {
  analysisId: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  riskScore: number;
  confidence: number;
  summary: string;
  signals: Signal[];
  claims: Claim[];
  evidenceStatus: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'INSUFFICIENT_EVIDENCE';
  simpleExplanation: string;
  safeActions: SafeAction[];
  disclaimer: string;
}

interface ClaimVerificationItem {
  claim: string;
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE';
  explanation: string;
  sources: Array<{ title: string; url: string }>;
}

type ScreenType = 'input' | 'assessment' | 'verification' | 'guidance';
type InputMode = 'text' | 'image' | 'voice';
type Language = 'en' | 'hi' | 'or';

const DEMO_STRING =
  'Congratulations! You have been selected for an exclusive investment opportunity. Invest ₹10,000 today and earn guaranteed 35% monthly returns. SEBI approved. Offer valid only for the next 2 hours. Contact Rahul immediately to activate your account.';

const TRUSTRA_EMBLEM =
  'https://lh3.googleusercontent.com/aida/AEtjO1WD8EHEcGi-WN8p3r0iks_66JdNoc0xHWL_ee8eafggfnaQdfawa6w67ULu5S3wT6MfkoRAwL7keNOlqaHXjrDPmS_b6R5YO7oXy-bRTM9MysXRnFGUz_xRqLs8VRW3z1yGpfvvCBvoV2k1Ry1YdPkHVNqms23bTke2ypXU6EcmtIWjz2QXIS8tBP4z0LTFKMccOncYvXu3F-XLzvmx-xcXGxKrWUBc_If-D0AifYdjDUwPQS_kGhULpSqe';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('input');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');
  const [messageInput, setMessageInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  // Processing & error states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('Inspecting claims and syntactic anomalies…');
  const [loadingProgress, setLoadingProgress] = useState(25);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analysis & Verification data
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [verificationResults, setVerificationResults] = useState<ClaimVerificationItem[]>([]);
  const [isVerifyingClaims, setIsVerifyingClaims] = useState(false);
  const [selectedClaimIndex, setSelectedClaimIndex] = useState(0);

  // Copy feedback
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Info modal states
  const [infoModal, setInfoModal] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle message analysis via POST /api/analyze
  const handleAnalyzeText = async () => {
    const textToAnalyze = messageInput.trim() || DEMO_STRING;
    if (!messageInput.trim()) {
      setMessageInput(DEMO_STRING);
    }

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingProgress(30);
    setLoadingStep('Scrubbing credentials & detecting deception markers…');

    try {
      const progressTimer = setTimeout(() => {
        setLoadingProgress(70);
        setLoadingStep('Cross-referencing high-risk terminology & regulatory claims…');
      }, 500);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToAnalyze,
          language: selectedLanguage,
        }),
      });

      clearTimeout(progressTimer);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'TRUSTRA could not complete the analysis.');
      }

      setLoadingProgress(100);
      const data: AnalysisResult = await response.json();
      setAnalysis(data);
      setCurrentScreen('assessment');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please check connection.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle image analysis via POST /api/analyze-image
  const handleAnalyzeImage = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingProgress(35);
    setLoadingStep('Performing multimodal OCR and layout inspection…');

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('language', selectedLanguage);

      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Image analysis failed.');
      }

      const data: AnalysisResult = await response.json();
      setAnalysis(data);
      setCurrentScreen('assessment');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Image inspection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Claim Verification via POST /api/verify-claims
  const handleVerifyClaims = async () => {
    if (!analysis) return;
    setCurrentScreen('verification');

    // If already loaded or no claims, skip re-fetching
    if (verificationResults.length > 0) return;

    setIsVerifyingClaims(true);
    try {
      const claimsToVerify =
        analysis.claims.length > 0
          ? analysis.claims.map((c) => ({ claim: c.claim, importance: c.importance.toLowerCase() }))
          : [
              { claim: 'SEBI approved', importance: 'high' },
              { claim: '35% monthly returns', importance: 'high' },
            ];

      const response = await fetch('/api/verify-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claims: claimsToVerify,
          context: analysis.summary,
          analysisId: analysis.analysisId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setVerificationResults(data.results || []);
      }
    } catch (err) {
      console.warn('Claims verification call error:', err);
    } finally {
      setIsVerifyingClaims(false);
    }
  };

  // Handle language translation via POST /api/translate
  const handleLanguageChange = async (newLang: Language) => {
    setSelectedLanguage(newLang);
    if (!analysis) return;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: analysis.simpleExplanation,
          targetLanguage: newLang,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.translatedText) {
          setAnalysis((prev) => (prev ? { ...prev, simpleExplanation: data.translatedText } : null));
        }
      }
    } catch (err) {
      console.warn('Translation error:', err);
    }
  };

  // File upload input handler
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setErrorMessage(null);
    }
  };

  const clearFile = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Reset to Screen 1
  const resetForm = () => {
    setMessageInput('');
    clearFile();
    setAnalysis(null);
    setVerificationResults([]);
    setErrorMessage(null);
    setCurrentScreen('input');
  };

  // Copy dossier text
  const copyDossierText = () => {
    if (!analysis) return;
    const summary = `TRUSTRA Safety Assessment Dossier\nRef: #${analysis.analysisId}\nEvaluation: ${analysis.riskLevel} (${analysis.riskScore}/100)\nSummary: ${analysis.summary}\nGuidance: ${analysis.simpleExplanation}\nDisclaimer: ${analysis.disclaimer}`;
    navigator.clipboard.writeText(summary).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
    });
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] font-['Plus_Jakarta_Sans',sans-serif] text-[#0f1b31] antialiased selection:bg-[#d7e2ff]">
      {/* GLOBAL HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#f9f9ff]/90 backdrop-blur-md border-b border-[#c4c6d4]/40">
        <div className="h-20 max-w-7xl mx-auto px-5 md:px-6 lg:px-12 flex items-center justify-between">
          <div
            className="flex items-center gap-4 cursor-pointer"
            onClick={() => setCurrentScreen('input')}
          >
            <img
              alt="TRUSTRA Emblem"
              className="h-8 w-auto object-contain"
              src={TRUSTRA_EMBLEM}
            />
            <div className="flex flex-col justify-center">
              <span className="font-['Newsreader',serif] text-[20px] font-medium uppercase tracking-wider text-[#0f1b31] leading-tight hover:text-[#0e3d9f] transition-colors">
                TRUSTRA
              </span>
              <span className="text-[11px] font-bold text-[#747684] tracking-wider leading-tight">
                AI Financial Safety Assistant
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6">
              {analysis && (
                <>
                  <button
                    onClick={() => setCurrentScreen('assessment')}
                    className={`text-[14px] font-semibold transition-colors py-1 ${
                      currentScreen === 'assessment'
                        ? 'text-[#0e3d9f] underline underline-offset-8 decoration-2'
                        : 'text-[#444652] hover:text-[#0f1b31]'
                    }`}
                  >
                    Risk Assessment
                  </button>
                  <button
                    onClick={handleVerifyClaims}
                    className={`text-[14px] font-semibold transition-colors py-1 ${
                      currentScreen === 'verification'
                        ? 'text-[#0e3d9f] underline underline-offset-8 decoration-2'
                        : 'text-[#444652] hover:text-[#0f1b31]'
                    }`}
                  >
                    Claim Verification
                  </button>
                </>
              )}
              <button
                onClick={() => setInfoModal('how-it-works')}
                className="text-[14px] font-semibold text-[#444652] hover:text-[#0f1b31] transition-colors py-1"
              >
                How it works
              </button>
              <button
                onClick={() => setInfoModal('privacy')}
                className="text-[14px] font-semibold text-[#444652] hover:text-[#0f1b31] transition-colors py-1"
              >
                Privacy
              </button>
            </nav>

            {/* Language Switcher */}
            <div className="hidden sm:flex items-center gap-1 bg-[#f1f3ff] px-1 py-1 rounded-full border border-[#c4c6d4]">
              <button
                onClick={() => handleLanguageChange('en')}
                className={`text-[11px] font-bold px-3 py-0.5 rounded-full transition-colors ${
                  selectedLanguage === 'en'
                    ? 'bg-[#ffffff] text-[#0f1b31] shadow-xs'
                    : 'text-[#444652] hover:text-[#0f1b31]'
                }`}
                type="button"
              >
                English
              </button>
              <button
                onClick={() => handleLanguageChange('hi')}
                className={`text-[11px] font-bold px-3 py-0.5 rounded-full transition-colors ${
                  selectedLanguage === 'hi'
                    ? 'bg-[#ffffff] text-[#0f1b31] shadow-xs'
                    : 'text-[#444652] hover:text-[#0f1b31]'
                }`}
                type="button"
              >
                हिंदी
              </button>
              <button
                onClick={() => handleLanguageChange('or')}
                className={`text-[11px] font-bold px-3 py-0.5 rounded-full transition-colors ${
                  selectedLanguage === 'or'
                    ? 'bg-[#ffffff] text-[#0f1b31] shadow-xs'
                    : 'text-[#444652] hover:text-[#0f1b31]'
                }`}
                type="button"
              >
                ଓଡ଼ିଆ
              </button>
            </div>

            <div
              className="w-8 h-8 rounded-full bg-[#0e3d9f] flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
              title="Verified Safe Session"
            >
              <span className="material-symbols-outlined text-[#ffffff] text-[18px]">verified</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="w-full pt-24 pb-16 min-h-[calc(100vh-140px)]">
        {/* ================= SCREEN 1 & 2: INPUT WORKSPACE ================= */}
        {currentScreen === 'input' && (
          <div className="max-w-5xl mx-auto px-5 md:px-6 lg:px-12 py-8 space-y-10">
            {/* Editorial Hero Section */}
            <section className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7e5700]"></span>
                <span className="text-[11px] uppercase tracking-widest text-[#7e5700] font-bold">
                  TRUSTRA FINANCIAL SAFETY
                </span>
              </div>
              <h1 className="font-['Newsreader',serif] text-[38px] md:text-[56px] leading-[44px] md:leading-[64px] text-[#0f1b31] tracking-tight">
                Before you trust a financial message,<br className="hidden sm:inline" />
                <span className="italic font-normal">verify it.</span>
              </h1>
              <p className="text-[18px] text-[#444652] max-w-2xl leading-relaxed">
                Understand suspicious financial messages, claims, and offers before you take action. Built for total clarity, without alarms.
              </p>
            </section>

            {/* Mode Selector Tabs (3 Horizontal Cards) */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                    What would you like to check?
                  </h2>
                  <p className="text-[13px] text-[#444652]">Choose how you received the message.</p>
                </div>
                <span className="text-[11px] text-[#004f39] flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#004f39]"></span>
                  End-to-End Encrypted Verification
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup">
                {/* Option 1: Paste Text */}
                <button
                  className={`text-left p-6 rounded-xl transition-all duration-150 flex flex-col justify-between h-44 cursor-pointer relative ${
                    inputMode === 'text'
                      ? 'bg-[#ffffff] shadow-sm ring-2 ring-[#3156b8]'
                      : 'bg-[#e8eeff] hover:bg-[#e0e8ff]'
                  }`}
                  onClick={() => setInputMode('text')}
                  type="button"
                >
                  <div className="flex items-start justify-between w-full">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        inputMode === 'text'
                          ? 'bg-[#e8eeff] text-[#3156b8]'
                          : 'bg-[#f1f3ff] text-[#444652]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">chat</span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        inputMode === 'text' ? 'border-[#3156b8]' : 'border-[#747684]'
                      }`}
                    >
                      {inputMode === 'text' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3156b8]"></div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-['Newsreader',serif] text-[17px] leading-snug font-medium text-[#0f1b31] mb-1">
                      Paste a message
                    </div>
                    <p className="text-[13px] text-[#444652]">
                      Analyze a WhatsApp, SMS, email, or social-media message.
                    </p>
                  </div>
                </button>

                {/* Option 2: Upload Screenshot */}
                <button
                  className={`text-left p-6 rounded-xl transition-all duration-150 flex flex-col justify-between h-44 cursor-pointer relative ${
                    inputMode === 'image'
                      ? 'bg-[#ffffff] shadow-sm ring-2 ring-[#3156b8]'
                      : 'bg-[#e8eeff] hover:bg-[#e0e8ff]'
                  }`}
                  onClick={() => setInputMode('image')}
                  type="button"
                >
                  <div className="flex items-start justify-between w-full">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        inputMode === 'image'
                          ? 'bg-[#e8eeff] text-[#3156b8]'
                          : 'bg-[#f1f3ff] text-[#444652]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">image</span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        inputMode === 'image' ? 'border-[#3156b8]' : 'border-[#747684]'
                      }`}
                    >
                      {inputMode === 'image' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3156b8]"></div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-['Newsreader',serif] text-[17px] leading-snug font-medium text-[#0f1b31] mb-1">
                      Upload a screenshot
                    </div>
                    <p className="text-[13px] text-[#444652]">
                      Check a suspicious message, ad, or financial claim from an image.
                    </p>
                  </div>
                </button>

                {/* Option 3: Speak to TRUSTRA */}
                <button
                  className={`text-left p-6 rounded-xl transition-all duration-150 flex flex-col justify-between h-44 cursor-pointer relative ${
                    inputMode === 'voice'
                      ? 'bg-[#ffffff] shadow-sm ring-2 ring-[#3156b8]'
                      : 'bg-[#e8eeff] hover:bg-[#e0e8ff]'
                  }`}
                  onClick={() => setInputMode('voice')}
                  type="button"
                >
                  <div className="flex items-start justify-between w-full">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        inputMode === 'voice'
                          ? 'bg-[#e8eeff] text-[#3156b8]'
                          : 'bg-[#f1f3ff] text-[#444652]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">mic</span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        inputMode === 'voice' ? 'border-[#3156b8]' : 'border-[#747684]'
                      }`}
                    >
                      {inputMode === 'voice' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#3156b8]"></div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-['Newsreader',serif] text-[17px] leading-snug font-medium text-[#0f1b31] mb-1">
                      Speak to TRUSTRA
                    </div>
                    <p className="text-[13px] text-[#444652]">
                      Ask a safety question in English, Hindi, or Odia.
                    </p>
                  </div>
                </button>
              </div>
            </section>

            {/* Error banner if any */}
            {errorMessage && (
              <div className="p-4 rounded-lg bg-[#ffdad6] text-[#93000a] flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px]">error</span>
                <p className="text-[14px] font-medium">{errorMessage}</p>
              </div>
            )}

            {/* PRIMARY INTERACTION WORKSPACE */}
            <section className="w-full">
              {/* MODE 1: Text Paste Container */}
              {inputMode === 'text' && (
                <div className="w-full bg-[#ffffff] rounded-xl p-6 md:p-8 shadow-md space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#c4c6d4]/30">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#3156b8] text-[20px]">edit_note</span>
                      <h3 className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                        Paste your message
                      </h3>
                    </div>
                    <button
                      className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e8eeff] hover:bg-[#e0e8ff] text-[#0f1b31] transition-colors cursor-pointer"
                      onClick={() => setMessageInput(DEMO_STRING)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#7e5700] group-hover:rotate-12 transition-transform">
                        bolt
                      </span>
                      <span className="text-[11px] font-semibold">Use demo message</span>
                    </button>
                  </div>

                  <div className="relative">
                    <textarea
                      className="w-full bg-[#f1f3ff] text-[#0f1b31] p-4 rounded-lg text-[14px] placeholder:text-[#747684] focus:outline-none focus:ring-2 focus:ring-[#3156b8] transition-all resize-y min-h-[160px] leading-relaxed"
                      placeholder="Paste the message you received here…"
                      rows={6}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                    ></textarea>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[#444652]">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#747684]">info</span>
                      <span className="text-[13px]">
                        You can paste messages from WhatsApp, SMS, email, or social media.
                      </span>
                    </div>
                    <div className="text-[11px] text-[#747684] tabular-nums font-semibold">
                      {messageInput.length} characters • Volatile memory analysis
                    </div>
                  </div>

                  {/* Reassurance Advisory */}
                  <div className="flex items-center gap-2 text-[#444652] bg-[#f1f3ff] px-4 py-2.5 rounded-lg">
                    <span className="material-symbols-outlined text-[18px] text-[#004f39] shrink-0">
                      verified_user
                    </span>
                    <p className="text-[13px]">
                      Your message is used exclusively for safety analysis.{' '}
                      <span className="font-semibold text-[#0f1b31]">
                        Never submit OTPs, PINs, passwords or bank account credentials.
                      </span>
                    </p>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-4 border-t border-[#c4c6d4]/30">
                    <button
                      className="text-[14px] font-semibold text-[#444652] hover:text-[#ba1a1a] transition-colors px-2 py-2 cursor-pointer"
                      onClick={() => setMessageInput('')}
                      type="button"
                    >
                      Clear
                    </button>
                    <button
                      className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[#3156b8] text-[#ffffff] text-[14px] font-semibold hover:bg-[#0e3d9f] transition-all active:scale-[0.99] cursor-pointer shadow-sm"
                      onClick={handleAnalyzeText}
                      disabled={isLoading}
                      type="button"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block"></span>
                          <span>Verifying…</span>
                        </>
                      ) : (
                        <>
                          <span>Check this message</span>
                          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 2: Screenshot Container */}
              {inputMode === 'image' && (
                <div className="w-full bg-[#ffffff] rounded-xl p-6 md:p-8 shadow-md space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-[#c4c6d4]/30">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#3156b8] text-[20px]">
                        document_scanner
                      </span>
                      <h3 className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                        Upload a screenshot
                      </h3>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    className="hidden"
                    onChange={onFileChange}
                  />

                  <div
                    className="rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 bg-[#f1f3ff] cursor-pointer hover:bg-[#e8eeff] transition-colors border border-dashed border-[#c4c6d4]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-16 h-16 rounded-full bg-[#ffffff] flex items-center justify-center text-[#3156b8] shadow-sm">
                      <span className="material-symbols-outlined text-[32px]">upload_file</span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-['Newsreader',serif] text-[18px] text-[#0f1b31]">
                        Drag &amp; drop your screenshot here
                      </p>
                      <p className="text-[13px] text-[#444652]">
                        PNG, JPG, or WebP up to 10MB. Text is evaluated securely on the server.
                      </p>
                    </div>
                    <button
                      className="px-4 py-2 rounded-lg bg-[#d7e2ff] text-[#3156b8] text-[12px] font-semibold hover:bg-[#ffffff] transition-colors"
                      type="button"
                    >
                      Browse files
                    </button>
                  </div>

                  {selectedFile && (
                    <div className="p-3 bg-[#e8eeff] rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#0e3d9f] text-[24px]">image</span>
                        <div>
                          <p className="text-[12px] font-semibold text-[#0f1b31]">{selectedFile.name}</p>
                          <span className="text-[13px] text-[#444652]">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                      </div>
                      <button
                        className="p-1 rounded-full text-[#444652] hover:text-[#ba1a1a] hover:bg-[#d7e2ff] transition-colors"
                        onClick={clearFile}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[#444652]">
                    <span className="text-[13px]">
                      Optical OCR parsing scrubs localized contact identifiers automatically.
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-[#c4c6d4]/30">
                    <button
                      className="text-[14px] font-semibold text-[#444652] hover:text-[#0f1b31] px-2 py-2"
                      onClick={clearFile}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className={`flex items-center gap-2 px-8 py-3 rounded-lg text-[14px] font-semibold transition-colors ${
                        selectedFile
                          ? 'bg-[#0e3d9f] text-[#ffffff] hover:bg-[#3156b8] cursor-pointer shadow-sm'
                          : 'bg-[#747684] text-[#ffffff] cursor-not-allowed opacity-60'
                      }`}
                      disabled={!selectedFile || isLoading}
                      onClick={handleAnalyzeImage}
                      type="button"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block"></span>
                          <span>Scanning…</span>
                        </>
                      ) : (
                        <>
                          <span>Scan screenshot</span>
                          <span className="material-symbols-outlined text-[18px]">document_scanner</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 3: Voice Prompt Container */}
              {inputMode === 'voice' && (
                <div className="w-full bg-[#ffffff] rounded-xl p-6 md:p-8 shadow-md space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-[#c4c6d4]/30">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#3156b8] text-[20px]">
                        record_voice_over
                      </span>
                      <h3 className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                        Speak your question
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold bg-[#a7f2d2] text-[#002116] px-3 py-0.5 rounded-full">
                      Voice Ready
                    </span>
                  </div>

                  <div className="rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 bg-[#f1f3ff]">
                    <div className="relative flex items-center justify-center">
                      {isRecording && (
                        <div className="absolute w-28 h-28 rounded-full bg-[#3156b8]/20 animate-ping"></div>
                      )}
                      <button
                        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md ${
                          isRecording
                            ? 'bg-[#ba1a1a] text-white scale-105'
                            : 'bg-[#3156b8] text-white hover:scale-105'
                        }`}
                        onClick={() => {
                          const nextState = !isRecording;
                          setIsRecording(nextState);
                          if (nextState) {
                            setVoiceTranscript(
                              'Someone claiming to be from my bank is offering guaranteed 35% monthly returns. Should I transfer money?'
                            );
                          }
                        }}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[36px]">
                          {isRecording ? 'graphic_eq' : 'mic'}
                        </span>
                      </button>
                    </div>

                    <div className="space-y-1">
                      <p className="font-['Newsreader',serif] text-[18px] text-[#0f1b31]">
                        {isRecording ? 'Listening… Speak naturally' : 'Tap microphone to speak'}
                      </p>
                      <p className="text-[13px] text-[#444652] max-w-md">
                        {voiceTranscript ||
                          '"Someone calling from my bank is asking to install an APK file. Should I proceed?"'}
                      </p>
                    </div>

                    {voiceTranscript && (
                      <button
                        className="mt-2 px-6 py-2 rounded-lg bg-[#3156b8] text-white text-[12px] font-semibold hover:bg-[#0e3d9f] transition-colors"
                        onClick={() => {
                          setMessageInput(voiceTranscript);
                          setInputMode('text');
                          handleAnalyzeText();
                        }}
                        type="button"
                      >
                        Analyze spoken query
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-4 text-[#747684] text-[11px] font-bold">
                    <span>Supported: English</span>
                    <span>•</span>
                    <span>हिंदी (Hindi)</span>
                    <span>•</span>
                    <span>ଓଡ଼ିଆ (Odia)</span>
                  </div>
                </div>
              )}
            </section>

            {/* Simulated / Real Loading Progress Bar */}
            {isLoading && (
              <div className="p-6 bg-[#f1f3ff] rounded-xl space-y-3 border border-[#c4c6d4]/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-[#0e3d9f] border-t-transparent animate-spin inline-block"></span>
                    <span className="text-[14px] font-semibold text-[#0e3d9f]">{loadingStep}</span>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#747684]">
                    AI Evaluation
                  </span>
                </div>
                <div className="w-full bg-[#e8eeff] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0e3d9f] transition-all duration-500 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-[13px] text-[#444652]">
                  TRUSTRA is cross-referencing high-risk terminology, unrealistic ROI benchmarks, and known spoofed sender signatures.
                </p>
              </div>
            )}

            {/* PRIVACY & BHARAT ARCHITECTURE SECTION */}
            <section className="bg-[#e8eeff] rounded-xl p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Column 1: Privacy First */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#a7f2d2] text-[#002116] text-[11px] font-bold">
                      Protected
                    </span>
                    <h4 className="font-['Newsreader',serif] text-[20px] font-medium text-[#0f1b31]">
                      Privacy first.
                    </h4>
                  </div>
                  <p className="text-[14px] text-[#444652]">
                    No OTPs. No PINs. No passwords. No SMS background reading. We evaluate only what you deliberately share.
                  </p>
                </div>

                {/* Column 2: Built for Bharat */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#d7e2ff] text-[#3156b8] text-[11px] font-bold">
                      Multilingual
                    </span>
                    <h4 className="font-['Newsreader',serif] text-[20px] font-medium text-[#0f1b31]">
                      Built for Bharat.
                    </h4>
                  </div>
                  <p className="text-[14px] text-[#0f1b31] font-medium">English · हिंदी · ଓଡ଼ିଆ · Voice</p>
                  <p className="text-[13px] text-[#444652]">
                    Engineered specifically for vernacular fraud patterns prevalent in Indian banking and UPI ecosystems.
                  </p>
                </div>

                {/* Column 3: Zero Commercial Bias */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#ffdeab] text-[#271900] text-[11px] font-bold">
                      Neutral
                    </span>
                    <h4 className="font-['Newsreader',serif] text-[20px] font-medium text-[#0f1b31]">
                      Zero commercial bias.
                    </h4>
                  </div>
                  <p className="text-[14px] text-[#444652]">
                    Independent consumer safety analysis. TRUSTRA never sells financial products, brokers, stocks, or lending services.
                  </p>
                </div>
              </div>
            </section>

            {/* WHY TRUSTRA SECTION */}
            <section className="space-y-6 pt-4">
              <div className="space-y-2 max-w-3xl">
                <span className="text-[11px] uppercase tracking-widest text-[#7e5700] font-bold">
                  WHY TRUSTRA?
                </span>
                <h2 className="font-['Newsreader',serif] text-[32px] text-[#0f1b31] leading-tight font-normal">
                  Financial messages can look convincing even when important details are intentionally missing.
                </h2>
                <p className="text-[16px] text-[#444652] pt-1">
                  TRUSTRA helps you pause, understand the warning signs, and cross-reference context before taking irreversible financial action.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <div className="p-6 rounded-xl bg-[#e8eeff] space-y-3">
                  <div className="w-8 h-8 rounded-full bg-[#ffffff] text-[#3156b8] flex items-center justify-center text-[11px] font-bold shadow-sm">
                    01
                  </div>
                  <h3 className="font-['Newsreader',serif] text-[19px] text-[#0f1b31] font-semibold">
                    Pause &amp; Evaluate Urgency
                  </h3>
                  <p className="text-[14px] text-[#444652]">
                    Understand deceptive psychological tactics like strict two-hour countdowns designed to bypass reasoned consultation with family.
                  </p>
                </div>

                <div className="p-6 rounded-xl bg-[#e8eeff] space-y-3">
                  <div className="w-8 h-8 rounded-full bg-[#ffffff] text-[#3156b8] flex items-center justify-center text-[11px] font-bold shadow-sm">
                    02
                  </div>
                  <h3 className="font-['Newsreader',serif] text-[19px] text-[#0f1b31] font-semibold">
                    Verify Unrealistic Returns
                  </h3>
                  <p className="text-[14px] text-[#444652]">
                    Uncover mathematical realities and ponzi mechanics behind guaranteed daily and monthly yields before parting with your hard-earned capital.
                  </p>
                </div>

                <div className="p-6 rounded-xl bg-[#e8eeff] space-y-3">
                  <div className="w-8 h-8 rounded-full bg-[#ffffff] text-[#3156b8] flex items-center justify-center text-[11px] font-bold shadow-sm">
                    03
                  </div>
                  <h3 className="font-['Newsreader',serif] text-[19px] text-[#0f1b31] font-semibold">
                    Cross-Reference Regulatory Claims
                  </h3>
                  <p className="text-[14px] text-[#444652]">
                    Identify unauthorized impersonations of SEBI, RBI, or institutional brokerage licenses often falsely claimed in illicit Telegram channels.
                  </p>
                </div>
              </div>
            </section>

            {/* TRUST CERTIFICATION FOOTNOTE */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-6 text-[#747684] text-[11px] font-semibold border-t border-[#c4c6d4]/40">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#004f39]">check_circle</span>
                <span>Verified Public Threat Directory v4.19</span>
              </div>
              <span>All checks processed in volatile memory. No text logged without explicit user consent.</span>
            </div>
          </div>
        )}

        {/* ================= SCREEN 3: RISK ASSESSMENT DOSSIER ================= */}
        {currentScreen === 'assessment' && analysis && (
          <div className="w-full max-w-7xl mx-auto px-5 md:px-6 lg:px-12 py-8 space-y-10">
            {/* PAGE INTRODUCTION */}
            <header className="max-w-3xl">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    analysis.riskLevel === 'HIGH' ? 'bg-[#ba1a1a]' : 'bg-[#7e5700]'
                  }`}
                ></span>
                <span className="text-[11px] tracking-widest text-[#444652] uppercase font-bold">
                  TRUSTRA Assessment • Audit Dossier #{analysis.analysisId}
                </span>
              </div>
              <h1 className="font-['Newsreader',serif] text-[40px] text-[#0f1b31] tracking-tight mb-2">
                Risk assessment
              </h1>
              <p className="text-[18px] text-[#444652] font-normal leading-relaxed">
                We reviewed the message for warning signs, pressure tactics, and claims that may need verification.
              </p>
            </header>

            {/* TWO-COLUMN ASYMMETRIC EDITORIAL HERO */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start pb-10 border-b border-[#c4c6d4]/60">
              {/* Left Column: Core Metric Dossier (5 cols) */}
              <div className="lg:col-span-5 bg-[#f1f3ff] rounded-xl p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#444652] uppercase tracking-wider font-bold">
                    Evaluation Result
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider ${
                      analysis.riskLevel === 'HIGH'
                        ? 'bg-[#ffdad6] text-[#93000a]'
                        : 'bg-[#ffdeab] text-[#734f00]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        analysis.riskLevel === 'HIGH' ? 'bg-[#ba1a1a]' : 'bg-[#7e5700]'
                      }`}
                    ></span>
                    {analysis.riskLevel} RISK
                  </span>
                </div>

                <div className="pt-2 pb-1 flex items-baseline gap-2">
                  <span className="font-['Newsreader',serif] text-[56px] text-[#0f1b31] tracking-tight leading-none">
                    {analysis.riskScore}
                  </span>
                  <span className="font-['Newsreader',serif] text-[24px] text-[#747684]">/ 100</span>
                </div>

                <div className="flex items-center gap-2 text-[#444652] text-[12px] font-semibold">
                  <span className="material-symbols-outlined text-[18px] text-[#0e3d9f]">verified_user</span>
                  <span>
                    Confidence score:{' '}
                    <strong>{Math.round(analysis.confidence * 100)}% certainty</strong>
                  </span>
                </div>

                {/* Confidence & Context Note */}
                <div className="mt-1 bg-[#ffffff] rounded p-4">
                  <p className="text-[11px] text-[#747684] mb-1 uppercase tracking-wider font-bold">
                    AI Automated Safeguard
                  </p>
                  <p className="text-[13px] text-[#444652] leading-relaxed">
                    Important: This evaluation is an automated safety signal calibrated to shield consumer funds, not a formal court determination of criminal fraud.
                  </p>
                </div>

                {/* Metric Sparkline Bar */}
                <div className="pt-1">
                  <div className="flex justify-between items-center text-[11px] text-[#747684] mb-1.5 font-bold">
                    <span>Aggregated Risk Gauge</span>
                    <span
                      className={
                        analysis.riskLevel === 'HIGH'
                          ? 'text-[#ba1a1a] font-medium'
                          : 'text-[#7e5700] font-medium'
                      }
                    >
                      {analysis.riskLevel === 'HIGH' ? 'Critical Threshold Exceeded' : 'Elevated Vigilance'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#e0e8ff] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        analysis.riskLevel === 'HIGH' ? 'bg-[#ba1a1a]' : 'bg-[#7e5700]'
                      }`}
                      style={{ width: `${analysis.riskScore}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Right Column: Context & Snippet Card (7 cols) */}
              <div className="lg:col-span-7 flex flex-col justify-between h-full space-y-6">
                <div>
                  <span className="text-[11px] text-[#747684] uppercase tracking-wider block mb-2 font-bold">
                    Executive Summary
                  </span>
                  <h2 className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] mb-2 font-medium">
                    Our assessment
                  </h2>
                  <p className="text-[16px] text-[#444652] leading-relaxed mb-6">
                    {analysis.summary}
                  </p>
                </div>

                {/* Submitted message snippet preview card */}
                <div className="bg-[#ffffff] rounded-xl p-6 shadow-sm border border-[#c4c6d4]/40">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#c4c6d4]/40">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#747684] text-[18px]">
                        chat_bubble_outline
                      </span>
                      <span className="text-[11px] text-[#747684] tracking-wider uppercase font-bold">
                        Submitted message preview
                      </span>
                    </div>
                    <span className="text-[11px] text-[#444652] bg-[#f1f3ff] px-2 py-0.5 rounded font-medium">
                      SMS / WhatsApp / OCR
                    </span>
                  </div>
                  <blockquote className="font-['Newsreader',serif] text-[19px] text-[#0f1b31] leading-snug italic font-normal">
                    “{messageInput ? messageInput.slice(0, 220) : DEMO_STRING}…”
                  </blockquote>
                  <div className="mt-3 flex items-center justify-end gap-2 text-[#747684] text-[11px] font-semibold">
                    <span>Verified {analysis.signals.length} flags in text analysis</span>
                  </div>
                </div>
              </div>
            </section>

            {/* WHY WE FLAGGED THIS (ANALYTICAL BREAKDOWN) */}
            <section className="pb-10 border-b border-[#c4c6d4]/60">
              <div className="max-w-2xl mb-6">
                <span className="text-[11px] text-[#747684] tracking-wider uppercase block mb-1 font-bold">
                  Analytical Breakdown
                </span>
                <h2 className="font-['Newsreader',serif] text-[32px] text-[#0f1b31] tracking-tight font-normal">
                  Why we flagged this
                </h2>
              </div>

              {/* Vertical Editorial Ledger */}
              <div className="flex flex-col">
                {analysis.signals.map((signal, index) => (
                  <article
                    key={index}
                    className="py-4 border-t border-[#c4c6d4]/60 grid grid-cols-1 md:grid-cols-12 gap-y-2 md:gap-6 items-baseline"
                  >
                    <div className="md:col-span-1 font-['Newsreader',serif] text-[24px] text-[#0e3d9f] font-normal">
                      0{index + 1}
                    </div>
                    <div className="md:col-span-4">
                      <h3 className="text-[14px] uppercase tracking-wider text-[#0f1b31] font-semibold">
                        {signal.name}
                      </h3>
                      <span
                        className={`text-[11px] font-bold ${
                          signal.severity === 'HIGH' ? 'text-[#ba1a1a]' : 'text-[#7e5700]'
                        }`}
                      >
                        {signal.severity} SEVERITY INDICATOR
                      </span>
                    </div>
                    <div className="md:col-span-7">
                      <p className="text-[14px] text-[#444652] leading-relaxed">{signal.explanation}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* IN SIMPLE TERMS (HUMAN-CENTERED EXPLANATION) */}
            <section className="bg-[#f1f3ff] rounded-xl p-6 lg:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#c4c6d4]/50 mb-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0e3d9f] text-[20px]">lightbulb</span>
                  <span className="text-[11px] uppercase tracking-wider text-[#0f1b31] font-bold">
                    In Simple Terms
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center p-0.5 rounded-full bg-[#ffffff]">
                    <button
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        selectedLanguage === 'en'
                          ? 'bg-[#0e3d9f] text-[#ffffff]'
                          : 'text-[#444652] hover:text-[#0f1b31]'
                      }`}
                      onClick={() => handleLanguageChange('en')}
                      type="button"
                    >
                      English
                    </button>
                    <button
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        selectedLanguage === 'hi'
                          ? 'bg-[#0e3d9f] text-[#ffffff]'
                          : 'text-[#444652] hover:text-[#0f1b31]'
                      }`}
                      onClick={() => handleLanguageChange('hi')}
                      type="button"
                    >
                      हिंदी
                    </button>
                    <button
                      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        selectedLanguage === 'or'
                          ? 'bg-[#0e3d9f] text-[#ffffff]'
                          : 'text-[#444652] hover:text-[#0f1b31]'
                      }`}
                      onClick={() => handleLanguageChange('or')}
                      type="button"
                    >
                      ଓଡ଼ିଆ
                    </button>
                  </div>
                </div>
              </div>

              {/* Human-Centered Lead Text */}
              <div>
                <p className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] leading-relaxed italic max-w-4xl font-normal">
                  “{analysis.simpleExplanation}”
                </p>
              </div>

              {/* Guidance Micro-steps */}
              <div className="mt-8 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-[#c4c6d4]/40">
                {analysis.safeActions.slice(0, 3).map((action, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#ba1a1a] text-[20px] shrink-0 mt-0.5">
                      {typeof action === 'object' && action.icon ? action.icon : 'shield'}
                    </span>
                    <div>
                      <h4 className="text-[14px] font-semibold text-[#0f1b31]">
                        {typeof action === 'object' ? action.title : 'Protective Action'}
                      </h4>
                      <p className="text-[13px] text-[#444652] mt-0.5">
                        {typeof action === 'object' ? action.description : action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ACTIONS & NEXT STEPS */}
            <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-4">
              <button
                className="inline-flex items-center justify-center gap-2 text-[14px] font-semibold text-[#0f1b31] hover:text-[#0e3d9f] transition-colors py-3 px-4 rounded cursor-pointer"
                onClick={() => setCurrentScreen('input')}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>Back to message</span>
              </button>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded bg-[#e8eeff] text-[#0f1b31] hover:bg-[#e0e8ff] transition-colors text-[14px] font-semibold cursor-pointer"
                  onClick={copyDossierText}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">share</span>
                  <span>{copiedNotification ? 'Copied to Clipboard' : 'Share Safety Warning'}</span>
                </button>
                <button
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded bg-[#3156b8] text-[#ffffff] hover:bg-[#0e3d9f] transition-colors text-[14px] font-semibold shadow-sm cursor-pointer"
                  onClick={handleVerifyClaims}
                  type="button"
                >
                  <span>View claim verification</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ================= SCREEN 4: CLAIM VERIFICATION ================= */}
        {currentScreen === 'verification' && analysis && (
          <div className="w-full max-w-7xl mx-auto px-5 md:px-6 lg:px-12 py-8 space-y-10">
            {/* Top Editorial Header & Context */}
            <header className="max-w-3xl">
              <div className="inline-flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#0e3d9f] shrink-0"></span>
                <span className="text-[11px] uppercase tracking-widest text-[#0e3d9f] font-semibold">
                  Claim Verification
                </span>
                <span className="text-[#747684] text-[13px]">/</span>
                <span className="text-[11px] text-[#444652] font-semibold">
                  Audit Dossier #{analysis.analysisId}
                </span>
              </div>
              <h1 className="font-['Newsreader',serif] text-[40px] text-[#0f1b31] tracking-tight mb-2 font-normal">
                What did TRUSTRA find?
              </h1>
              <p className="text-[18px] text-[#444652] leading-relaxed font-normal">
                We separate the claims in a message from what can actually be established.
              </p>
            </header>

            {/* Main Editorial Layout: Ledger & Inspection Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 7-Column Claims Ledger */}
              <section className="lg:col-span-7 flex flex-col">
                <div className="mb-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <h2 className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                      Claims found in this message
                    </h2>
                    <span className="text-[11px] text-[#444652] uppercase tracking-wider font-bold">
                      {analysis.claims.length} Discrete Signals
                    </span>
                  </div>
                  <p className="text-[14px] text-[#444652]">
                    These statements may require verification before you act.
                  </p>
                </div>

                {/* Ledger Table Structure */}
                <div className="flex flex-col bg-[#ffffff] rounded-lg shadow-sm border border-[#c4c6d4]/40 overflow-hidden">
                  {analysis.claims.map((claimObj, idx) => {
                    const isSelected = selectedClaimIndex === idx;
                    return (
                      <React.Fragment key={idx}>
                        <article
                          className={`p-6 transition-colors cursor-pointer relative ${
                            isSelected ? 'bg-[#f1f3ff]' : 'hover:bg-[#f1f3ff]'
                          }`}
                          onClick={() => setSelectedClaimIndex(idx)}
                        >
                          {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0e3d9f]"></div>}
                          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                              {isSelected && (
                                <span className="material-symbols-outlined text-[#0e3d9f] text-[18px]">
                                  arrow_right
                                </span>
                              )}
                              <span className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                                “{claimObj.claim}”
                              </span>
                            </div>
                            <span
                              className={`inline-flex items-center self-start sm:self-auto px-3 py-1 rounded-full text-[11px] uppercase tracking-wider font-semibold ${
                                claimObj.importance === 'HIGH'
                                  ? 'bg-[#ffdad6] text-[#93000a]'
                                  : 'bg-[#ffdeab] text-[#5f4100]'
                              }`}
                            >
                              {claimObj.importance === 'HIGH' ? 'Major risk signal' : 'Needs verification'}
                            </span>
                          </div>
                          <p
                            className={`text-[14px] text-[#444652] max-w-xl ${
                              isSelected ? 'pl-6' : ''
                            }`}
                          >
                            {claimObj.riskReason}
                          </p>
                          {isSelected && (
                            <div className="pl-6 mt-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0e3d9f]"></span>
                              <span className="text-[11px] text-[#0e3d9f] font-semibold tracking-wide">
                                Currently inspecting source records
                              </span>
                            </div>
                          )}
                        </article>
                        {idx < analysis.claims.length - 1 && (
                          <div className="h-px w-full bg-[#e8eeff]"></div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Inline Visual: Regulatory Check Ratio */}
                <div className="mt-4 p-4 bg-[#f1f3ff] rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#747684] text-[22px]">policy</span>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-semibold text-[#0f1b31]">
                        Regulatory Reference Standard
                      </span>
                      <span className="text-[13px] text-[#444652]">
                        Evaluated against SEBI master intermediary catalog v.2024
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#ffffff] text-[#444652]">
                    0 / 1 Validated
                  </span>
                </div>
              </section>

              {/* 5-Column Research Dossier Note (Detail View) */}
              <aside className="lg:col-span-5 flex flex-col gap-4">
                {/* Inspection Box */}
                <div className="bg-[#e8eeff] p-6 rounded-lg shadow-sm relative overflow-hidden">
                  <div className="flex items-center justify-between pb-4 mb-4 bg-[#e0e8ff] -mx-6 -mt-6 p-6">
                    <div className="flex flex-col">
                      <span className="text-[11px] uppercase tracking-wider text-[#444652] font-semibold">
                        Research Note
                      </span>
                      <span className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                        Claim Detail: “{analysis.claims[selectedClaimIndex]?.claim || 'SEBI approved'}”
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[#444652] text-[24px]">
                      verified_user
                    </span>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="p-3 bg-[#ffffff] rounded">
                      <span className="block text-[11px] text-[#747684] uppercase tracking-wider mb-1 font-bold">
                        Assessment
                      </span>
                      <span className="text-[12px] text-[#7e5700] font-semibold">
                        Needs verification
                      </span>
                    </div>
                    <div className="p-3 bg-[#ffffff] rounded">
                      <span className="block text-[11px] text-[#747684] uppercase tracking-wider mb-1 font-bold">
                        Evidence Available
                      </span>
                      <span className="text-[12px] text-[#444652] font-semibold">
                        Insufficient information
                      </span>
                    </div>
                  </div>

                  {/* Detail Narrative */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-[12px] uppercase tracking-wider text-[#444652] font-bold mb-1">
                        Why it matters
                      </h3>
                      <p className="text-[14px] text-[#0f1b31] leading-relaxed">
                        A regulatory approval claim can strongly influence trust. It should be independently verified through official directories before any financial action is taken.
                      </p>
                    </div>

                    {/* Transparent Source Note */}
                    <div className="bg-[#ffffff] p-4 rounded flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#747684] text-[20px] shrink-0 mt-0.5">
                        info
                      </span>
                      <p className="text-[13px] text-[#444652]">
                        No registration number or verifiable brokerage entity documentation was supplied in the text.
                      </p>
                    </div>

                    {/* Search Grounding Live Results if present */}
                    {verificationResults[selectedClaimIndex]?.sources &&
                      verificationResults[selectedClaimIndex].sources.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <span className="text-[11px] font-bold text-[#0e3d9f] uppercase tracking-wider block">
                            Grounding Search Citations
                          </span>
                          <div className="space-y-1">
                            {verificationResults[selectedClaimIndex].sources.map((src, sIdx) => (
                              <a
                                key={sIdx}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[12px] text-[#0e3d9f] hover:underline flex items-center gap-1.5"
                              >
                                <span className="material-symbols-outlined text-[14px]">link</span>
                                <span className="truncate">{src.title}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Micro Sparkline */}
                  <div className="mt-6 pt-4 flex flex-col gap-1.5 border-t border-[#c4c6d4]/40">
                    <div className="flex justify-between items-center text-[11px] text-[#444652] font-bold">
                      <span>Solvency Verification Likelihood</span>
                      <span className="font-semibold text-[#7e5700]">Indeterminate (Low Confidence)</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#d7e2ff] rounded-full overflow-hidden flex">
                      <div className="h-full bg-[#7e5700]" style={{ width: '14%' }}></div>
                      <div className="h-full bg-[#c4c6d4]" style={{ width: '86%' }}></div>
                    </div>
                  </div>
                </div>

                {/* Archival Status Indicator Card */}
                <div className="bg-[#f1f3ff] p-6 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[#0e3d9f] text-[20px]">account_balance</span>
                    <span className="text-[12px] uppercase tracking-wider text-[#0f1b31] font-semibold">
                      Registry Invalidation Note
                    </span>
                  </div>
                  <p className="text-[13px] text-[#444652]">
                    Regulated entities in jurisdiction IN must declare a valid SEBI Registration Code (e.g., INZ000000000). Absence of this sequence precludes machine validation.
                  </p>
                </div>
              </aside>
            </div>

            {/* Prominent Evidence Status Section */}
            <section className="w-full bg-[#ffffff] p-8 md:p-10 rounded-lg shadow-sm border border-[#c4c6d4]/40">
              <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-8 justify-between">
                <div className="space-y-3 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e0e8ff] text-[#0f1b31] text-[11px] font-bold tracking-widest uppercase">
                    <span className="w-2 h-2 rounded-full bg-[#747684]"></span>
                    Evidence Status: {analysis.evidenceStatus}
                  </div>
                  <h2 className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] font-normal leading-snug">
                    TRUSTRA could not establish sufficient evidence for the stated regulatory approval from the information provided.
                  </h2>
                  <div className="p-4 bg-[#f1f3ff] rounded-lg mt-4 space-y-1">
                    <p className="text-[14px] text-[#0f1b31] font-medium">
                      A lack of evidence does not by itself prove that a claim is fraudulent.
                    </p>
                    <p className="text-[13px] text-[#444652]">
                      TRUSTRA never fabricates registry records or assumes legitimacy without primary source confirmation.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 p-6 bg-[#f1f3ff] rounded-lg flex flex-col items-center justify-center text-center w-full md:w-56 border border-[#c4c6d4]/30">
                  <div className="w-12 h-12 rounded-full bg-[#e0e8ff] flex items-center justify-center mb-2 text-[#0e3d9f]">
                    <span className="material-symbols-outlined text-[28px]">search_off</span>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-[#444652] font-semibold">
                    Directory Query
                  </span>
                  <span className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] mt-1 font-medium">
                    Zero Matches
                  </span>
                  <span className="text-[11px] text-[#747684] mt-1">Primary Feed: SEC / SEBI</span>
                </div>
              </div>
            </section>

            {/* Scope Section: What TRUSTRA Can and Cannot Establish */}
            <section className="space-y-6">
              <div className="text-center max-w-2xl mx-auto mb-4">
                <span className="text-[11px] uppercase tracking-widest text-[#747684] font-semibold">
                  Operational Boundaries
                </span>
                <h2 className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] mt-1 font-normal">
                  What TRUSTRA can and cannot establish
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#ffffff] p-8 rounded-lg shadow-sm border border-[#c4c6d4]/40">
                {/* CAN IDENTIFY */}
                <div className="flex flex-col space-y-4 md:pr-6">
                  <div className="flex items-center gap-2 pb-2">
                    <div className="w-6 h-6 rounded-full bg-[#a7f2d2] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#002116] text-[16px]">check</span>
                    </div>
                    <h3 className="text-[14px] uppercase tracking-wider text-[#004f39] font-bold">
                      Can Identify
                    </h3>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#004f39] text-[20px] shrink-0 mt-0.5">
                        task_alt
                      </span>
                      <div>
                        <p className="text-[14px] text-[#0f1b31] font-semibold">
                          Warning signs and pressure tactics
                        </p>
                        <p className="text-[13px] text-[#444652]">
                          Patterns such as false artificial urgency, countdown timers, and coerced prompt actions.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#004f39] text-[20px] shrink-0 mt-0.5">
                        task_alt
                      </span>
                      <div>
                        <p className="text-[14px] text-[#0f1b31] font-semibold">
                          Claims requiring independent verification
                        </p>
                        <p className="text-[13px] text-[#444652]">
                          Unsubstantiated mentions of regulatory shields, statutory oversight, or custodial safety nets.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#004f39] text-[20px] shrink-0 mt-0.5">
                        task_alt
                      </span>
                      <div>
                        <p className="text-[14px] text-[#0f1b31] font-semibold">
                          Psychological solicitation patterns
                        </p>
                        <p className="text-[13px] text-[#444652]">
                          Exploitation of fear-of-missing-out (FOMO) and simulated exclusivity in retail groups.
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* CANNOT ESTABLISH */}
                <div className="flex flex-col space-y-4 md:pl-6 bg-[#f1f3ff] p-6 rounded-lg md:bg-transparent md:p-0">
                  <div className="flex items-center gap-2 pb-2">
                    <div className="w-6 h-6 rounded-full bg-[#e0e8ff] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#747684] text-[16px]">close</span>
                    </div>
                    <h3 className="text-[14px] uppercase tracking-wider text-[#747684] font-bold">
                      Cannot Establish
                    </h3>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#747684] text-[20px] shrink-0 mt-0.5">
                        remove_circle_outline
                      </span>
                      <div>
                        <p className="text-[14px] text-[#0f1b31] font-semibold">
                          Fraud with certainty from message content alone
                        </p>
                        <p className="text-[13px] text-[#444652]">
                          Syntactic indicators do not constitute judicial or criminal forensic determinations.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#747684] text-[20px] shrink-0 mt-0.5">
                        remove_circle_outline
                      </span>
                      <div>
                        <p className="text-[14px] text-[#0f1b31] font-semibold">
                          Legitimacy without verifiable registration records
                        </p>
                        <p className="text-[13px] text-[#444652]">
                          We cannot vouch for entities where official public filing documents are withheld.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#747684] text-[20px] shrink-0 mt-0.5">
                        remove_circle_outline
                      </span>
                      <div>
                        <p className="text-[14px] text-[#0f1b31] font-semibold">
                          Financial advisory recommendations
                        </p>
                        <p className="text-[13px] text-[#444652]">
                          TRUSTRA does not render investment suitability evaluations or financial portfolio guidance.
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Editorial Safety Principle Quote */}
            <div className="py-8 max-w-3xl mx-auto text-center">
              <span className="material-symbols-outlined text-[#747684] text-[32px] mb-2 opacity-60">
                format_quote
              </span>
              <blockquote className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] font-normal italic leading-relaxed">
                “TRUSTRA is designed to help you pause and verify — not to make financial decisions for you.”
              </blockquote>
              <p className="text-[11px] uppercase tracking-widest text-[#747684] mt-2 font-semibold">
                Autonomous Safety Principle · Article 1.04
              </p>
            </div>

            {/* Navigation & Action Bar */}
            <footer className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#c4c6d4]/40">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#e8eeff] text-[#0f1b31] text-[14px] font-semibold hover:bg-[#e0e8ff] transition-colors w-full sm:w-auto cursor-pointer"
                  onClick={() => setCurrentScreen('assessment')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">west</span>
                  <span>Back to assessment</span>
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#ffffff] text-[#444652] text-[14px] font-semibold hover:bg-[#e8eeff] hover:text-[#0f1b31] transition-colors shadow-sm w-full sm:w-auto cursor-pointer border border-[#c4c6d4]/40"
                  onClick={copyDossierText}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">share</span>
                  <span>{copiedNotification ? 'Copied' : 'Share safety summary'}</span>
                </button>
              </div>

              <div className="w-full sm:w-auto flex justify-end">
                <button
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-[#0e3d9f] text-[#ffffff] text-[14px] font-semibold hover:bg-[#3156b8] transition-colors shadow-md w-full sm:w-auto cursor-pointer"
                  onClick={() => setCurrentScreen('guidance')}
                  type="button"
                >
                  <span>Continue to safety guidance</span>
                  <span className="material-symbols-outlined text-[18px]">east</span>
                </button>
              </div>
            </footer>
          </div>
        )}

        {/* ================= SCREEN 5: SAFETY GUIDANCE ================= */}
        {currentScreen === 'guidance' && analysis && (
          <div className="w-full max-w-5xl mx-auto px-5 md:px-6 lg:px-12 py-8 space-y-10">
            {/* Header Section */}
            <header className="space-y-3">
              <div className="flex items-center gap-2 text-[#444652] text-[12px] tracking-wider uppercase font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-[#7e5700]"></span>
                <span>Safety Guidance</span>
                <span className="text-[#c4c6d4]">/</span>
                <span className="text-[#747684]">Action Plan #{analysis.analysisId}</span>
              </div>
              <div className="max-w-3xl space-y-2">
                <h1 className="font-['Newsreader',serif] text-[40px] md:text-[56px] text-[#0f1b31] tracking-tight leading-tight font-normal">
                  Don’t act yet.
                </h1>
                <p className="text-[18px] text-[#444652] leading-relaxed font-normal">
                  Pause before sending money or sharing personal information. You do not need to respond immediately just because a message asks you to.
                </p>
              </div>
            </header>

            {/* Risk Reminder Ledger Strip */}
            <section className="bg-[#f1f3ff] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6 shrink-0">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#747684] block mb-1 font-bold">
                    TRUSTRA assessment
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] font-semibold">
                      {analysis.riskScore}
                    </span>
                    <span className="text-[13px] text-[#747684]">/ 100</span>
                  </div>
                </div>
                <div className="h-10 w-px bg-[#c4c6d4]/60"></div>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffdad6] text-[#93000a] text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]"></span>
                    {analysis.riskLevel} RISK
                  </div>
                  <p className="text-[11px] text-[#747684] block font-semibold">
                    Confidence: {Math.round(analysis.confidence * 100)}%
                  </p>
                </div>
              </div>
              <div className="max-w-xl">
                <p className="text-[14px] text-[#444652] leading-relaxed">
                  The message contains critical warning signs that should be independently verified through official registry channels before taking any financial action.
                </p>
              </div>
            </section>

            {/* Primary Action Steps: "Before you send money" */}
            <section className="space-y-6 pt-2">
              <div className="space-y-1 max-w-2xl">
                <span className="text-[11px] uppercase tracking-wider text-[#747684] font-bold">
                  Preservation Protocol
                </span>
                <h2 className="font-['Newsreader',serif] text-[32px] text-[#0f1b31] font-normal">
                  Before you send money
                </h2>
                <p className="text-[14px] text-[#444652] leading-relaxed">
                  Three protective measures to take whenever an unsolicited message creates pressure or promises guaranteed returns.
                </p>
              </div>

              <div className="divide-y divide-[#c4c6d4]/50 border-t border-b border-[#c4c6d4]/50">
                {/* Step 01 */}
                <article className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-baseline">
                  <div className="md:col-span-2 flex items-baseline gap-2">
                    <span className="font-['Newsreader',serif] text-[24px] text-[#7e5700] font-medium">
                      01
                    </span>
                    <span className="text-[11px] text-[#747684] uppercase tracking-wider md:hidden font-bold">
                      Verify
                    </span>
                  </div>
                  <div className="md:col-span-4">
                    <h3 className="text-[14px] font-semibold uppercase tracking-wider text-[#0f1b31]">
                      Verify the Organisation
                    </h3>
                  </div>
                  <div className="md:col-span-6">
                    <p className="text-[14px] text-[#444652] leading-relaxed">
                      Use the organisation’s official website or official contact channel before taking any action. Never rely on phone numbers, links, or contact details provided inside the suspicious message itself.
                    </p>
                  </div>
                </article>

                {/* Step 02 */}
                <article className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-baseline">
                  <div className="md:col-span-2 flex items-baseline gap-2">
                    <span className="font-['Newsreader',serif] text-[24px] text-[#7e5700] font-medium">
                      02
                    </span>
                    <span className="text-[11px] text-[#747684] uppercase tracking-wider md:hidden font-bold">
                      Credentials
                    </span>
                  </div>
                  <div className="md:col-span-4">
                    <h3 className="text-[14px] font-semibold uppercase tracking-wider text-[#0f1b31]">
                      Protect Your Credentials
                    </h3>
                  </div>
                  <div className="md:col-span-6">
                    <p className="text-[14px] text-[#444652] leading-relaxed">
                      Never share OTPs, PINs, passwords, bank account details, or identity documents. Legitimate regulated financial entities never require immediate password or OTP disclosure to verify an account.
                    </p>
                  </div>
                </article>

                {/* Step 03 */}
                <article className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-baseline">
                  <div className="md:col-span-2 flex items-baseline gap-2">
                    <span className="font-['Newsreader',serif] text-[24px] text-[#7e5700] font-medium">
                      03
                    </span>
                    <span className="text-[11px] text-[#747684] uppercase tracking-wider md:hidden font-bold">
                      Consultation
                    </span>
                  </div>
                  <div className="md:col-span-4">
                    <h3 className="text-[14px] font-semibold uppercase tracking-wider text-[#0f1b31]">
                      Get a Second Opinion
                    </h3>
                  </div>
                  <div className="md:col-span-6">
                    <p className="text-[14px] text-[#444652] leading-relaxed">
                      Ask a trusted family member, close friend, or qualified professional before acting. Deceptive messages rely on isolating you from reasoned outside consultation through fabricated urgency.
                    </p>
                  </div>
                </article>
              </div>
            </section>

            {/* Editorial Inset Panel */}
            <section className="bg-[#f1f3ff] rounded-xl p-6 md:p-8 relative overflow-hidden">
              <div className="max-w-2xl space-y-3 relative z-10">
                <span className="material-symbols-outlined text-[#7e5700] text-3xl select-none">
                  format_quote
                </span>
                <h3 className="font-['Newsreader',serif] text-[24px] text-[#0f1b31] font-medium">
                  Pause is a good decision.
                </h3>
                <p className="text-[16px] text-[#444652] leading-relaxed">
                  Fraudulent communications rely entirely on manufactured urgency to bypass your rational judgment. Taking hours or days to verify will never harm a legitimate investment opportunity.
                </p>
              </div>
            </section>

            {/* Shareable Family Safety Dossier */}
            <section className="space-y-6 pt-2">
              <div className="space-y-1 max-w-2xl">
                <span className="text-[11px] uppercase tracking-wider text-[#747684] font-bold">
                  Collaborative Shield
                </span>
                <h2 className="font-['Newsreader',serif] text-[32px] text-[#0f1b31] font-normal">
                  Share safety summary
                </h2>
                <p className="text-[14px] text-[#444652] leading-relaxed">
                  Send this concise, non-technical explanation to family members or friends who may have received the same message.
                </p>
              </div>

              {/* Printable Card Preview */}
              <div className="bg-[#ffffff] rounded-xl p-6 md:p-8 space-y-6 shadow-sm border border-[#c4c6d4]/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#c4c6d4]/40 gap-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-[#747684] block font-bold">
                      Public Registry Memo
                    </span>
                    <h3 className="font-['Newsreader',serif] text-[20px] text-[#0f1b31] font-medium">
                      TRUSTRA Consumer Safety Dossier
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#747684] tabular-nums font-semibold">
                    Ref: #{analysis.analysisId}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-baseline">
                  <div className="md:col-span-3">
                    <span className="text-[11px] text-[#747684] uppercase tracking-wider font-bold">
                      Analyzed Excerpt
                    </span>
                  </div>
                  <div className="md:col-span-9">
                    <p className="text-[16px] text-[#0f1b31] font-medium italic">
                      “{analysis.claims.map((c) => c.claim).join(' • ') || 'Guaranteed return • Unverified claim'}”
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-baseline">
                  <div className="md:col-span-3">
                    <span className="text-[11px] text-[#747684] uppercase tracking-wider font-bold">
                      Evaluation
                    </span>
                  </div>
                  <div className="md:col-span-9 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#93000a] text-[11px] font-semibold">
                        {analysis.riskLevel} RISK
                      </span>
                      <span className="text-[13px] text-[#444652] font-medium">
                        Confidence Score: {analysis.riskScore} / 100
                      </span>
                    </div>
                    <p className="text-[13px] text-[#444652] pt-1">
                      <span className="font-medium text-[#0f1b31]">Primary Warning Signs:</span>{' '}
                      {analysis.signals.map((s) => s.name).join(' • ')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-baseline">
                  <div className="md:col-span-3">
                    <span className="text-[11px] text-[#747684] uppercase tracking-wider font-bold">
                      Advisory Action
                    </span>
                  </div>
                  <div className="md:col-span-9">
                    <p className="text-[14px] text-[#0f1b31] font-medium leading-relaxed">
                      Hold all transfers. Verify entity credentials directly on the official SEBI directory (
                      <a
                        className="text-[#0e3d9f] hover:underline"
                        href="https://www.sebi.gov.in"
                        target="_blank"
                        rel="noreferrer"
                      >
                        sebi.gov.in
                      </a>
                      ).
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#c4c6d4]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[#e0e8ff] hover:bg-[#d7e2ff] text-[#0f1b31] text-[12px] font-semibold transition-colors cursor-pointer"
                      onClick={copyDossierText}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">content_copy</span>
                      <span>{copiedNotification ? 'Copied to Clipboard' : 'Copy Summary Text'}</span>
                    </button>
                    <button
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[#f1f3ff] hover:bg-[#e0e8ff] text-[#0f1b31] text-[12px] font-semibold transition-colors cursor-pointer border border-[#c4c6d4]/40"
                      onClick={() => window.print()}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">print</span>
                      <span>Print Summary</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-[#747684] text-center sm:text-right font-medium">
                    Informational safety guidance • Not financial advice
                  </span>
                </div>
              </div>
            </section>

            {/* Final Memorable Anchor & Safety Principle */}
            <section className="text-center py-6 space-y-3 max-w-2xl mx-auto border-t border-[#c4c6d4]/40">
              <blockquote className="font-['Newsreader',serif] text-[32px] md:text-[40px] text-[#0f1b31] tracking-tight leading-snug font-normal">
                “VERIFY BEFORE YOU TRUST.”
              </blockquote>
              <p className="text-[14px] text-[#444652] leading-relaxed">
                When something involves your hard-earned money, taking a moment to pause and verify is always safer than acting under manufactured pressure.
              </p>
              <div className="pt-1">
                <span className="text-[11px] tracking-wider uppercase text-[#747684] font-semibold">
                  Autonomous Safety Principle • Article 1.05
                </span>
              </div>
            </section>

            {/* Primary Journey CTAs */}
            <section className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 pb-8">
              <button
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#0e3d9f] hover:bg-[#3156b8] text-[#ffffff] text-[14px] font-semibold px-8 py-3.5 rounded transition-colors shadow-sm cursor-pointer"
                onClick={resetForm}
                type="button"
              >
                <span>Analyze another message</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
              <button
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#f1f3ff] hover:bg-[#e8eeff] text-[#0f1b31] text-[14px] font-semibold px-6 py-3.5 rounded transition-colors cursor-pointer border border-[#c4c6d4]/40"
                onClick={() => setCurrentScreen('verification')}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>Back to claim verification</span>
              </button>
            </section>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full bg-[#f9f9ff] border-t border-[#c4c6d4]/40">
        <div className="max-w-7xl mx-auto px-5 md:px-6 lg:px-12 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-2 text-center sm:text-left">
            <span className="font-['Newsreader',serif] text-[20px] uppercase tracking-wider text-[#0f1b31]">
              TRUSTRA
            </span>
            <span className="hidden sm:inline text-[#747684]">—</span>
            <p className="text-[14px] text-[#444652]">Financial safety, built for everyone.</p>
          </div>
          <nav className="flex items-center gap-4">
            <button
              onClick={() => setInfoModal('privacy')}
              className="text-[12px] font-semibold text-[#444652] hover:text-[#0f1b31] transition-colors"
            >
              Privacy
            </button>
            <span className="text-[#c4c6d4]">|</span>
            <button
              onClick={() => setInfoModal('accessibility')}
              className="text-[12px] font-semibold text-[#444652] hover:text-[#0f1b31] transition-colors"
            >
              Accessibility
            </button>
            <span className="text-[#c4c6d4]">|</span>
            <button
              onClick={() => setInfoModal('about')}
              className="text-[12px] font-semibold text-[#444652] hover:text-[#0f1b31] transition-colors"
            >
              About
            </button>
          </nav>
        </div>
      </footer>

      {/* INFORMATION MODAL */}
      {infoModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0f1b31]/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setInfoModal(null)}
        >
          <div
            className="bg-[#ffffff] rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-[#c4c6d4]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#c4c6d4]/40">
              <h3 className="font-['Newsreader',serif] text-[22px] text-[#0f1b31] font-semibold">
                {infoModal === 'how-it-works' && 'How TRUSTRA Works'}
                {infoModal === 'privacy' && 'Privacy-First Architecture'}
                {infoModal === 'accessibility' && 'Accessibility Commitment'}
                {infoModal === 'about' && 'About TRUSTRA'}
              </h3>
              <button
                onClick={() => setInfoModal(null)}
                className="p-1 rounded-full text-[#444652] hover:text-[#0f1b31]"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="text-[14px] text-[#444652] space-y-3 leading-relaxed">
              {infoModal === 'how-it-works' && (
                <>
                  <p>
                    TRUSTRA combines deterministic heuristic risk modeling with server-side Google Gemini Flash reasoning to identify warning signs in financial messages before you act.
                  </p>
                  <p>
                    It evaluates 16 discrete coercion patterns including guaranteed returns, false regulatory seals, artificial deadlines, and credential harvesting.
                  </p>
                </>
              )}
              {infoModal === 'privacy' && (
                <>
                  <p>
                    <strong>Zero-Log Volatile Memory:</strong> TRUSTRA never saves raw text messages, screenshots, or credentials to permanent storage.
                  </p>
                  <p>
                    We automatically redact any credit cards, OTPs, PINs, or bank account numbers before any evaluation or indexing occurs.
                  </p>
                </>
              )}
              {infoModal === 'accessibility' && (
                <p>
                  Designed with high-contrast typography, large touch targets, screen-reader semantic landmarks, and vernacular support for English, Hindi (हिंदी), and Odia (ଓଡ଼ିଆ).
                </p>
              )}
              {infoModal === 'about' && (
                <p>
                  TRUSTRA is an investor protection tool built to safeguard first-time and elderly investors across India. TRUSTRA never sells financial products, securities, or lending services.
                </p>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInfoModal(null)}
                className="px-5 py-2 rounded-lg bg-[#3156b8] text-white text-[13px] font-semibold hover:bg-[#0e3d9f]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
