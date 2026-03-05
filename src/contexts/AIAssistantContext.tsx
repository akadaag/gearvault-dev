/**
 * AIAssistantContext
 *
 * Shared state bridge between FloatingNavBar (owns the input UI) and
 * AIAssistantPage (owns the business logic / submit handler).
 *
 * Input text, loading flag, and photo attachment live here so both
 * components can read & write them.  The heavy submit handler stays
 * inside AIAssistantPage but is registered on this context via a
 * ref-based callback bridge so FloatingNavBar can invoke it.
 */

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type RefObject,
} from 'react';
import { compressImageForAI, generateChatThumbnail } from '../lib/gearPhotos';

// ── Types ────────────────────────────────────────────────────────────────────

type SubmitFn = () => Promise<void>;

interface AIAssistantContextValue {
  /* Text input */
  input: string;
  setInput: (v: string) => void;

  /* Loading / error */
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;

  /* Photo attachment */
  pendingPhotoPreview: string;
  pendingPhotoDataUrl: string;
  handlePhotoSelected: (file: File | undefined) => Promise<void>;
  clearPhoto: () => void;
  photoInputRef: RefObject<HTMLInputElement | null>;

  /* Submit bridge — AIAssistantPage registers, FloatingNavBar calls */
  registerSubmitHandler: (fn: SubmitFn) => void;
  submit: () => Promise<void>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AIAssistantContext = createContext<AIAssistantContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function AIAssistantProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Photo state
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState('');
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Submit handler bridge (ref so it doesn't cause re-renders)
  const submitRef = useRef<SubmitFn | null>(null);

  const registerSubmitHandler = useCallback((fn: SubmitFn) => {
    submitRef.current = fn;
  }, []);

  const submit = useCallback(async () => {
    if (submitRef.current) {
      await submitRef.current();
    }
  }, []);

  // Photo handler — shared between FloatingNavBar's + button and the hidden input
  const handlePhotoSelected = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15_000_000) {
      setError('Photo too large. Keep under 15MB.');
      return;
    }
    try {
      const [thumbnail, compressed] = await Promise.all([
        generateChatThumbnail(file),
        compressImageForAI(file),
      ]);
      setPendingPhotoPreview(thumbnail);
      setPendingPhotoDataUrl(compressed);
      setError('');
    } catch {
      setError('Could not process photo.');
    }
  }, []);

  const clearPhoto = useCallback(() => {
    setPendingPhotoPreview('');
    setPendingPhotoDataUrl('');
  }, []);

  return (
    <AIAssistantContext.Provider
      value={{
        input,
        setInput,
        loading,
        setLoading,
        error,
        setError,
        pendingPhotoPreview,
        pendingPhotoDataUrl,
        handlePhotoSelected,
        clearPhoto,
        photoInputRef,
        registerSubmitHandler,
        submit,
      }}
    >
      {children}
    </AIAssistantContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAIAssistant(): AIAssistantContextValue {
  const ctx = useContext(AIAssistantContext);
  if (!ctx) {
    throw new Error('useAIAssistant must be used within <AIAssistantProvider>');
  }
  return ctx;
}
