# Deployment Checklist for Edge Function Migration

This checklist guides you through deploying the new secure AI architecture with Supabase Edge Functions.

## Prerequisites

- ✅ Supabase project linked (`zewiamwlcynvaikoascm`)
- ✅ Supabase CLI installed (`brew install supabase/tap/supabase`)
- ✅ All code changes committed
- 🔑 LLM Gateway API key: `llmgtwy_Mwz2zOrWNjzD8EqfEKrL7KeUABS1Z9eguGUAkcgO` ⚠️ **MUST BE ROTATED**
- 🔑 Your Groq API key from https://console.groq.com/keys

## Step 1: Set Up API Keys (Server-Side)

⚠️ **CRITICAL SECURITY NOTE**: The LLM Gateway key shown above was exposed in chat and MUST be rotated after deployment.

1. Set the Groq API key:
   ```bash
   supabase secrets set GROQ_API_KEY=gsk_your_groq_key_here
   ```

2. Set the LLM Gateway key (TEMPORARY - rotate after setup):
   ```bash
   supabase secrets set LLM_GATEWAY_API_KEY=llmgtwy_Mwz2zOrWNjzD8EqfEKrL7KeUABS1Z9eguGUAkcgO
   ```

3. Verify secrets are set:
   ```bash
   supabase secrets list
   ```

## Step 2: Clean Up Client-Side

1. Remove OpenAI SDK (no longer needed):
   ```bash
   npm uninstall openai
   ```

2. Remove Groq keys from `.env.local`:
   - Delete `VITE_GROQ_API_KEY`
   - Delete `VITE_GROQ_API_KEY_FALLBACK` (if present)
   
   Keep only:
   ```
   VITE_SUPABASE_URL=https://zewiamwlcynvaikoascm.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

## Step 3: Deploy Edge Function

1. Deploy the updated `ai-proxy` Edge Function:
   ```bash
   supabase functions deploy ai-proxy
   ```

2. Verify deployment:
   ```bash
   curl -i https://zewiamwlcynvaikoascm.supabase.co/functions/v1/ai-proxy \
     -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"provider":"groq","model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"test"}]}'
   ```

## Step 4: Test Locally

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Navigate to AI Assistant page and verify:
   - [ ] Auth guard shows if not logged in
   - [ ] Can log in successfully
   - [ ] Can generate packing lists
   - [ ] Can chat with AI
   - [ ] Gear auto-classification works
   - [ ] No console errors about missing API keys
   - [ ] No API keys visible in Network tab

3. Check browser DevTools Network tab:
   - All AI requests should go to `https://zewiamwlcynvaikoascm.supabase.co/functions/v1/ai-proxy`
   - No requests to `groq.com` or `llmgateway.ai` (all proxied)
   - Authorization header should be present on all requests

## Step 5: Deploy to Production (Vercel)

1. Update Vercel environment variables:
   - Remove: `VITE_GROQ_API_KEY`
   - Remove: `VITE_GROQ_API_KEY_FALLBACK`
   - Keep: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

2. Deploy to Vercel:
   ```bash
   git add .
   git commit -m "Migrate AI to secure Edge Function architecture"
   git push origin main
   ```

3. Verify production deployment:
   - [ ] Navigate to production URL
   - [ ] Test packing list generation
   - [ ] Test chat functionality
   - [ ] Check browser console for errors
   - [ ] Verify Network tab shows only Edge Function requests

## Step 6: Rotate LLM Gateway Key (CRITICAL)

⚠️ **DO THIS IMMEDIATELY AFTER SUCCESSFUL DEPLOYMENT**

1. Go to https://llmgateway.ai/dashboard
2. Generate a new API key
3. Update Supabase secret:
   ```bash
   supabase secrets set LLM_GATEWAY_API_KEY=llmgtwy_new_key_here
   ```
4. Redeploy Edge Function:
   ```bash
   supabase functions deploy ai-proxy
   ```
5. Revoke the old key (`llmgtwy_Mwz2zOrWNjzD8EqfEKrL7KeUABS1Z9eguGUAkcgO`)

## Step 7: Monitor

1. Check Supabase Edge Function logs:
   ```bash
   supabase functions logs ai-proxy
   ```

2. Monitor for errors:
   - Auth failures (401) - users need to log in
   - Rate limits (429) - may need to upgrade LLM Gateway tier
   - Model errors (500) - check secrets are set correctly

## Rollback Plan (If Needed)

If you encounter critical issues:

1. Restore Groq keys to `.env.local`:
   ```
   VITE_GROQ_API_KEY=your_backup_groq_key
   ```

2. Revert code changes:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. Reinstall OpenAI SDK:
   ```bash
   npm install openai
   ```

## Success Criteria

✅ All AI requests routed through Supabase Edge Function  
✅ No API keys in browser (Network tab, localStorage, source code)  
✅ Authentication required for AI features  
✅ Packing list generation works (Gemini primary, Scout fallback)  
✅ Chat works (Gemini primary, Scout fallback)  
✅ Gear auto-classification works (Groq Fast model)  
✅ No console errors  
✅ LLM Gateway key rotated and secured  

## Troubleshooting

### "401 Unauthorized" errors
- User needs to log in (expected behavior)
- Check Supabase session is valid: `supabase.auth.getSession()`

### "Missing API key" errors
- Verify secrets are set: `supabase secrets list`
- Redeploy Edge Function: `supabase functions deploy ai-proxy`

### "Model not found" errors
- Check model names in `groqConfig.ts` match API
- Verify LLM Gateway key has access to Gemini 2.0 Flash Lite

### Rate limit errors
- Gemini: 1M tokens/day (free tier) - should be sufficient
- Groq: 500K tokens/day (free tier) - may need upgrade for heavy use
- Supabase: 500K Edge Function invocations/month - should be sufficient

## Support

- **Supabase Docs**: https://supabase.com/docs/guides/functions
- **LLM Gateway Docs**: https://llmgateway.ai/docs
- **Groq Docs**: https://console.groq.com/docs
- **GitHub Issues**: Report bugs in your repo

---

**Last Updated**: 2026-02-15  
**Architecture Version**: v2.0 (Secure Edge Function Proxy)
