/**
 * 기록 저장 (localStorage). 저장이 안 되는 환경(사생활 보호 창 등)에서는 메모리에만 남는다.
 *  - 레벨별 최저 가격과 그 풀이 코드 (공유 링크용), 그 풀이에 힌트를 썼는지
 *  - 레벨별 최단 클리어 시간 (가격과 따로), 그 판에 힌트를 썼는지
 *  - 클리어한 레벨 (순서대로 해금: 앞 레벨을 깨면 다음이 열린다)
 */
const KEY = 'hamster-runtime:records:v1';

interface Records {
  best: Record<string, number>;
  /** 최저 가격을 낸 풀이의 공유 코드 */
  sol: Record<string, string>;
  /** 최저 가격을 낸 풀이가 힌트(미노·부품 자리)를 봤는가 */
  hint: Record<string, boolean>;
  /** 최단 클리어 시간 (ms) */
  time: Record<string, number>;
  /** 최단 시간을 낸 판이 힌트를 봤는가 */
  timeHint: Record<string, boolean>;
}

let memory: Records = { best: {}, sol: {}, hint: {}, time: {}, timeHint: {} };
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
      if (r && typeof r.hint === 'object' && r.hint) {
        for (const [k, v] of Object.entries(r.hint)) if (v === true) memory.hint[k] = true;
      }
      if (r && typeof r.time === 'object' && r.time) {
        for (const [k, v] of Object.entries(r.time)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0) memory.time[k] = v;
      }
      if (r && typeof r.timeHint === 'object' && r.timeHint) {
        for (const [k, v] of Object.entries(r.timeHint)) if (v === true) memory.timeHint[k] = true;
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

/**
 * 클리어 기록. 새 최저 가격이면 true (풀이 코드도 같이 남긴다).
 * 힌트 표시는 최저 기록을 만든 판 기준: 같은 가격을 힌트 없이 다시 깨면 표시가 사라진다.
 */
export function recordClear(levelId: string, price: number, code?: string, hinted = false): boolean {
  const r = load();
  const prev = r.best[levelId];
  if (prev !== undefined && prev <= price) {
    if (prev === price && ((code && !r.sol[levelId]) || (!hinted && r.hint[levelId]))) {
      // 같은 가격: 아직 풀이가 없거나, 이번엔 힌트 없이 깼으면 이번 것으로
      if (code) r.sol[levelId] = code;
      if (!hinted) delete r.hint[levelId];
      save();
    }
    return false;
  }
  r.best[levelId] = price;
  if (code) r.sol[levelId] = code;
  if (hinted) r.hint[levelId] = true;
  else delete r.hint[levelId];
  save();
  return true;
}

/** 클리어 시간 기록. 새 최단이면 true. 같은 시간을 힌트 없이 내면 💡 표시가 사라진다 */
export function recordTime(levelId: string, ms: number, hinted = false): boolean {
  const r = load();
  const prev = r.time[levelId];
  if (prev !== undefined && prev <= ms) {
    if (prev === ms && !hinted && r.timeHint[levelId]) {
      delete r.timeHint[levelId];
      save();
    }
    return false;
  }
  r.time[levelId] = ms;
  if (hinted) r.timeHint[levelId] = true;
  else delete r.timeHint[levelId];
  save();
  return true;
}

export function bestTime(levelId: string): number | undefined {
  return load().time[levelId];
}

export function bestTimeHinted(levelId: string): boolean {
  return load().timeHint[levelId] === true;
}

/** 최저 기록 풀이에 힌트를 썼는가 */
export function bestHinted(levelId: string): boolean {
  return load().hint[levelId] === true;
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

/** 효과음 끔 (V). 기록과 따로 저장 */
const MUTE_KEY = 'hamster-runtime:mute';
let muted: boolean | null = null;
export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* 이번 세션만 */
  }
}

/** 테스트용 */
export function _resetForTest(): void {
  memory = { best: {}, sol: {}, hint: {}, time: {}, timeHint: {} };
  loaded = false;
}
