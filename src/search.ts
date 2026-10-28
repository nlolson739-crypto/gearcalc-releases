// Word-based search for monster and item names, so players can type what they call something: "nylo maiden" finds
// "Nylocas Matomenos · Normal Mode Maiden", "kq" finds "Kalphite Queen", "tob" finds the Theatre of Blood bosses.

/** Lower-case words, with letters and digits split apart ("p3" → "p", "3"). */
export const words = (s: string): string[] => s.toLowerCase()
  .replace(/['’]/g, '')
  .replace(/([a-z])(\d)|(\d)([a-z])/g, '$1$3 $2$4')
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

/** First letters of each word, e.g. "Kalphite Queen" → "kq" (only for names of two or more words). */
const initials = (ws: string[]) => (ws.length > 1 ? ws.map((w) => w[0]).join('') : '');

// Damerau-Levenshtein distance capped at 2, enough to forgive one slip ("verzk", "olmn").
function closeEnough(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length] <= 1;
}

/** How well one typed word matches one word of the name: 0 = not at all. */
function wordScore(q: string, w: string): number {
  if (w === q) return 4;
  if (w.startsWith(q)) return 3;
  if (q.length >= 3 && w.includes(q)) return 1.5;
  // one typo, compared against the same-length start of the word ("matomnos" vs "matomenos")
  if (q.length >= 4 && (closeEnough(q, w) || closeEnough(q, w.slice(0, q.length)))) return 1;
  return 0;
}

export interface Searchable {
  /** the words shown to the player, e.g. name and version */
  text: string;
  /** extra words that should also find it (raid name, nicknames) */
  tags?: string[];
}

interface Prepared<T> { item: T, name: string[], extra: string[], length: number }

/** Builds the search index once; call `run(query, limit)` on each keystroke. */
export function makeSearch<T>(items: T[], describe: (t: T) => Searchable) {
  const prepared: Prepared<T>[] = items.map((item) => {
    const d = describe(item);
    const name = words(d.text);
    const tagWords = (d.tags ?? []).flatMap((t) => { const w = words(t); return [...w, initials(w)]; });
    const extra = [initials(name), ...tagWords].filter(Boolean);
    return { item, name, extra, length: d.text.length };
  });

  return (query: string, limit: number): T[] => {
    const qs = words(query);
    if (!qs.length) return prepared.slice(0, limit).map((p) => p.item);
    const scored: { p: Prepared<T>, score: number }[] = [];
    for (const p of prepared) {
      let total = 0;
      let ok = true;
      for (const [qi, q] of qs.entries()) {
        let best = 0;
        for (const [wi, w] of p.name.entries()) {
          let s = wordScore(q, w);
          if (s && qi === 0 && wi === 0) s += 1; // first word typed is the start of the name
          best = Math.max(best, s);
        }
        for (const w of p.extra) best = Math.max(best, wordScore(q, w) * 0.8);
        if (!best) { ok = false; break; }
        total += best;
      }
      // among equal matches, the normal version first (most players mean normal mode)
      if (ok) scored.push({ p, score: total + (p.name.includes('normal') ? 0.2 : 0) });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.p.length - b.p.length)
      .slice(0, limit)
      .map((x) => x.p.item);
  };
}
