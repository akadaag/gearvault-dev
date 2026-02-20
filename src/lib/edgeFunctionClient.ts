/**
 * Shared Edge Function Client
 * 
 * Handles all AI requests through Supabase Edge Function proxy.
 * - Uses supabase.functions.invoke() for automatic auth handling
 * - Routes to correct provider (LLM Gateway or Groq)
 * - Handles errors and retries with cold start detection
 * - Proactively refreshes expired tokens before calling
 * - Single source of truth for all AI calls
 */

import { supabase } from './supabase';

// Client-side timeout for Edge Function calls (60 seconds)
const EDGE_FUNCTION_TIMEOUT = 60000;

/**
 * Custom error class for auth failures.
 * Allows callers to detect auth errors without string matching.
 */
export class AuthExpiredError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/**
 * Ensure the session is fresh before making Edge Function calls.
 * 
 * CRITICAL: If the token is already expired, throw immediately — do NOT call
 * refreshSession(). When both tokens are deeply expired, refreshSession() fails
 * AND fires onAuthStateChange(null), which wipes the React UI before error
 * messages can be displayed (the "mobile page reload" bug).
 * 
 * Only call refreshSession() proactively when the token is CLOSE to expiry
 * but not yet expired (refresh token is likely still valid in this window).
 */
async function ensureFreshSession(): Promise<void> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new AuthExpiredError('Authentication required. Please sign in to use AI features.');
  }

  // Decode JWT to check expiry (JWT payload is base64-encoded JSON)
  const accessToken = session.access_token;
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const expiresAt = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    // Token already expired — attempt refresh (safe because callers set loading=true
    // before reaching here, which prevents the auth guard from wiping the UI)
    if (timeUntilExpiry <= 0) {
      console.warn('[Edge Function] Token expired, attempting refresh...');
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[Edge Function] Refresh failed for expired token:', refreshError);
        throw new AuthExpiredError('Your session has expired. Please sign in again.');
      }
      console.log('[Edge Function] Expired token refreshed successfully');
      return; // Session is now fresh, proceed with the call
    }
    
    // Token expires within 120 seconds but is still valid → safe to proactively refresh
    if (timeUntilExpiry < 120_000) {
      console.warn('[Edge Function] Token expires soon, refreshing session...');
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[Edge Function] Refresh failed:', refreshError);
        throw new AuthExpiredError('Session expired. Please sign in again.');
      }
      console.log('[Edge Function] Session refreshed successfully');
    }
  } catch (e) {
    // If JWT decode fails, log but continue (token might still be valid)
    if (e instanceof AuthExpiredError) throw e;
    console.warn('[Edge Function] Could not decode JWT, proceeding anyway:', e);
  }
}

export type AIProvider = 'llm-gateway' | 'groq';

/** Multimodal content part for vision messages */
export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } };

/** Message content can be a plain string or an array of multimodal parts */
export type MessageContent = string | MessageContentPart[];

export interface EdgeFunctionRequest {
  provider: AIProvider;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: MessageContent }>;
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
 * Proactively refreshes expired tokens before calling.
 * Throws AuthExpiredError if user is not authenticated or session refresh fails.
 * Default: 3 retries (4 total attempts) with cold start handling.
 */
export async function callEdgeFunction(
  request: EdgeFunctionRequest,
  maxRetries = 3
): Promise<EdgeFunctionResponse> {
  // Ensure we have a fresh session before calling
  await ensureFreshSession();

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
        // Extract the REAL error from the response context
        // FunctionsHttpError has a generic message but the actual error is in error.context (Response object)
        let errorMessage = error.message || 'Edge Function invocation failed';
        let statusCode = 0;
        
        try {
          if (error.context && typeof error.context.json === 'function') {
            // error.context is a Response object — read the actual error body
            const errorBody = await error.context.json();
            console.error('[Edge Function] Response body:', errorBody);
            statusCode = error.context.status || 0;
            errorMessage = errorBody?.error || errorBody?.message || errorBody?.details || errorMessage;
            if (errorBody?.details) {
              errorMessage += ` — ${errorBody.details}`;
            }
            errorMessage = `[${statusCode}] ${errorMessage}`;
          } else if (error.context && error.context.status) {
            statusCode = error.context.status;
            errorMessage = `[${statusCode}] ${errorMessage}`;
          }
        } catch (_) {
          // Could not parse error context, use original message
          console.warn('[Edge Function] Could not parse error context');
        }
        
        console.error(`[Edge Function] Error (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMessage);
        
        // Check if it's an auth error — throw immediately, do NOT attempt refreshSession()
        // (ensureFreshSession already validated the token; a 401 here means it's truly expired)
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('JWT') || statusCode === 401) {
          throw new AuthExpiredError();
        }

        // Check for cold start (500 on first attempt) - retry immediately
        if ((errorMessage.includes('500') || statusCode === 500) && attempt === 0) {
          console.warn('[Edge Function] Cold start detected (500), retrying immediately...');
          continue; // Immediate retry, no delay
        }

        // Check for rate limiting (may appear in error context)
        if (errorMessage.includes('429') || errorMessage.includes('rate') || statusCode === 429) {
          if (attempt < maxRetries) {
            const delay = 2000 * (attempt + 1);
            console.warn(`[Edge Function] Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // For other 500 errors after first attempt, use exponential backoff
        if ((errorMessage.includes('500') || statusCode === 500) && attempt < maxRetries) {
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
      
      // Don't retry auth errors
      if (error instanceof AuthExpiredError) {
        throw error;
      }
      
      // Retry on network errors only
      if (attempt < maxRetries && error instanceof TypeError) {
        const delay = 2000 * (attempt + 1);
        console.warn(`[Edge Function] Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Don't retry auth errors or known failures (legacy string checks for backward compat)
      if (lastError.message.includes('Authentication') || lastError.message.includes('sign in')) {
        throw new AuthExpiredError(lastError.message);
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
