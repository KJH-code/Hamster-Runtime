/**
 * 기록 저장 (localStorage). 저장이 안 되는 환경(사생활 보호 창 등)에서는 메모리에만 남는다.
 *  - 레벨별 최저 가격
 *  - 클리어한 레벨 (순서대로 해금: 앞 레벨을 깨면 다음이 열린다)
 */
const KEY = 'hamster-runtime:records:v1';

interface Records {
  best: Record<string, number>;
}

let memory: Records = { best: {} };
let loaded = false;

function load(): Records {
  if (loaded) return memory;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Records>;
      if (r && typeof r.best === 'object' && r.best) {
        for (const [k, v] of Object.entries(r.best)) if (typeof v === 'number' && Number.isFinite(v)) memory.best[k] = v;
      }
    }
  } catch {
    /* 저장소를 못 읽으면 빈 기록으로 */
  }
  return memory;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* 저장 실패 — 이번 세션 동안만 메모리에 남는다 */
  }
}

export function bestPrice(levelId: string): number | undefined {
  return load().best[levelId];
}

/** 클리어 기록. 새 최저 가격이면 true */
export function recordClear(levelId: string, price: number): boolean {
  const r = load();
  const prev = r.best[levelId];
  if (prev !== undefined && prev <= price) return false;
  r.best[levelId] = price;
  save();
  return true;
}

/** 순서대로 해금: 첫 레벨은 항상, 나머지는 바로 앞 레벨을 클리어했으면 */
export function isUnlocked(ids: string[], index: number): boolean {
  if (index <= 0) return true;
  return bestPrice(ids[index - 1]!) !== undefined;
}

const SEEN_KEY = 'hamster-runtime:tutorial-seen:v1';
let seenMemory = new Set<string>();
/** 안내를 끝까지 봤는가 (샌드박스용) */
export function tutorialSeen(id: string): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) for (const v of JSON.parse(raw) as string[]) seenMemory.add(v);
  } catch {
    /* 메모리만 */
  }
  return seenMemory.has(id);
}
export function markTutorialSeen(id: string): void {
  seenMemory.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenMemory]));
  } catch {
    /* 메모리만 */
  }
}

/** 테스트용 */
export function _resetForTest(): void {
  memory = { best: {} };
  loaded = false;
  seenMemory = new Set();
}
