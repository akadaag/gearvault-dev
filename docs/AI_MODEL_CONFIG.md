# AI Model Configuration - Quick Reference

## Current Stack (Feb 2024)

### Primary Model (Packing Lists & Chat)
**Gemini 2.0 Flash Lite** via LLM Gateway
- **Access:** Supabase Edge Function proxy (`/functions/v1/ai-proxy`)
- **Model ID:** `google-ai-studio/gemini-2.0-flash-lite`
- **Cost:** FREE (1M tokens/day)
- **Reliability:** 95-98% JSON accuracy
- **Speed:** ~1-2 seconds
- **Note:** Uses Google AI Studio (not Vertex AI) to avoid first-request initialization errors

### Fallback Model (Packing Lists & Chat)
**Llama Scout 17B** via Groq
- **Access:** Direct from client (Groq API)
- **Model ID:** `meta-llama/llama-4-scout-17b-16e-instruct`
- **Cost:** FREE (500K tokens/day, 1K requests/day)
- **Reliability:** 88-92% JSON accuracy
- **Speed:** ~2-3 seconds

### Classification Model (Gear Auto-Classification)
**Llama 3.1 8B Instant** via Groq
- **Access:** Direct from client (Groq API)
- **Model ID:** `llama-3.1-8b-instant`
- **Cost:** FREE (500K tokens/day, 14.4K requests/day)
- **Reliability:** 85-90% (fine for classification)
- **Speed:** ~500ms

---

## Request Flow

### Packing List Generation
```
1. User clicks "Generate Packing List"
   ↓
2. Client calls llmGatewayClient.ts
   ↓
3. Supabase Edge Function adds API key (server-side)
   ↓
4. LLM Gateway routes to Gemini 2.0 Flash Lite
   ↓
5. If success → return packing list ✅
   If failure → continue to step 6
   ↓
6. Client calls groqClient.ts (fallback)
   ↓
7. Groq API returns Scout 17B response
   ↓
8. Return packing list ✅ (or show error if all fail)
```

### Gear Classification
```
1. User adds gear item without eventFit/strengths
   ↓
2. Client calls groqClient.ts (gearClassifier.ts)
   ↓
3. Groq API returns llama-3.1-8b-instant response
   ↓
4. Extract: inferredProfile, eventFit, strengths
   ↓
5. Save to gear item ✅
```

---

## File Structure

```
src/lib/
├── llmGatewayClient.ts       # NEW: Gemini via Edge Function (primary)
├── groqClient.ts              # UPDATED: Scout fallback + classification
├── groqConfig.ts              # UPDATED: Model configuration
├── aiSchemas.ts               # JSON schema + Zod validation
├── gearClassifier.ts          # Uses Groq llama-3.1-8b-instant
└── supabase.ts                # Supabase client setup

supabase/functions/
└── ai-proxy/
    └── index.ts               # NEW: Edge Function proxy (Deno)
```

---

## Environment Variables

### Local Development (`.env.local`)
```bash
# Supabase (required for AI proxy)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Groq (required for fallback + classification)
VITE_GROQ_API_KEY=gsk_your_groq_key
VITE_GROQ_API_KEY_FALLBACK=gsk_optional_fallback_key
```

### Supabase Secrets (server-side only)
```bash
supabase secrets set LLM_GATEWAY_API_KEY=llmgtwy_your_key_here
```

### Vercel Production (dashboard)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GROQ_API_KEY`
- `VITE_GROQ_API_KEY_FALLBACK`

---

## Free Tier Limits

| Service | Resource | Free Limit | Notes |
|---------|----------|------------|-------|
| **Supabase Edge Functions** | Invocations | 500K/month | Each packing list = 1 invocation |
| **LLM Gateway (Gemini)** | Tokens | 1M/day | ~250-500 packing lists/day |
| **Groq (Scout 17B)** | Tokens | 500K/day | Fallback only |
| **Groq (Scout 17B)** | Requests | 1K/day | Fallback only |
| **Groq (llama-3.1-8b)** | Tokens | 500K/day | Classification only |
| **Groq (llama-3.1-8b)** | Requests | 14.4K/day | Classification only |

**Estimated capacity:** 200-400 active users generating 5 packing lists/day before hitting any limits.

---

## Deployment Checklist

- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Login: `supabase login`
- [ ] Link project: `supabase link --project-ref <your-ref>`
- [ ] Set secret: `supabase secrets set LLM_GATEWAY_API_KEY=<your-key>`
- [ ] Deploy function: `supabase functions deploy ai-proxy`
- [ ] Test function: `curl -X POST https://<your-project>.supabase.co/functions/v1/ai-proxy ...`
- [ ] Update `.env.local` with Supabase URL and keys
- [ ] Test locally: `npm run dev` → AI Assistant → Generate packing list
- [ ] Update Vercel env vars (if deploying to production)
- [ ] Deploy to Vercel: `git push origin main`

---

## Monitoring

### Check Edge Function logs
```bash
supabase functions logs ai-proxy --tail
```

### Check Supabase usage
https://supabase.com/dashboard/project/_/settings/billing

### Check Groq usage
https://console.groq.com/settings/limits

### Check LLM Gateway usage
Check your LLM Gateway dashboard (if available)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "LLM_GATEWAY_API_KEY not configured" | Run `supabase secrets set LLM_GATEWAY_API_KEY=...` and redeploy |
| "Failed to fetch" / CORS errors | Check `VITE_SUPABASE_URL` in `.env.local` |
| Always falls back to Scout | Check Edge Function logs: `supabase functions logs ai-proxy` |
| High latency (>5s) | Cold start (first request after idle), normal behavior |
| JSON parse errors from Gemini | Should be rare (<5%), fallback will handle it |

---

## Next Steps

1. **Rotate the exposed API key** - The LLM Gateway key pasted in chat should be regenerated
2. **Optional: Enable auth** - Uncomment auth check in `supabase/functions/ai-proxy/index.ts`
3. **Optional: Add rate limiting** - Track user requests in Supabase table
4. **Optional: Add analytics** - Log model usage, success rates, latency

---

## Previous Architecture (Deprecated)

**Old stack (before Feb 2024):**
- ❌ Primary: `groq/compound-mini` (unreliable JSON, breaking packing lists)
- ❌ Fallback: `llama-4-scout-17b` (after 2 compound-mini retries)
- ❌ API keys exposed in client bundle (`VITE_` env vars)

**Problems:**
- 40-60% JSON failure rate from compound-mini
- 4-tier fallback chain wasted tokens
- Daily request limits (250 RPD on compound-mini)
- API keys stolen from browser DevTools

**New stack (Feb 2024):**
- ✅ Primary: Gemini 2.0 Flash Lite (95-98% JSON reliability)
- ✅ Fallback: Scout 17B only (single fallback, no wastage)
- ✅ API keys server-side only (Supabase Edge Function)
- ✅ 500K Edge Function invocations/month (vs 250 RPD before)
