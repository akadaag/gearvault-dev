import type { GearItem } from '../types/models';

// Balanced thresholds (agreed)
const HIGH_THRESHOLD = 0.80;
const MEDIUM_THRESHOLD = 0.60;

export interface MatchResult {
  confidence: 'high' | 'medium' | 'low';
  bestMatch?: GearItem;       // set when confidence === 'high'
  candidates?: GearItem[];    // top-3 when confidence === 'medium'
}

/**
 * Match an AI-suggested item name (+ optional AI-provided id hint)
 * against the user's gear catalog.
 *
 * high   (≥0.80) → auto-link, no user action needed
 * medium (≥0.60) → show top-3 candidates in review sheet
 * low    (<0.60) → treat as missing item
 */
export function matchCatalogItem(
  aiItemName: string,
  aiSuggestedId: string | null,
  catalog: GearItem[],
): MatchResult {
  if (catalog.length === 0) return { confidence: 'low' };

  // 1. Exact ID match — AI already resolved it correctly
  if (aiSuggestedId) {
    const exact = catalog.find((item) => item.id === aiSuggestedId);
    if (exact) return { confidence: 'high', bestMatch: exact };
  }

  // 2. Score every catalog item against the AI name
  const scored = catalog
    .map((item) => ({
      item,
      score: scoreItem(aiItemName, item),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return { confidence: 'low' };

  if (best.score >= HIGH_THRESHOLD) {
    return { confidence: 'high', bestMatch: best.item };
  }

  if (best.score >= MEDIUM_THRESHOLD) {
    return {
      confidence: 'medium',
      candidates: scored.slice(0, 3).map((s) => s.item),
    };
  }

  return { confidence: 'low' };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scoreItem(aiName: string, item: GearItem): number {
  const aiNorm = normalize(aiName);

  // Build a rich comparison string from all identifying fields
  const itemStr = normalize(
    [item.brand, item.name, item.model, ...(item.tags ?? [])].filter(Boolean).join(' '),
  );

  if (!itemStr) return 0;

  // Exact normalised match
  if (aiNorm === itemStr) return 1.0;

  // Substring containment (handles "Sony A7 IV" vs "Sony A7IV Body")
  if (itemStr.includes(aiNorm) || aiNorm.includes(itemStr)) return 0.87;

  // Token overlap — useful for multi-word names with different word order
  const tokenScore = tokenOverlap(aiNorm, itemStr);
  if (tokenScore >= 0.75) return tokenScore;

  // Levenshtein-based character similarity
  return levenshteinSimilarity(aiNorm, itemStr);
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // keep spaces for token splitting
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter((t) => t.length > 1));
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let shared = 0;
  tokensA.forEach((t) => {
    if (tokensB.has(t)) shared++;
  });

  return (2 * shared) / (tokensA.size + tokensB.size); // Sørensen–Dice
}

function levenshteinSimilarity(s1: string, s2: string): number {
  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length >= s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function levenshtein(s1: string, s2: string): number {
  const m = s2.length;
  const n = s1.length;

  // Use two rows to save memory
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s2[i - 1] === s1[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}
