/**
 * Shared Edge Function Client
 * 
 * Handles all AI requests through Supabase Edge Function proxy.
 * - Uses supabase.functions.invoke() for automatic auth handling
 * - Routes to correct provider (LLM Gateway or Groq)
 * - Handles errors and retries with cold start detection
 * - Single source of truth for all AI calls
 */

import { supabase } from './supabase';

// Client-side timeout for Edge Function calls (60 seconds)
const EDGE_FUNCTION_TIMEOUT = 60000;

export type AIProvider = 'llm-gateway' | 'groq';

export interface EdgeFunctionRequest {
  provider: AIProvider;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

export interface EdgeFunctionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Timeout wrapper for promises
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    ),
  ]);
}

/**
 * Call the Edge Function with authentication.
 * Uses supabase.functions.invoke() which handles auth headers automatically.
 * Throws if user is not authenticated or request fails.
 * Default: 3 retries (4 total attempts) with cold start handling.
 */
export async function callEdgeFunction(
  request: EdgeFunctionRequest,
  maxRetries = 3
): Promise<EdgeFunctionResponse> {
  // Verify we have a session before calling
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new Error('Authentication required. Please sign in to use AI features.');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wrap invoke with timeout to prevent hanging
      const { data, error } = await withTimeout(
        supabase.functions.invoke('ai-proxy', {
          body: request,
        }),
        EDGE_FUNCTION_TIMEOUT
      );

      // Handle Supabase invoke errors
      if (error) {
        const errorMessage = error.message || 'Edge Function invocation failed';
        
        // Check if it's an auth error
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('JWT')) {
          // Try refreshing the session once
          if (attempt === 0) {
            console.warn('[Edge Function] Auth error, refreshing session...');
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              throw new Error('Authentication expired. Please sign in again.');
            }
            continue; // Retry with refreshed token
          }
          throw new Error('Authentication expired. Please sign in again.');
        }

        // Check for cold start (500 on first attempt) - retry immediately
        if (errorMessage.includes('500') && attempt === 0) {
          console.warn('[Edge Function] Cold start detected (500), retrying immediately...');
          continue; // Immediate retry, no delay
        }

        // Check for rate limiting (may appear in error context)
        if (errorMessage.includes('429') || errorMessage.includes('rate')) {
          if (attempt < maxRetries) {
            const delay = 2000 * (attempt + 1);
            console.warn(`[Edge Function] Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // For other 500 errors after first attempt, use exponential backoff
        if (errorMessage.includes('500') && attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
          console.warn(`[Edge Function] Server error (500), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`Edge Function error: ${errorMessage}`);
      }

      // supabase.functions.invoke() returns parsed JSON directly
      // But we need to handle the case where the response contains an error
      if (data?.error) {
        const errDetail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(`AI proxy error: ${errDetail}`);
      }

      // Validate we got the expected response shape
      if (!data?.choices?.[0]?.message?.content) {
        console.error('[Edge Function] Unexpected response shape:', data);
        throw new Error('Invalid response from AI provider');
      }

      return data as EdgeFunctionResponse;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Retry on network errors only
      if (attempt < maxRetries && error instanceof TypeError) {
        const delay = 2000 * (attempt + 1);
        console.warn(`[Edge Function] Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Don't retry auth errors or known failures
      if (lastError.message.includes('Authentication') || lastError.message.includes('sign in')) {
        throw lastError;
      }

      // For other errors, only throw if we've exhausted retries
      if (attempt >= maxRetries) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Failed after retries');
}

/**
 * Test if Edge Function connection is working
 */
export async function testEdgeFunctionConnection(provider: AIProvider = 'llm-gateway'): Promise<boolean> {
  try {
    const response = await callEdgeFunction({
      provider,
      model: provider === 'llm-gateway' ? 'google-vertex/gemini-2.0-flash-lite' : 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Hello, respond with just "OK"' }],
      max_tokens: 10,
    });

    return !!response.choices[0]?.message?.content;
  } catch (error) {
    console.error('[Edge Function] Connection test failed:', error);
    return false;
  }
}
