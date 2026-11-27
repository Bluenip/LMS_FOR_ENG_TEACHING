export interface PeerSubmission {
  submissionId: string;
  studentId: string;
}

export interface PeerPair {
  submissionId: string;
  reviewerId: string;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Derangement-based matching: authors are shuffled into a ring and reviewer i reviews the work of
 * author i+1, i+2, … i+k. Nobody reviews their own work, every submission gets exactly k reviews and
 * every student does exactly k reviews. k is capped at n−1.
 */
export function assignPeerReviewers(
  submissions: PeerSubmission[],
  reviewsPerStudent: number,
  rng: () => number = Math.random
): PeerPair[] {
  // one submission per author (latest given first wins)
  const byAuthor = new Map<string, PeerSubmission>();
  for (const s of submissions) if (!byAuthor.has(s.studentId)) byAuthor.set(s.studentId, s);
  const ring = shuffle(Array.from(byAuthor.values()), rng);
  const n = ring.length;
  if (n < 2) return [];
  const k = Math.max(1, Math.min(Math.floor(reviewsPerStudent), n - 1));
  const pairs: PeerPair[] = [];
  for (let i = 0; i < n; i++) {
    for (let r = 1; r <= k; r++) {
      pairs.push({ reviewerId: ring[i]!.studentId, submissionId: ring[(i + r) % n]!.submissionId });
    }
  }
  return pairs;
}
