/**
 * Firestore integration using Firebase Web SDK.
 * Connected to AI Studio provisioned Cloud Firestore with client credentials and security rules.
 * Follows strict privacy-first persistence.
 */

import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { logger } from '../utils/logger.ts';
import type { AnalysisResult } from '../schemas/analysis.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: true,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  logger.warn('Firestore Error', {
    errorInfo: JSON.stringify(errInfo),
    operationType,
    path: path || 'unknown',
  });
  throw new Error(JSON.stringify(errInfo));
}

let db: Firestore | null = null;
let firestoreAvailable = false;
let configuredDatabaseId: string | undefined;

// In-memory cache for ultra-fast local retrieval & redundancy
const volatileAnalyses = new Map<string, Record<string, unknown>>();
const volatileVerifications = new Map<string, Record<string, unknown>[]>();
const volatileSessions = new Map<string, { lastActive: string; count: number }>();

try {
  let firebaseConfig: {
    projectId?: string;
    firestoreDatabaseId?: string;
    apiKey?: string;
    authDomain?: string;
    appId?: string;
  } = {};
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  const projectId = firebaseConfig.projectId;
  configuredDatabaseId = firebaseConfig.firestoreDatabaseId;

  let app: FirebaseApp;
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0]!;
  }

  // Connect to the specific provisioned Firestore database instance
  if (configuredDatabaseId) {
    db = getFirestore(app, configuredDatabaseId);
  } else {
    db = getFirestore(app);
  }

  firestoreAvailable = true;
  logger.info('Firebase SDK successfully connected to Cloud Firestore', {
    projectId,
    databaseId: configuredDatabaseId || '(default)',
  });
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.warn('Firestore initialization failed; volatile fallback enabled', { error: msg });
  firestoreAvailable = false;
  db = null;
}

export interface StoredAnalysisRecord {
  analysisId: string;
  createdAt: string;
  inputType: 'text' | 'image' | 'voice';
  language: string;
  riskLevel: string;
  riskScore: number;
  confidence: number;
  summary: string;
  signals: unknown[];
  claims: unknown[];
  evidenceStatus: string;
  simpleExplanation: string;
  safeActions: unknown[];
}

export const firestoreService = {
  isAvailable(): boolean {
    return firestoreAvailable && db !== null;
  },

  getDatabaseInfo(): { available: boolean; databaseId?: string } {
    return {
      available: this.isAvailable(),
      databaseId: configuredDatabaseId,
    };
  },

  async saveAnalysis(
    analysis: AnalysisResult,
    inputType: 'text' | 'image' | 'voice' = 'text',
    language = 'en'
  ): Promise<void> {
    const record: StoredAnalysisRecord = {
      analysisId: analysis.analysisId,
      createdAt: new Date().toISOString(),
      inputType,
      language: ['en', 'hi', 'or'].includes(language) ? language : 'en',
      riskLevel: analysis.riskLevel,
      riskScore: typeof analysis.riskScore === 'number' ? analysis.riskScore : 0,
      confidence: typeof analysis.confidence === 'number' ? analysis.confidence : 1.0,
      summary: (analysis.summary || '').slice(0, 4000),
      signals: Array.isArray(analysis.signals) ? analysis.signals.slice(0, 50) : [],
      claims: Array.isArray(analysis.claims) ? analysis.claims.slice(0, 50) : [],
      evidenceStatus: analysis.evidenceStatus || 'INSUFFICIENT_EVIDENCE',
      simpleExplanation: (analysis.simpleExplanation || '').slice(0, 4000),
      safeActions: Array.isArray(analysis.safeActions) ? analysis.safeActions.slice(0, 20) : [],
      // PRIVACY RULE: NEVER store raw message or raw screenshots
    };

    volatileAnalyses.set(analysis.analysisId, record as unknown as Record<string, unknown>);

    if (db && firestoreAvailable) {
      const docPath = `analyses/${analysis.analysisId}`;
      try {
        await setDoc(doc(db, 'analyses', analysis.analysisId), record);
        logger.info('Analysis safely written to Cloud Firestore', { analysisId: analysis.analysisId });
      } catch (error) {
        logger.warn('Firestore write encountered error, preserved in memory', {
          analysisId: analysis.analysisId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },

  async getAnalysis(analysisId: string): Promise<Record<string, unknown> | null> {
    if (db && firestoreAvailable) {
      try {
        const snap = await getDoc(doc(db, 'analyses', analysisId));
        if (snap.exists()) {
          return snap.data() || null;
        }
      } catch {
        // Fall back to memory
      }
    }
    return volatileAnalyses.get(analysisId) || null;
  },

  async saveVerificationResults(
    analysisId: string,
    results: Array<{
      claim: string;
      status: string;
      explanation: string;
      sources: Array<{ title: string; url: string }>;
    }>
  ): Promise<void> {
    const payload = results.map((r) => ({
      analysisId,
      claim: (r.claim || '').slice(0, 1000),
      status: r.status,
      explanation: (r.explanation || '').slice(0, 2000),
      sources: Array.isArray(r.sources) ? r.sources.slice(0, 20) : [],
      createdAt: new Date().toISOString(),
    }));

    volatileVerifications.set(analysisId, payload);

    if (db && firestoreAvailable && payload.length > 0) {
      try {
        const batch = writeBatch(db);
        for (const item of payload) {
          const docRef = doc(collection(db, 'verification_results'));
          batch.set(docRef, item);
        }
        await batch.commit();
        logger.info('Verification results safely written to Cloud Firestore', {
          analysisId,
          count: payload.length,
        });
      } catch (error) {
        logger.warn('Firestore verification write encountered error', {
          analysisId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },

  async recordSession(sessionId: string): Promise<void> {
    const now = new Date().toISOString();
    const current = volatileSessions.get(sessionId) || { lastActive: now, count: 0 };
    current.lastActive = now;
    current.count += 1;
    volatileSessions.set(sessionId, current);

    if (db && firestoreAvailable) {
      try {
        await setDoc(
          doc(db, 'sessions', sessionId),
          {
            lastActive: now,
          },
          { merge: true }
        );
      } catch {
        // Silently swallow anonymous session errors
      }
    }
  },
};
