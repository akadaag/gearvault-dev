# Supabase Edge Functions Setup Guide

## Overview

The GearVault AI system now uses **Supabase Edge Functions** to securely proxy AI requests to the LLM Gateway API. This protects your API keys by keeping them server-side while giving you 500K free Edge Function invocations per month.

## Architecture

```
Browser (client)
    ↓
Supabase Edge Function (/functions/v1/ai-proxy)
    ↓ (adds API key server-side)
LLM Gateway API (internal.llmapi.ai)
    ↓
Gemini 2.0 Flash Lite (primary model)
```

**Fallback chain:**
1. **Primary:** Gemini 2.0 Flash Lite (via LLM Gateway → Supabase Edge Function)
2. **Fallback:** Groq Scout 17B (direct from client)
3. **Classification:** Groq llama-3.1-8b-instant (direct from client, for gear classification only)

---

## Prerequisites

1. **Supabase Account** - https://supabase.com
2. **Supabase CLI** - Install: `npm install -g supabase`
3. **LLM Gateway API Key** - Your key: `llmgtwy_Mwz2zOrWNjzD8EqfEKrL7KeUABS1Z9eguGUAkcgO` (rotate this after setup!)
4. **Groq API Keys** - For fallback/classification: https://console.groq.com/keys

---

## Step 1: Install Supabase CLI

```bash
# Install globally
npm install -g supabase

# Verify installation
supabase --version
```

---

## Step 2: Login to Supabase

```bash
supabase login
```

This will open your browser for authentication.

---

## Step 3: Link Your Supabase Project

```bash
# Get your project reference ID from https://supabase.com/dashboard/project/_/settings/general
supabase link --project-ref your-project-ref-id
```

---

## Step 4: Set Edge Function Secrets

The Edge Function needs the LLM Gateway API key. Set it as a secret (server-side only, never exposed):

```bash
# Set LLM Gateway API key
supabase secrets set LLM_GATEWAY_API_KEY=llmgtwy_Mwz2zOrWNjzD8EqfEKrL7KeUABS1Z9eguGUAkcgO

# Verify it was set
supabase secrets list
```

**IMPORTANT:** Rotate the API key after this setup! The key you pasted in chat should be regenerated for security.

---

## Step 5: Deploy the Edge Function

```bash
# Deploy the ai-proxy function
supabase functions deploy ai-proxy

# Check deployment status
supabase functions list
```

You should see:
```
ai-proxy | deployed | https://your-project.supabase.co/functions/v1/ai-proxy
```

---

## Step 6: Test the Edge Function

```bash
# Test with a simple request (replace with your actual Supabase URL)
curl -X POST https://your-project.supabase.co/functions/v1/ai-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google-vertex/gemini-2.0-flash-lite",
    "messages": [{"role": "user", "content": "Hello, respond with OK"}],
    "max_tokens": 10
  }'
```

Expected response:
```json
{
  "id": "chatcmpl-...",
  "choices": [{"message": {"content": "OK"}}]
}
```

---

## Step 7: Update Your .env.local

Make sure your `.env.local` file has your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

VITE_GROQ_API_KEY=gsk_your_groq_key_here
VITE_GROQ_API_KEY_FALLBACK=gsk_optional_fallback_key
```

---

## Step 8: Test Locally

```bash
# Start Vite dev server
npm run dev

# Open http://localhost:5173
# Go to AI Assistant page
# Try generating a packing list
# Check browser console for logs:
#   "🟢 Attempt 1: Gemini 2.0 Flash Lite (via LLM Gateway)"
#   "✅ Gemini succeeded!"
```

---

## Step 9: Deploy to Vercel (Production)

Your Vercel deployment needs the same environment variables:

### Option A: Via Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings → Environment Variables**
4. Add:
   - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your_supabase_anon_key`
   - `VITE_GROQ_API_KEY` = `gsk_your_groq_key`
   - `VITE_GROQ_API_KEY_FALLBACK` = `gsk_optional_fallback_key`

### Option B: Via Vercel CLI
```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_GROQ_API_KEY
vercel env add VITE_GROQ_API_KEY_FALLBACK
```

Then redeploy:
```bash
git push origin main
# or
vercel --prod
```

---

## Troubleshooting

### "LLM_GATEWAY_API_KEY not configured" error
- Make sure you ran `supabase secrets set LLM_GATEWAY_API_KEY=...`
- Verify with `supabase secrets list`
- Redeploy the function: `supabase functions deploy ai-proxy`

### "Failed to fetch" or CORS errors
- Check that `VITE_SUPABASE_URL` in `.env.local` matches your Supabase project URL
- Check that the Edge Function is deployed: `supabase functions list`
- Check browser console for the exact error

### "Unauthorized" errors
- Make sure `VITE_SUPABASE_ANON_KEY` is set correctly
- The anon key is safe to expose (RLS policies protect your data)

### Gemini always fails, falls back to Scout
- Check Edge Function logs: `supabase functions logs ai-proxy`
- Test the Edge Function directly with curl (see Step 6)
- Check that the LLM Gateway API key is valid

### High latency (>5 seconds)
- Cold starts can add 200-500ms
- Check your Supabase region (should be close to your users)
- Check LLM Gateway API status

---

## Monitoring & Usage

### Check Edge Function invocations
```bash
supabase functions logs ai-proxy --tail
```

### Check usage limits
- **Supabase:** https://supabase.com/dashboard/project/_/settings/billing
- **LLM Gateway:** Check your LLM Gateway dashboard
- **Groq:** https://console.groq.com/settings/limits

### Free tier limits
- Supabase Edge Functions: 500K invocations/month
- Gemini 2.0 Flash Lite: 1M tokens/day (via LLM Gateway)
- Groq Scout 17B: 500K tokens/day, 1K requests/day
- Groq llama-3.1-8b: 500K tokens/day, 14.4K requests/day

---

## Security Notes

1. **API keys are server-side only** - The LLM Gateway key lives in Supabase secrets, never exposed to the browser
2. **Rotate exposed keys** - The key you pasted in chat (`llmgtwy_Mwz2z...`) should be regenerated
3. **Optional: Enable auth** - Uncomment the auth check in `supabase/functions/ai-proxy/index.ts` to require login
4. **Optional: Add rate limiting** - Track user IDs and limit requests per user per day

---

## Commands Reference

```bash
# Deploy Edge Function
supabase functions deploy ai-proxy

# View logs
supabase functions logs ai-proxy --tail

# List secrets
supabase secrets list

# Update secret
supabase secrets set LLM_GATEWAY_API_KEY=new_key_here

# Delete function (if needed)
supabase functions delete ai-proxy
```

---

## Support

- Supabase Docs: https://supabase.com/docs/guides/functions
- Supabase Community: https://supabase.com/community
- LLM Gateway Docs: https://llmgateway.com/docs (if available)
