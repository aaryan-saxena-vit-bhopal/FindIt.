'use strict';

const STOP = new Set(['the', 'and', 'with', 'for', 'near', 'from', 'was', 'has', 'have', 'this', 'that', 'item', 'lost', 'found']);

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

function score(a, b) {
  let s = 0;
  if (a.category.toLowerCase() === b.category.toLowerCase()) s += 3;
  s += 6 * jaccard(tokens(a.name), tokens(b.name));
  s += 2 * jaccard(tokens(a.location), tokens(b.location));
  s += 1 * jaccard(tokens(a.description), tokens(b.description));
  const days = Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 86400000;
  if (days <= 3) s += 1.5;
  else if (days <= 14) s += 0.75;
  return s;
}

const THRESHOLD = 3;

function rankMatches(item, candidates, limit = 5) {
  return candidates
    .map((c) => ({ candidate: c, score: score(item, c) }))
    .filter((r) => r.score >= THRESHOLD)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((r) => ({ ...r.candidate, matchScore: Math.round(r.score * 10) / 10 }));
}

module.exports = { rankMatches };
