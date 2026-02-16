/**
 * Supabase Edge Function: AI Proxy
 * 
 * Securely proxies AI requests to multiple providers (LLM Gateway + Groq).
 * - Protects API keys by keeping them server-side
 * - Validates Supabase auth via JWT (required)
 * - Supports ES256 and HS256 JWT signatures (requires legacy JWT verification OFF)
 * - Supports multiple providers via "provider" field
 * - Routes requests to the correct API with proper authentication
 * 
 * Called via supabase.functions.invoke('ai-proxy', { body }) from the client.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Determine if an origin should be allowed based on pattern matching
 */
function getAllowedOrigin(origin: string): string {
  // Allow localhost (any port) for development
  if (origin.match(/^http:\/\/localhost:\d+$/)) return origin;
  
  // Allow any *.vercel.app deployment (production + all preview deployments)
  if (origin.match(/^https:\/\/[\w-]+\.vercel\.app$/)) return origin;
  
  // Default fallback for production
  return 'https://gearvault-dev.vercel.app';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Provider API endpoints
const PROVIDER_URLS: Record<string, string> = {
  'llm-gateway': 'https://internal.llmapi.ai/v1/chat/completions',
  'groq': 'https://api.groq.com/openai/v1/chat/completions',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Set CORS origin dynamically based on request origin
  const origin = req.headers.get('origin') || '';
  const responseHeaders = {
    ...corsHeaders,
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Content-Type': 'application/json',
  };

  try {
    // Verify request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: responseHeaders }
      );
    }

    // --- AUTH: Extract JWT and validate user ---
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.error('[Auth] No Authorization header present');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Extract the token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');

    // Create an admin client using the service role key
    // This client is used ONLY to validate the user's JWT
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Validate the JWT by passing the token directly to getUser()
    // This is the recommended pattern for Edge Functions
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[Auth] JWT validation failed:', authError?.message);
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: authError?.message || 'Invalid or expired token'
        }),
        { status: 401, headers: responseHeaders }
      );
    }
    
    console.log('[Auth] User verified:', user.email);

    // --- PARSE & VALIDATE REQUEST ---
    const body = await req.json();
    const { provider, model, messages, response_format, temperature, max_tokens } = body;

    if (!provider || !model || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: provider, model, and messages required' }),
        { status: 400, headers: responseHeaders }
      );
    }

    if (!PROVIDER_URLS[provider]) {
      return new Response(
        JSON.stringify({ error: `Invalid provider "${provider}". Must be "llm-gateway" or "groq"` }),
        { status: 400, headers: responseHeaders }
      );
    }

    // --- GET API KEY ---
    const apiKey = provider === 'llm-gateway' 
      ? Deno.env.get('LLM_GATEWAY_API_KEY')
      : Deno.env.get('GROQ_API_KEY');

    if (!apiKey) {
      console.error(`[Config] ${provider} API key not configured`);
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: responseHeaders }
      );
    }

    // --- FORWARD TO AI PROVIDER ---
    const apiUrl = PROVIDER_URLS[provider];
    console.log(`[${provider}] Request: model=${model}, user=${user.email}`);
    
    const providerResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format,
        temperature,
        max_tokens,
      }),
    });

    if (!providerResponse.ok) {
      const errorText = await providerResponse.text();
      console.error(`[${provider}] API error ${providerResponse.status}:`, errorText);
      
      // Try to parse error for better messaging
      let errorDetail = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorDetail = parsed?.error?.message || parsed?.error || parsed?.message || errorText;
      } catch (_) {
        // keep raw text
      }
      
      return new Response(
        JSON.stringify({ 
          error: `${provider} API error (${providerResponse.status})`,
          details: typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
          status: providerResponse.status,
        }),
        { status: providerResponse.status, headers: responseHeaders }
      );
    }

    // --- RETURN SUCCESS ---
    const data = await providerResponse.json();
    console.log(`[${provider}] Success for user: ${user.email}`);
    
    return new Response(
      JSON.stringify(data),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error('[Error]', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});
