export function fuzzyIncludes(source: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const s = source.toLowerCase();
  if (s.includes(q)) return true;

  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i += 1) {
    if (s[i] === q[qi]) qi += 1;
  }
  return qi === q.length;
}
