/**
 * AI Model Configuration
 *
 * Architecture:
 * - Primary: Gemini 2.0 Flash via LLM Gateway (classification + packing plans + chat vision)
 * - Fallback: Groq Scout 17B (for when Gemini fails)
 *
 * ALL API keys are server-side only (Supabase Edge Function)
 * This file only exports model names and task configurations
 */

/**
 * Groq models — used only as fallback when Gemini is unavailable
 */
export const GROQ_MODELS = {
  SCOUT: 'meta-llama/llama-4-scout-17b-16e-instruct', // Fallback for all AI tasks - 30K TPM, 500K TPD, 1K RPD
} as const;

export type ModelTier = keyof typeof GROQ_MODELS;

/**
 * Task Configuration
 * Maps each AI task to its optimal model and parameters.
 * Classification uses Gemini directly (see gearClassifier.ts).
 */
export const AI_TASKS = {
  PACKING_LIST: {
    model: 'SCOUT' as ModelTier, // Fallback only - primary is Gemini via LLM Gateway
    maxTokens: 8000,
    temperature: 0.3,
  },
  CHAT: {
    model: 'SCOUT' as ModelTier, // Fallback only - primary is Gemini via LLM Gateway
    maxTokens: 2000,
    temperature: 0.6,
  },
} as const;

export type AITask = keyof typeof AI_TASKS;

/**
 * Rate Limits (Groq Free Tier)
 * Reference for monitoring and debugging
 */
export const RATE_LIMITS = {
  SCOUT: { tokensPerMin: 30000, requestsPerMin: 30, tokensPerDay: 500000, requestsPerDay: 1000 },
  // Gemini via LLM Gateway: 1M tokens/day, 500K Supabase Edge Function invocations/month
} as const;
