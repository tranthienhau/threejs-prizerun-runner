// Local stand-in for the backend leaderboard. Entries are scoped to a course
// hash so different course versions never mix - mirroring the real schema
// runs(contest_id, course_hash, time_ms, status). Swap for a REST/WS call.

export type LbEntry = {
  name: string;
  timeMs: number;
  courseHash: string;
  version: string;
  verified: boolean;
  at: number;
};

const KEY = "prizerun:leaderboard:v1";

export function loadAll(): LbEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LbEntry[]) : [];
  } catch {
    return [];
  }
}

export function add(entry: LbEntry): void {
  const all = loadAll();
  all.push(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

// Verified runs for one course, fastest first; ties broken by earliest submit.
export function top(courseHash: string, n = 10): LbEntry[] {
  return loadAll()
    .filter((e) => e.verified && e.courseHash === courseHash)
    .sort((a, b) => a.timeMs - b.timeMs || a.at - b.at)
    .slice(0, n);
}
