import { useState, useMemo, useRef, useEffect } from 'react';
import { ContentEditableInput } from '../components/ContentEditableInput';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  buildPatterns, 
  getProvider, 
  toEventFromPlan, 
  sendChatMessage,
  createChatMessage,
  createChatSession,
  saveChatSession,
  loadAllChatSessions,
  deleteChatSession,
  generateChatTitle,
  type AIPlan 
} from '../services/ai';
import { matchCatalogItem } from '../lib/catalogMatcher';
import { groupBySection, priorityLabel } from '../lib/packingHelpers';
import { classifyPendingItems } from '../lib/gearClassifier';
import { compressImageForAI, generateChatThumbnail } from '../lib/gearPhotos';
import {
  CatalogMatchReviewSheet,
  type ReviewItem,
} from '../components/CatalogMatchReviewSheet';
import type { GearItem, ChatSession } from '../types/models';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AuthExpiredError } from '../lib/edgeFunctionClient';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';


type Mode = 'packing' | 'chat';
type Step = 'input' | 'review' | 'results';


// ---------------------------------------------------------------------------
// Draft persistence helpers (localStorage, 24h expiry)
// ---------------------------------------------------------------------------
const DRAFT_KEY = 'gv_assistant_draft';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DraftState {
  plan: AIPlan | null;
  step: Step;
  input: string;
  reviewItems: ReviewItem[];
  selections: [string, string][];
  savedAt: number;
}

function readDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft: DraftState = JSON.parse(raw);
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function writeDraft(state: Omit<DraftState, 'savedAt'>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {
    // Quota exceeded or private mode — silently ignore
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AIAssistantPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const catalog = useLiveQuery(() => db.gearItems.toArray(), [], [] as GearItem[]);
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);


  // Mode detection
  const [mode, setMode] = useState<Mode>('packing');

  // Packing list state — lazy-initialised from localStorage draft (24h TTL)
  const _draft = readDraft();
  const [input, setInput] = useState(() => _draft?.input ?? '');
  const [step, setStep] = useState<Step>(() => _draft?.step ?? 'input');
  const [plan, setPlan] = useState<AIPlan | null>(() => _draft?.plan ?? null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(() => _draft?.reviewItems ?? []);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selections, setSelections] = useState<Map<string, string>>(
    () => new Map(_draft?.selections ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [headerAnimating, setHeaderAnimating] = useState(false);


  // Chat state
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPhotoRef = useRef<HTMLInputElement>(null);

  // Pending photo attachment for chat
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string>(''); // small preview for display
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string>(''); // full-res compressed for AI


  // Swipe-to-delete state for chat history
  const [openSessionActionsId, setOpenSessionActionsId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);

  // Swipe-to-delete state for packing list items
  const [openPackingItemKey, setOpenPackingItemKey] = useState<string | null>(null);
  const [packTouchStartX, setPackTouchStartX] = useState<number | null>(null);
  const [packTouchCurrentX, setPackTouchCurrentX] = useState<number | null>(null);


  // Auto-hide input bar on scroll (chat mode only)
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [inputBarHidden, setInputBarHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  // Sidebar (chat history) state
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Shared state
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');

  // Closing animation for sidebar
  const { closing: closingSidebar, dismiss: dismissSidebar, onAnimationEnd: onSidebarAnimEnd } = useSheetDismiss(() => { setShowSidebar(false); setSidebarSearch(''); });

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (showSidebar) {
      lockSheetScroll();
    } else {
      unlockSheetScroll();
    }
    return () => unlockSheetScroll();
  }, [showSidebar]);


  // ---------------------------------------------------------------------------
  // Load chat sessions on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void loadAllChatSessions().then(setChatSessions);
  }, []);


  // ---------------------------------------------------------------------------
  // Auto-scroll chat to bottom
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode === 'chat' && currentSession) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mode, currentSession?.messages.length]);


  // ---------------------------------------------------------------------------
  // Persist packing draft to localStorage whenever relevant state changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (step === 'input' && !plan && !input) {
      // Nothing worth saving — avoid writing an empty draft
      return;
    }
    writeDraft({
      plan,
      step,
      input,
      reviewItems,
      selections: Array.from(selections.entries()),
    });
  }, [plan, step, input, reviewItems, selections]);


  // ---------------------------------------------------------------------------
  // Header animation trigger
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode === 'packing' && step === 'results' && plan) {
      setHeaderAnimating(true);
      const timer = setTimeout(() => setHeaderAnimating(false), 100);
      return () => clearTimeout(timer);
    }
  }, [mode, step, plan]);


  // ---------------------------------------------------------------------------
  // Cleanup keyboard-open class on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('keyboard-open');
    };
  }, []);


  // ---------------------------------------------------------------------------
  // Auto-hide input bar on scroll (chat mode only)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || mode !== 'chat' || !currentSession) return;


    function handleScroll() {
      // Don't hide when keyboard is open
      if (document.documentElement.classList.contains('keyboard-open')) return;


      const currentScrollTop = scrollAreaRef.current?.scrollTop ?? 0;
      const delta = currentScrollTop - lastScrollTopRef.current;


      // Show on scroll up (>10px), hide on scroll down (>10px)
      if (delta > 10 && !inputBarHidden) {
        setInputBarHidden(true);
      } else if (delta < -10 && inputBarHidden) {
        setInputBarHidden(false);
      }


      lastScrollTopRef.current = currentScrollTop;
    }


    scrollArea.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollArea.removeEventListener('scroll', handleScroll);
  }, [mode, currentSession, inputBarHidden]);


  // ---------------------------------------------------------------------------
  // Detect mode from input
  // ---------------------------------------------------------------------------
  function detectMode(text: string): Mode {
    const lower = text.toLowerCase().trim();
    
    // Check for question patterns
    if (text.includes('?')) return 'chat';
    if (/^(what|which|how|why|when|where|can|should|is|are|do|does)/i.test(lower)) return 'chat';
    if (/\b(recommend|suggest|advice|help|explain|tell me|compare)\b/i.test(lower)) return 'chat';
    
    // Default to packing list
    return 'packing';
  }


  // ---------------------------------------------------------------------------
  // Touch handlers for swipe-to-delete (chat history)
  // ---------------------------------------------------------------------------
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    setTouchStartX(e.touches[0]?.clientX ?? null);
    setTouchCurrentX(e.touches[0]?.clientX ?? null);
  }


  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    setTouchCurrentX(e.touches[0]?.clientX ?? null);
  }


  function onTouchEnd(sessionId: string) {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile || touchStartX == null || touchCurrentX == null) {
      setTouchStartX(null);
      setTouchCurrentX(null);
      return;
    }


    const deltaX = touchCurrentX - touchStartX;
    if (deltaX < -40) {
      setOpenSessionActionsId(sessionId);
    } else if (deltaX > 40) {
      setOpenSessionActionsId(null);
    }


    setTouchStartX(null);
    setTouchCurrentX(null);
  }


  // ---------------------------------------------------------------------------
  // Touch handlers for swipe-to-delete (packing list items)
  // ---------------------------------------------------------------------------
  function onPackTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    setPackTouchStartX(e.touches[0]?.clientX ?? null);
    setPackTouchCurrentX(e.touches[0]?.clientX ?? null);
  }

  function onPackTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    setPackTouchCurrentX(e.touches[0]?.clientX ?? null);
  }

  function onPackTouchEnd(itemKey: string) {
    if (packTouchStartX == null || packTouchCurrentX == null) {
      setPackTouchStartX(null);
      setPackTouchCurrentX(null);
      return;
    }

    const deltaX = packTouchCurrentX - packTouchStartX;

    // Full swipe left (>= 150px) — auto delete immediately
    if (deltaX < -150) {
      handleRemovePackingItem(itemKey);
    } else if (deltaX < -40) {
      // Partial swipe — reveal trash pill
      setOpenPackingItemKey(itemKey);
    } else if (deltaX > 40) {
      // Swipe right — close actions
      setOpenPackingItemKey(null);
    }

    setPackTouchStartX(null);
    setPackTouchCurrentX(null);
  }

  function handleRemovePackingItem(itemKey: string) {
    setPlan(prev =>
      prev
        ? {
            ...prev,
            checklist: prev.checklist.filter(
              i => `${i.name}-${i.gearItemId ?? 'x'}` !== itemKey,
            ),
          }
        : prev,
    );
    setOpenPackingItemKey(null);
  }


  // ---------------------------------------------------------------------------
  // Handle input submission
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    if ((!input.trim() && !pendingPhotoDataUrl) || loading) return;


    // Set loading FIRST — this protects the auth guard from wiping the page.
    setLoading(true);
    setError('');


    // Pre-flight: verify a session exists at all (local check, no side effects)
    {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setLoading(false);
        setError('Please sign in to use AI features.');
        return;
      }
    }


    // Force chat mode if photo is attached or if text matches chat pattern
    const detectedMode = pendingPhotoDataUrl ? 'chat' : detectMode(input);
    setMode(detectedMode);


    if (detectedMode === 'chat') {
      await handleChatSubmit();
    } else {
      await handlePackingSubmit();
    }
  }


  // ---------------------------------------------------------------------------
  // Chat: Handle photo selection
  // ---------------------------------------------------------------------------
  async function handleChatPhotoSelected(file: File | undefined) {
    if (!file) return;
    if (file.size > 15_000_000) {
      setError('Photo too large. Keep under 15MB.');
      return;
    }

    try {
      // Generate small thumbnail for display (200px) and full-res for AI (768px)
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
  }

  function clearPendingPhoto() {
    setPendingPhotoPreview('');
    setPendingPhotoDataUrl('');
  }


  // ---------------------------------------------------------------------------
  // Chat: Send message
  // ---------------------------------------------------------------------------
  async function handleChatSubmit() {
    const hasText = input.trim().length > 0;
    const hasImage = Boolean(pendingPhotoDataUrl);
    if ((!hasText && !hasImage) || loading) return;


    setLoading(true);
    setError('');
    setIsTyping(true);

    // Capture pending photo before clearing
    const imageDataUrl = pendingPhotoDataUrl;
    const imagePreview = pendingPhotoPreview;

    // Clear pending photo immediately
    setPendingPhotoPreview('');
    setPendingPhotoDataUrl('');

    try {
      // Create or update session
      let session = currentSession;
      
      if (!session) {
        const title = generateChatTitle(input.trim() || 'Photo identification');
        session = createChatSession(title);
        setCurrentSession(session);
      }


      // Add user message (with optional thumbnail for display)
      const messageText = input.trim() || (imagePreview ? 'What is this gear?' : '');
      const userMessage = createChatMessage('user', messageText);
      if (imagePreview) {
        userMessage.imagePreview = imagePreview;
      }
      session.messages.push(userMessage);
      setCurrentSession({ ...session });
      setInput('');


      // Get AI response — pass full-res image for vision
      const response = await sendChatMessage(session.messages, catalog, imageDataUrl || undefined);


      // Add assistant message
      const assistantMessage = createChatMessage('assistant', response);
      session.messages.push(assistantMessage);
      session.updatedAt = new Date().toISOString();
      
      setCurrentSession({ ...session });
      
      // Save to database
      await saveChatSession(session);
      
      // Update sessions list
      const sessions = await loadAllChatSessions();
      setChatSessions(sessions);
      
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }


  // ---------------------------------------------------------------------------
  // Packing: Generate plan
  // ---------------------------------------------------------------------------
  async function handlePackingSubmit() {
    if (!input.trim() || !settings || loading) return;


    setLoading(true);
    setLoadingMessage('Classifying gear items…');
    setError('');


    try {
      // First, classify any pending items
      await classifyPendingItems();
      
      setLoadingMessage('Generating your packing list…');
      
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const provider = await getProvider(settings);


      const rawPlan = await provider.generatePlan({
        eventDescription: input,
        catalog,
        patterns,
      });


      // ------------------------------------------------------------------
      // Snapshot checklist BEFORE guards run — used later to detect stripped items
      // so we can remove pro tips that reference excluded gear.
      // ------------------------------------------------------------------
      const preGuardChecklist = [...rawPlan.checklist];

      // ------------------------------------------------------------------
      // Safety guard: Ensure at least one video-first camera is PRIMARY for video events.
      // NOTE: "corporate" is intentionally excluded from the video event check —
      // corporate events can be photo-only. We rely on the prompt + photo-only rule instead.
      // ------------------------------------------------------------------
      const isPhotoOnly = /photo[\s-]*(only|required)|only photo/i.test(input);
      const isVideoEvent = !isPhotoOnly && /\bvideo\b|\binterview\b/i.test(rawPlan.eventType);
      if (isVideoEvent) {
        const cameraBodies = rawPlan.checklist.filter(item => item.section === 'Camera Bodies');
        const hasVideoFirstPrimary = cameraBodies.some(item => {
          const matchedItem = catalog.find(c => c.id === item.gearItemId);
          return matchedItem?.inferredProfile === 'video_first' && item.role === 'primary';
        });
        
        if (!hasVideoFirstPrimary) {
          const videoFirstBody = cameraBodies.find(item => {
            const matchedItem = catalog.find(c => c.id === item.gearItemId);
            return matchedItem?.inferredProfile === 'video_first';
          });
          
          if (videoFirstBody) {
            videoFirstBody.role = 'primary';
          }
        }
      }

      // ------------------------------------------------------------------
      // Safety guard: For photo-only events, demote video_first/cinema
      // cameras from primary to backup. Gemini ignores the prompt rule
      // reliably enough, so we enforce it deterministically here.
      // ------------------------------------------------------------------
      if (isPhotoOnly) {
        rawPlan.checklist = rawPlan.checklist.map(item => {
          const gear = catalog.find(c => c.id === item.gearItemId);
          if (
            item.section === 'Camera Bodies' &&
            (gear?.inferredProfile === 'video_first' || gear?.inferredProfile === 'cinema') &&
            item.role === 'primary'
          ) {
            return { ...item, role: 'backup' };
          }
          return item;
        });

        // After demotion, ensure at least one camera body is still primary
        const cameraBodies = rawPlan.checklist.filter(i => i.section === 'Camera Bodies');
        const hasPrimary = cameraBodies.some(i => i.role === 'primary');
        if (!hasPrimary && cameraBodies.length > 0) {
          const best =
            cameraBodies.find(i => {
              const gear = catalog.find(c => c.id === i.gearItemId);
              return gear?.inferredProfile === 'hybrid' || gear?.inferredProfile === 'photo_first';
            }) ?? cameraBodies[0];
          best.role = 'primary';
        }
      }

      // ------------------------------------------------------------------
      // Safety guard: Photo-only → strip all audio gear
      // ------------------------------------------------------------------
      if (isPhotoOnly) {
        rawPlan.checklist = rawPlan.checklist.filter(item => item.section !== 'Audio');
      }

      // ------------------------------------------------------------------
      // Safety guard: Corporate/interview/documentary → strip cinematic
      // accessories (diffusion, mist, bloom filters)
      // ------------------------------------------------------------------
      const isCorporateClean = /corporate|interview|documentary/i.test(rawPlan.eventType ?? '');
      if (isCorporateClean) {
        rawPlan.checklist = rawPlan.checklist.filter(item => {
          const gear = catalog.find(c => c.id === item.gearItemId);
          return !(
            gear?.inferredProfile === 'accessory' &&
            gear?.strengths?.includes('cinematic-look')
          );
        });
      }

      // ------------------------------------------------------------------
      // Safety guard: Swap APS-C lenses when primary body is full-frame
      // ------------------------------------------------------------------
      const primaryFFBodies = rawPlan.checklist.filter(item => {
        const gear = catalog.find(c => c.id === item.gearItemId);
        return item.section === 'Camera Bodies' &&
          item.role === 'primary' &&
          gear?.strengths?.includes('sensor-fullframe');
      });
      if (primaryFFBodies.length > 0) {
        const primaryMounts = new Set(
          primaryFFBodies.flatMap(item => {
            const gear = catalog.find(c => c.id === item.gearItemId);
            return (gear?.strengths ?? []).filter(s => s.startsWith('mount-'));
          })
        );
        const usedIds = new Set(rawPlan.checklist.map(i => i.gearItemId).filter(Boolean) as string[]);
        rawPlan.checklist = rawPlan.checklist.map(item => {
          const gear = catalog.find(c => c.id === item.gearItemId);
          if (item.section !== 'Lenses') return item;
          if (!gear?.strengths?.includes('sensor-apsc')) return item;
          const mount = gear.strengths.find(s => s.startsWith('mount-'));
          if (!mount || !primaryMounts.has(mount)) return item;
          // APS-C lens on a FF primary body — find a FF replacement
          const ffReplacement = catalog.find(c =>
            c.id !== item.gearItemId &&
            !usedIds.has(c.id) &&
            c.categoryId === gear.categoryId &&
            c.strengths?.includes('sensor-fullframe') &&
            c.strengths?.includes(mount)
          );
          if (ffReplacement) {
            console.log(`[Safety Guard] Swapping APS-C lens ${gear.name} → ${ffReplacement.name}`);
            usedIds.add(ffReplacement.id);
            usedIds.delete(item.gearItemId!);
            return { ...item, gearItemId: ffReplacement.id, name: ffReplacement.name };
          }
          return item;
        });
      }

      // ------------------------------------------------------------------
      // Safety guard: Discreet/invisible shooting → strip support gear
      // ------------------------------------------------------------------
      const isDiscreet = /invisible|discreet|unobtrusive|stealth/i.test(input);
      if (isDiscreet) {
        rawPlan.checklist = rawPlan.checklist.filter(item => item.section !== 'Support');
      }

      // ------------------------------------------------------------------
      // Post-guard: Filter pro tips that reference gear stripped by guards.
      // Gemini writes tips before guards run, so tips may mention excluded items.
      // We remove any tip whose text contains the name of a stripped item.
      // ------------------------------------------------------------------
      if (rawPlan.tips && rawPlan.tips.length > 0) {
        const keptIds = new Set(rawPlan.checklist.map(i => i.gearItemId).filter(Boolean));
        const strippedNames = preGuardChecklist
          .filter(item => item.gearItemId && !keptIds.has(item.gearItemId))
          .map(item => item.name.toLowerCase());
        if (strippedNames.length > 0) {
          rawPlan.tips = rawPlan.tips.filter(tip =>
            !strippedNames.some(name => tip.toLowerCase().includes(name))
          );
        }
      }

      // ------------------------------------------------------------------
      // Client-side catalog matcher
      // ------------------------------------------------------------------
      setLoadingMessage('Matching items to your catalog…');


      const itemsNeedingReview: ReviewItem[] = [];
      const resolvedChecklist: AIPlan['checklist'] = [];
      const lowConfidenceMissing: AIPlan['missingItems'] = [];


      for (const item of rawPlan.checklist) {
        const match = matchCatalogItem(item.name, item.gearItemId, catalog);


        if (match.confidence === 'high') {
          resolvedChecklist.push({
            ...item,
            gearItemId: match.bestMatch?.id ?? item.gearItemId,
          });
        } else if (match.confidence === 'medium') {
          itemsNeedingReview.push({
            key: item.name,
            aiName: item.name,
            candidates: match.candidates ?? [],
            quantity: item.quantity,
            notes: item.notes,
            priority: item.priority,
            section: item.section,
          });
          resolvedChecklist.push({ ...item, gearItemId: null });
        } else {
          lowConfidenceMissing.push({
            name: item.name,
            reason: item.notes || 'Recommended for this event but not found in your catalog',
            priority: item.priority,
            action: 'rent',
            category: item.section,
          });
        }
      }


      const processedPlan: AIPlan = {
        ...rawPlan,
        checklist: resolvedChecklist,
        missingItems: [...rawPlan.missingItems, ...lowConfidenceMissing],
      };
      setPlan(processedPlan);


      if (itemsNeedingReview.length > 0) {
        setReviewItems(itemsNeedingReview);
        setSelections(new Map());
        setReviewOpen(true);
        setStep('review');
      } else {
        setStep('results');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }


  // ---------------------------------------------------------------------------
  // Apply user review selections → patch plan → show results
  // ---------------------------------------------------------------------------
  function handleReviewConfirm() {
    if (!plan) return;


    const additionalMissing: AIPlan['missingItems'] = [];


    const updatedChecklist = plan.checklist.map((item) => {
      const userChoice = selections.get(item.name);
      if (!userChoice) return item;


      if (userChoice === '__MISSING__') {
        additionalMissing.push({
          name: item.name,
          reason: 'Not found in your catalog (confirmed by you)',
          priority: item.priority,
          action: 'borrow',
        });
        return null;
      }


      return { ...item, gearItemId: userChoice };
    });


    setPlan({
      ...plan,
      checklist: updatedChecklist.filter((i): i is NonNullable<typeof i> => i !== null),
      missingItems: [...plan.missingItems, ...additionalMissing],
    });


    setReviewOpen(false);
    setStep('results');
  }


  // ---------------------------------------------------------------------------
  // Persist event (explicit user action)
  // ---------------------------------------------------------------------------
  async function handleCreateEvent() {
    if (!plan || !settings || saving) return;


    setSaving(true);
    try {
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const event = toEventFromPlan(plan, {
        eventDescription: input,
        catalog,
        patterns,
      });


      await db.events.add(event);
      clearDraft();
      navigate(`/events/${event.id}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }


  // ---------------------------------------------------------------------------
  // Chat: New conversation
  // ---------------------------------------------------------------------------
  function handleNewChat() {
    setCurrentSession(null);
    setInput('');
    setError('');
    setMode('packing');
    closeHistorySheet();
  }


  // ---------------------------------------------------------------------------
  // Chat: Load session
  // ---------------------------------------------------------------------------
  async function handleLoadSession(sessionId: string) {
    const sessions = await loadAllChatSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSession(session);
      setMode('chat');
      closeHistorySheet();
    }
  }


  // ---------------------------------------------------------------------------
  // Chat: Delete session
  // ---------------------------------------------------------------------------
  async function handleDeleteSession(sessionId: string) {
    if (!window.confirm('Delete this chat session?')) return;
    setOpenSessionActionsId(null);
    await deleteChatSession(sessionId);
    const sessions = await loadAllChatSessions();
    setChatSessions(sessions);
    if (currentSession?.id === sessionId) {
      handleNewChat();
    }
  }


  // ---------------------------------------------------------------------------
  // History sidebar helpers
  // ---------------------------------------------------------------------------
  function closeHistorySheet() {
    dismissSidebar();
  }


  // ---------------------------------------------------------------------------
  // Reset packing list
  // ---------------------------------------------------------------------------
  function handleReset() {
    clearDraft();
    setStep('input');
    setInput('');
    setPlan(null);
    setReviewItems([]);
    setSelections(new Map());
    setError('');
    setLoading(false);
    setMode('packing');
  }


  // ---------------------------------------------------------------------------
  // Derived stats for results header
  // ---------------------------------------------------------------------------
  const resultStats = useMemo(() => {
    if (!plan) return null;
    return {
      totalItems: plan.checklist.length,
      missingCount: plan.missingItems.length,
    };
  }, [plan]);


  // ---------------------------------------------------------------------------
  // Group checklist items by section (memoised)
  // ---------------------------------------------------------------------------
  const groupedItems = useMemo(() => {
    if (!plan) return {};
    return groupBySection(
      plan.checklist.map((i) => ({ ...i, section: i.section ?? 'Misc' })),
    );
  }, [plan]);


  // ---------------------------------------------------------------------------
  // Filtered sessions for sidebar search
  // ---------------------------------------------------------------------------
  const filteredSessions = useMemo(() => {
    if (!sidebarSearch.trim()) return chatSessions;
    const q = sidebarSearch.toLowerCase();
    return chatSessions.filter(s => s.title.toLowerCase().includes(q));
  }, [chatSessions, sidebarSearch]);


  // ---------------------------------------------------------------------------
  // Empty catalog guard
  // ---------------------------------------------------------------------------
  if (catalog.length === 0) {
    return (
      <section className="ai-page ios-theme">
        <header className="ai-ios-header">
          <div className="ai-ios-header-top">
            <h1 className="ai-ios-title">Assistant</h1>
          </div>
        </header>
        <div className="ai-ios-content">
          <div className="ai-ios-empty">
            <div className="stack-sm" style={{ textAlign: 'center' }}>
              <h3>Add gear first</h3>
              <p className="subtle">
                The AI needs your gear catalog to generate smart packing lists and answer questions.
              </p>
              <button className="ai-ios-text-btn" onClick={() => navigate('/catalog')}>Go to Catalog</button>
            </div>
          </div>
        </div>
      </section>
    );
  }


  // ---------------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------------
  if (authLoading) {
    return (
      <section className="ai-page ios-theme">
        <header className="ai-ios-header">
          <div className="ai-ios-header-top">
            <h1 className="ai-ios-title">Assistant</h1>
          </div>
        </header>
        <div className="ai-ios-content">
          <div className="ai-ios-empty">
            <p className="subtle">Checking authentication...</p>
          </div>
        </div>
      </section>
    );
  }


  if (!user && !loading && !error) {
    return (
      <section className="ai-page ios-theme">
        <header className="ai-ios-header">
          <div className="ai-ios-header-top">
            <h1 className="ai-ios-title">Assistant</h1>
          </div>
        </header>
        <div className="ai-ios-content">
          <div className="ai-ios-empty">
            <div className="stack-sm" style={{ textAlign: 'center' }}>
              <h3>Authentication Required</h3>
              <p className="subtle">
                AI features require authentication to keep your data secure.
                Please log in to continue.
              </p>
              <button className="ai-ios-text-btn" type="button" onClick={() => navigate('/login')}>Go to Login</button>
            </div>
          </div>
        </div>
      </section>
    );
  }


  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="ai-page ios-theme">
      {/* -- FLOATING BAR -- */}
      <div className="ai-floating-bar" style={{ pointerEvents: 'none' }}>
        {/* Hamburger — opens sidebar */}
        <button
          className="ai-circle-btn"
          style={{ pointerEvents: 'auto' }}
          onClick={() => setShowSidebar(true)}
          aria-label="Chat history"
        >
          {/* 3 staggered lines: long, medium, short */}
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
            <line x1="1" y1="2" x2="17" y2="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="1" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Title pill */}
        <div className="ai-title-pill" style={{ pointerEvents: 'auto' }}>
          <span>Assistant</span>
        </div>

        {/* Temp-chat button — placeholder, no functionality yet */}
        <button
          className="ai-circle-btn ai-circle-btn--dashed"
          style={{ pointerEvents: 'auto' }}
          aria-label="Temporary chat (coming soon)"
          disabled
        >
          {/* Circular arrows icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>


      {/* -- SCROLL AREA -- */}
      <div className="ai-ios-content page-scroll-area" ref={scrollAreaRef}>
        
        {/* Initial empty state */}
        {mode === 'packing' && step === 'input' && !loading && !plan && (
          <div className="ai-ios-empty">
            <div className="ai-ios-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                 <path d="M12 3 L14.5 8.5 L20 9.5 L16 13.5 L17 19 L12 16.5 L7 19 L8 13.5 L4 9.5 L9.5 8.5 Z" />
              </svg>
            </div>
            <p className="subtle">Describe your shoot or ask about your gear</p>
          </div>
        )}


        {/* Packing: Loading state */}
        {loading && mode === 'packing' && (
          <div className="ai-ios-loading">
            <div className="ai-spinner">✦</div>
            <p className="subtle">{loadingMessage}</p>
          </div>
        )}


        {/* Packing: Results */}
        {mode === 'packing' && step === 'results' && plan && !loading && (
          <div className="ai-ios-results">
            {/* Results Header Card */}
            <div className={`ai-ios-card ai-ios-result-header${headerAnimating ? ' entering' : ''}`}>
              <div className="row between wrap">
                <div>
                  <h2 className="ai-ios-result-title">{plan.eventTitle}</h2>
                  <p className="ai-ios-result-subtitle">{plan.eventType}</p>
                </div>
                <button type="button" className="ai-ios-text-btn" onClick={handleReset}>
                  New prompt
                </button>
              </div>
              {resultStats && (
                <p className="ai-ios-result-stats">
                  {resultStats.totalItems} items from catalog
                  {resultStats.missingCount > 0 && (
                    <> · {resultStats.missingCount} missing</>
                  )}
                </p>
              )}
            </div>


            {/* Section cards */}
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section} className="ai-ios-list-group">
                <div className="ai-ios-list-header">
                   <h3>{section}</h3>
                </div>
                <div className="ai-ios-list-body">
                  {items.map((item) => {
                    const showRoleBadge = (section === 'Camera Bodies' || section === 'Audio') && 
                                          item.role && 
                                          item.role !== 'standard';
                    const itemKey = `${item.name}-${item.gearItemId ?? 'x'}`;
                    const isOpen = openPackingItemKey === itemKey;
                    
                    return (
                      <div
                        key={itemKey}
                        className="ai-packing-swipe-row"
                        onTouchStart={onPackTouchStart}
                        onTouchMove={onPackTouchMove}
                        onTouchEnd={() => onPackTouchEnd(itemKey)}
                      >
                        {/* Background trash action */}
                        <div className="ai-packing-swipe-actions">
                          <button
                            type="button"
                            className="ai-packing-swipe-delete-btn"
                            onClick={() => handleRemovePackingItem(itemKey)}
                            aria-label="Remove item"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </div>

                        {/* Foreground item content */}
                        <div className={`ai-packing-swipe-foreground ai-ios-list-item${isOpen ? ' is-open' : ''}`}>
                          <div className="ai-ios-item-content">
                            <div className="row wrap" style={{ gap: '0.4rem', alignItems: 'center' }}>
                              <span className="ai-ios-item-name">{item.name}</span>
                              {item.quantity > 1 && (
                                <span className="ai-ios-badge">×{item.quantity}</span>
                              )}
                              {showRoleBadge && (
                                <span className={`ai-ios-badge role-${item.role}`}>
                                  {item.role}
                                </span>
                              )}
                              {item.gearItemId && (
                                <span className="ai-ios-badge success">✓ matched</span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="ai-ios-item-note">{item.notes}</p>
                            )}
                          </div>
                          <span className={`ai-ios-priority-dot priority-${item.priority}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}


            {/* Missing items */}
            {plan.missingItems.length > 0 && (
              <div className="ai-ios-list-group">
                <div className="ai-ios-list-header warning">
                  <h3>⚠ Considerations</h3>
                </div>
                <div className="ai-ios-list-body">
                  {[...plan.missingItems]
                    .sort((a, b) => {
                      const r: Record<string, number> = { 'must-have': 0, 'nice-to-have': 1, optional: 2 };
                      return (r[a.priority] ?? 2) - (r[b.priority] ?? 2);
                    })
                    .map((item) => (
                      <div key={item.name} className="ai-ios-list-item">
                        <div className="ai-ios-item-content">
                          <span className="ai-ios-item-name">{item.name}</span>
                          <p className="ai-ios-item-note">{item.reason}</p>
                          {item.notes && (
                            <p className="ai-ios-item-note subtle">Est: {item.notes}</p>
                          )}
                        </div>
                        <div className="stack-sm" style={{ alignItems: 'flex-end', gap: '4px' }}>
                           <span className={`ai-ios-priority-tag priority-${item.priority}`}>
                              {priorityLabel(item.priority)}
                           </span>
                           <span className="ai-ios-action-tag">{item.action}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}


            {/* Pro tips */}
            {plan.tips && plan.tips.length > 0 && (
              <div className="ai-ios-card">
                <h4 className="ai-ios-section-title">Pro Tips</h4>
                <ul className="ai-ios-tips-list">
                  {plan.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}


            {/* Create event CTA */}
            <div className="ai-ios-card">
              <h4 className="ai-ios-section-title">Ready to pack?</h4>
              <p className="ai-ios-card-text">
                Create an event to save this as a checklist you can tick off while packing.
              </p>
              <button
                type="button"
                className="ai-ios-primary-btn"
                onClick={() => void handleCreateEvent()}
                disabled={saving}
              >
                {saving ? 'Creating event…' : 'Create Event & Checklist'}
              </button>
            </div>
            
            <div className="ai-ios-bottom-spacer" />
          </div>
        )}


        {/* Chat: Messages */}
        {mode === 'chat' && currentSession && (
          <div className="ai-ios-chat-stream">
            {currentSession.messages
              .filter(m => m.role !== 'system')
              .map((message) => (
                <div
                  key={message.id}
                  className={`ai-ios-bubble ${message.role}`}
                >
                  {message.imagePreview && (
                    <img
                      src={message.imagePreview}
                      alt="Attached photo"
                      className="ai-ios-bubble-image"
                    />
                  )}
                  <div className="ai-ios-bubble-content">{message.content}</div>
                </div>
              ))}
            {isTyping && (
              <div className="ai-ios-bubble assistant typing">
                <div className="ai-typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
            <div className="ai-ios-bottom-spacer" />
          </div>
        )}


        {/* Chat: Empty state */}
        {mode === 'chat' && !currentSession && !loading && (
          <div className="ai-ios-empty">
            <p className="subtle">Start a conversation about your gear</p>
          </div>
        )}


      </div>


      {/* -- FIXED INPUT BAR -- */}
      {!(mode === 'packing' && step === 'results') && (
        <div className={`ai-ios-input-bar${inputBarHidden ? ' hidden' : ''}`}>
          {error && <p className="ai-input-error">{error}</p>}
          {pendingPhotoPreview && (
            <div className="ai-ios-input-photo-preview">
              <img src={pendingPhotoPreview} alt="Attached" />
              <button
                type="button"
                className="ai-ios-input-photo-remove"
                onClick={clearPendingPhoto}
                aria-label="Remove photo"
              >
                &#10005;
              </button>
            </div>
          )}
          <div className="ai-ios-input-pill">
            <button
              type="button"
              className="ai-ios-photo-btn"
              onClick={() => chatPhotoRef.current?.click()}
              disabled={loading}
              aria-label="Attach photo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </button>
            <ContentEditableInput
              placeholder={pendingPhotoDataUrl ? "Ask about this photo..." : "Describe your shoot or ask a question..."}
              value={input}
              onChange={setInput}
              multiline
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              onFocus={() => document.documentElement.classList.add('keyboard-open')}
              onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              disabled={loading}
            />
            <button 
              className="ai-ios-send-btn"
              onClick={() => void handleSubmit()}
              disabled={loading || (!input.trim() && !pendingPhotoDataUrl)}
              aria-label="Send message"
            >
              {loading ? (
                <span className="ai-spinner-small">&#10022;</span>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
          {/* Hidden file input for chat photo attachment */}
          <input
            ref={chatPhotoRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              void handleChatPhotoSelected(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}


      {/* -- CHAT HISTORY SIDEBAR -- */}
      {showSidebar && (
        <>
          <div
            className={`ai-sidebar-backdrop${closingSidebar ? ' closing' : ''}`}
            onClick={dismissSidebar}
          />
          <div
            className={`ai-sidebar${closingSidebar ? ' closing' : ''}`}
            aria-label="Chat history"
            onAnimationEnd={onSidebarAnimEnd}
          >
            {/* Top row: search pill + new-chat button */}
            <div className="ai-sidebar-top">
              <div className="ai-sidebar-search-bar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="search"
                  placeholder="Search"
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="ai-sidebar-new-btn"
                onClick={handleNewChat}
                aria-label="New chat"
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Session list */}
            <div className="ai-sidebar-list">
              {filteredSessions.length === 0 ? (
                <div className="ai-sidebar-empty">
                  <p>{sidebarSearch ? 'No matching chats' : 'No chat history yet'}</p>
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`chat-session-swipe-row ${openSessionActionsId === session.id ? 'is-open' : ''}`}
                  >
                    {/* Background delete action */}
                    <div className="chat-session-swipe-actions" aria-hidden={openSessionActionsId !== session.id}>
                      <button
                        type="button"
                        className="chat-session-action-btn chat-session-action-delete"
                        onClick={() => void handleDeleteSession(session.id)}
                        aria-label="Delete chat session"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>

                    {/* Foreground swipeable card */}
                    <div
                      className={`chat-session-item chat-session-swipe-foreground${currentSession?.id === session.id ? ' active' : ''}`}
                      onTouchStart={onTouchStart}
                      onTouchMove={onTouchMove}
                      onTouchEnd={() => onTouchEnd(session.id)}
                    >
                      <button
                        type="button"
                        className="chat-session-btn"
                        onClick={() => void handleLoadSession(session.id)}
                      >
                        <div>
                          <div className="chat-session-title">{session.title}</div>
                          <div className="chat-session-meta">
                            {session.messages.filter(m => m.role !== 'system').length} messages ·{' '}
                            {new Date(session.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}


      {/* -- REVIEW SHEET -- */}
      <CatalogMatchReviewSheet
        open={reviewOpen}
        items={reviewItems}
        selections={selections}
        onSelect={(key, value) =>
          setSelections((prev) => new Map(prev).set(key, value))
        }
        onConfirm={handleReviewConfirm}
        onCancel={() => {
          setReviewOpen(false);
          setStep('results');
        }}
      />
    </section>
  );
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function friendlyError(e: unknown): string {
  if (!(e instanceof Error)) return 'Something went wrong. Please try again.';
  if (e instanceof AuthExpiredError) return 'Your session has expired. Please sign in again to use AI features.';
  if (e.message.includes('Authentication') || e.message.includes('expired') || e.message.includes('sign in')) {
    return 'Your session has expired. Please sign in again to use AI features.';
  }
  if (e.message.includes('401')) return 'Invalid API key. Check Settings → AI Provider.';
  if (e.message.includes('429')) return 'Rate limit reached. Wait a moment and try again.';
  if (!navigator.onLine) return 'No internet connection. AI features require online access.';
  return e.message;
}
