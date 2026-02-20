/**
 * AI Model Configuration
 * 
 * NEW ARCHITECTURE (Feb 2024):
 * - Primary: Gemini 2.5 Flash Lite via LLM Gateway (Supabase Edge Function proxy)
 * - Fallback: Groq Scout 17B (for when Gemini fails)
 * - Classification: Groq llama-3.1-8b-instant (fast, simple tasks)
 * 
 * ALL API keys are now server-side only (Supabase Edge Function)
 * This file only exports model names and task configurations
 */

/**
 * Multi-Model Configuration
 * Primary model (Gemini) is accessed via llmGatewayClient.ts
 * Groq models are for fallback and classification
 */
export const GROQ_MODELS = {
  FAST: 'llama-3.1-8b-instant',                           // Classification only - 6K TPM, 14.4K RPD
  SCOUT: 'meta-llama/llama-4-scout-17b-16e-instruct',    // Fallback for packing + chat - 500K TPD, 1K RPD
} as const;

export type ModelTier = keyof typeof GROQ_MODELS;

/**
 * Task Configuration
 * Maps each AI task to its optimal model and parameters
 */
export const AI_TASKS = {
  CLASSIFICATION: {
    model: 'FAST' as ModelTier,
    maxTokens: 2000,
    temperature: 0.3,
  },
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
 * Rate Limits (Free Tier)
 * Reference for monitoring and debugging
 */
export const RATE_LIMITS = {
  FAST: { tokensPerMin: 6000, requestsPerMin: 30, tokensPerDay: 500000, requestsPerDay: 14400 },
  SCOUT: { tokensPerMin: 30000, requestsPerMin: 30, tokensPerDay: 500000, requestsPerDay: 1000 },
  // Gemini via LLM Gateway: 1M tokens/day, 500K Supabase Edge Function invocations/month
} as const;
