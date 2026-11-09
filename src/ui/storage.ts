/**
 * 기록 저장 (localStorage). 저장이 안 되는 환경(사생활 보호 창 등)에서는 메모리에만 남는다.
 *  - 레벨별 최저 가격과 그 풀이 코드 (공유 링크용)
 *  - 클리어한 레벨 (순서대로 해금: 앞 레벨을 깨면 다음이 열린다)
 */
const KEY = 'hamster-runtime:records:v1';

interface Records {
  best: Record<string, number>;
  /** 최저 가격을 낸 풀이의 공유 코드 */
  sol: Record<string, string>;
}

let memory: Records = { best: {}, sol: {} };
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
      if (r && typeof r.sol === 'object' && r.sol) {
        for (const [k, v] of Object.entries(r.sol)) if (typeof v === 'string') memory.sol[k] = v;
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

/** 클리어 기록. 새 최저 가격이면 true (풀이 코드도 같이 남긴다) */
export function recordClear(levelId: string, price: number, code?: string): boolean {
  const r = load();
  const prev = r.best[levelId];
  if (prev !== undefined && prev <= price) {
    // 같은 가격인데 아직 풀이가 없으면 남겨 둔다
    if (code && prev === price && !r.sol[levelId]) {
      r.sol[levelId] = code;
      save();
    }
    return false;
  }
  r.best[levelId] = price;
  if (code) r.sol[levelId] = code;
  save();
  return true;
}

/** 최저 기록 풀이의 공유 코드 */
export function bestCode(levelId: string): string | undefined {
  return load().sol[levelId];
}

/** 순서대로 해금: 첫 레벨은 항상, 나머지는 바로 앞 레벨을 클리어했으면 */
export function isUnlocked(ids: string[], index: number): boolean {
  if (index <= 0) return true;
  // 이미 깬 레벨은 계속 열려 있다 (앞에 새 레벨이 끼어들어도 기록이 잠기지 않게)
  return bestPrice(ids[index - 1]!) !== undefined || bestPrice(ids[index]!) !== undefined;
}

/** 테스트용 */
export function _resetForTest(): void {
  memory = { best: {}, sol: {} };
  loaded = false;
}
