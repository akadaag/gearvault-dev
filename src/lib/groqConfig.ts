/**
 * Groq API Configuration
 * Centralized config for all Groq API calls (both packing plans and gear classification)
 * 
 * Set VITE_GROQ_API_KEY in your .env.local file
 * Get your API key from: https://console.groq.com/keys
 */

export const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = 'llama-3.3-70b-versatile'; // 12K tokens/min, smarter 70B model
