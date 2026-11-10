/**
 * 오늘의 퍼즐 (데일리). 순수 로직: 날짜 문자열을 씨앗으로 매일 두 개를 만든다. 같은 날짜 → 모두 같은 퍼즐.
 * - 쉬움 (쌓기): 고정 장애물 몇 개를 둔 판에 미노를 무작위로 떨어뜨려 보고,
 *   햄스터가 빈 판과 다른 통으로 가는 길이 생기면 그것을 참조 풀이로 삼는다 (놓은 튜브를 전부 지나야 함).
 * - 어려움 (기계): 고정 갈림길(한 단 또는 두 단)에 스위치·센서·모터·기어를 무작위로 짜 보고,
 *   스위치만 고정해 둔 판으로는 안 풀리고 통을 둘 이상 쓰는 대기열이 나오면 채택.
 * 예산은 레벨과 같이 참조 풀이 × 2 (levelFromBoard).
 * 규칙에 없는 것은 쓰지 않는다: 지금 있는 미노 15종·부품 5종만.
 */
import type { PriceTable } from '../data/prices';
import { MINOS } from '../data/minos';
import { Board } from './board';
import { QueueRun, Simulation } from './hamster';
import { placeLevelPart, srsCells, verifyLayout, type Level, type LevelPart } from './level';
import { levelFromBoard } from './solution';
import { Stack } from './stack';
import { binCount } from './types';

export type DailyKind = 'easy' | 'hard';

/** 32비트 해시 → 씨앗 */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: 정수 연산만 써서 브라우저마다 같은 수열 */
export function rngFrom(seed: string): () => number {
  let a = hashStr(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 한국 시간 날짜 'YYYY-MM-DD' */
export function kstDate(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** 날짜 하루 전 */
export function prevDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 연속 기록: 오늘 깼으면 오늘부터, 아니면 어제부터 거꾸로 깬 날을 센다 */
export function streakFrom(today: string, clearedOn: (date: string) => boolean): number {
  let d = clearedOn(today) ? today : prevDate(today);
  let n = 0;
  while (clearedOn(d) && n < 3650) {
    n++;
    d = prevDate(d);
  }
  return n;
}

export function dailyId(date: string, kind: DailyKind): string {
  return `daily-${date}-${kind}`;
}

const ALL_PARTS = ['sensor', 'gear', 'motor', 'switch', 'plug'] as const;
const TUBES = MINOS.filter((d) => d.id.includes('tube')).map((d) => d.id);
const EMPTIES = MINOS.filter((d) => d.id.endsWith('empty')).map((d) => d.id);

/** 햄스터 한 마리가 지나간 칸들과 결과 */
function trace(board: Board, inject: 'left' | 'right') {
  const sim = new Simulation(board, { inject });
  const cells = new Set<number>();
  for (let k = 0; k < 600 && sim.status === 'running'; k++) {
    sim.step();
    if (board.inBounds(sim.x, sim.y)) cells.add(board.idx(sim.x, sim.y));
  }
  return { status: sim.status, bin: sim.bin, cells, lastX: sim.x };
}

function binsOf(run: QueueRun, w: number): Level['bins'] {
  const out = Array.from({ length: binCount(w) }, () => ({ red: 0, blue: 0 }));
  run.tally.bins.forEach(([r, b], i) => {
    out[i] = { red: r ?? 0, blue: b ?? 0 };
  });
  return out;
}

// ---------------- 쉬움: 쌓기 ----------------

function easyOnce(rand: () => number, id: string, prices: PriceTable): Level | null {
  const ri = (n: number) => Math.floor(rand() * n);
  const pick = <T>(xs: readonly T[]) => xs[ri(xs.length)]!;
  const w = 7 + ri(3);
  const h = 8 + ri(3);
  const inject = rand() < 0.5 ? 'left' : 'right';
  const inletX = inject === 'left' ? 0 : w - 1;
  const board = new Board(w, h);
  const fixed = new Set<number>();
  // 고정 장애물 (처마): 위 세 줄과 투입구 열은 비운다 (스폰 자리·햄스터 낙하)
  const nObs = 1 + ri(2);
  for (let k = 0; k < nObs * 4 && fixed.size < nObs; k++) {
    const p = board.place(pick(EMPTIES), ri(4), ri(w), 3 + ri(h - 4));
    if (!p) continue;
    if (p.cells.some((c) => p.x + c.x === inletX)) {
      board.removeUid(p.uid);
      continue;
    }
    fixed.add(p.uid);
  }
  if (board.placed.length !== fixed.size) return null;
  const empty = trace(board, inject);
  // 미노 2~3개를 중력으로 떨어뜨려 본다 (튜브 위주, 가끔 빈 받침)
  const n = 2 + ri(3);
  for (let k = 0; k < n; k++) {
    const defId = rand() < 0.8 ? pick(TUBES) : pick(EMPTIES);
    const all = new Stack(board, {}).reachableLocks(defId);
    // 길을 따라 짓기: 햄스터가 지금 떨어지는 열에 걸치는 자리를 먼저 고른다
    const col = trace(board, inject).lastX;
    const near = all.filter((l) => srsCells(defId, l.r).some((c) => l.x + c.x === col));
    const locks = near.length && rand() < 0.85 ? near : all;
    if (!locks.length) return null;
    const l = pick(locks);
    if (!board.placeCells(defId, l.r, srsCells(defId, l.r), l.x, l.y)) return null;
  }
  // 스폰 자리(위 두 줄)는 비어 있어야 한다
  for (const p of board.placed) if (p.cells.some((c) => p.y + c.y < 2)) return null;
  const tr = trace(board, inject);
  if (tr.status !== 'binned' || tr.bin === null) return null;
  if (empty.status === 'binned' && empty.bin === tr.bin) return null;
  // 놓은 튜브는 전부 햄스터가 지나가야 한다 (쓸데없는 튜브 없음), 튜브는 둘 이상
  if (board.placed.filter((p) => !fixed.has(p.uid) && p.defId.includes('tube')).length < 2) return null;
  for (const p of board.placed) {
    if (fixed.has(p.uid) || !p.defId.includes('tube')) continue;
    if (!p.cells.some((c) => tr.cells.has(board.idx(p.x + c.x, p.y + c.y)))) return null;
  }
  const qn = 2 + ri(2);
  const queue = Array.from({ length: qn }, () => ({ color: rand() < 0.5 ? ('red' as const) : ('blue' as const), inject: inject as 'left' | 'right' }));
  const run = new QueueRun(board, queue.map((q) => ({ color: (q.color === 'red' ? 0 : 1) as 0 | 1, inject: q.inject })));
  run.runAll();
  const r = levelFromBoard(
    board,
    queue,
    { id, name: '오늘의 쌓기', mechanic: '투입구에서 목표 통까지 길을 잇는다. 고정 블록 밑은 옆에서 밀어 넣는다.', bins: binsOf(run, w), allowed: { minos: MINOS.map((d) => d.id), parts: [...ALL_PARTS] } },
    (uid) => fixed.has(uid),
    () => false,
    prices,
  );
  if (!r.ok) return null;
  // 빈 판으로는 안 풀린다
  if (verifyLayout(r.level, { minos: [], parts: [] }, prices).judgement?.clear) return null;
  return r.level;
}

// ---------------- 어려움: 기계 ----------------

type PartSpec = LevelPart & { fixed?: boolean };

/** 고정 갈림길 뼈대 (7~9번과 같은 판): 플레이어는 위에서 내려오는 길·받침과 기계를 짓는다 */
const BASE: [string, number, number, number, boolean][] = [
  ['L-tube', 1, 0, 6, true],
  ['J-tube', 3, 3, 6, true],
  ['O-empty', 0, 1, 4, true],
  ['L-empty', 1, 0, 3, false],
  ['I-tube', 0, 3, 2, false],
  ['J-tube', 1, 0, 1, false],
  ['O-empty', 0, 4, 4, false],
];
/** 두 단: 아래 갈림길 (19번과 같은 자리, 고정) */
const LOWER: [string, number, number, number, boolean][] = [
  ['I-empty', 1, 3, 9, true],
  ['L-tube', 1, 2, 8, true],
  ['J-tube', 3, 5, 8, true],
];

function machineParts(rand: () => number, two: boolean): PartSpec[] {
  const dir = () => (rand() < 0.5 ? 'cw' : 'ccw') as 'cw' | 'ccw';
  const st = () => (rand() < 0.5 ? 'A' : 'B') as 'A' | 'B';
  const out: PartSpec[] = [{ x: 3, y: 6, type: 'switch', common: 'N', start: st() }, { x: 3, y: 5, type: 'gear' }];
  // 위 기계: 왼쪽 갈래 센서 / 오른쪽 갈래 센서 중 하나 또는 둘
  const side = Math.floor(rand() * 3); // 0 왼쪽, 1 오른쪽, 2 둘 다
  if (side !== 1) out.push({ x: 1, y: 6, type: 'sensor' }, { x: 1, y: 5, type: 'motor', dir: dir() }, { x: 2, y: 5, type: 'gear' });
  if (side !== 0) out.push({ x: 4, y: 6, type: 'sensor' }, { x: 4, y: 5, type: 'motor', dir: dir() });
  if (two) {
    out.push({ x: 5, y: 8, type: 'switch', common: 'N', start: st() }, { x: 5, y: 9, type: 'gear' });
    const s2 = Math.floor(rand() * 3);
    if (s2 !== 1) out.push({ x: 4, y: 8, type: 'sensor' }, { x: 4, y: 9, type: 'motor', dir: dir() });
    if (s2 !== 0) out.push({ x: 6, y: 8, type: 'sensor' }, { x: 6, y: 9, type: 'motor', dir: dir() });
  }
  return out;
}

function buildMachine(two: boolean, parts: PartSpec[], withMachine: boolean): { board: Board; fixed: Set<number> } | null {
  const board = new Board(8, two ? 10 : 9);
  const fixed = new Set<number>();
  for (const [id, r, x, y, f] of [...BASE, ...(two ? LOWER : [])]) {
    const p = board.place(id, r, x, y);
    if (!p) return null;
    if (f) fixed.add(p.uid);
  }
  for (const p of parts) {
    if (!withMachine && p.type !== 'switch') continue;
    if (placeLevelPart(board, p)) return null;
  }
  return { board, fixed };
}

function hardOnce(rand: () => number, id: string, prices: PriceTable): Level | null {
  const two = rand() < 0.35;
  const parts = machineParts(rand, two);
  const qn = 4 + Math.floor(rand() * 3);
  const queue = Array.from({ length: qn }, () => ({ color: rand() < 0.5 ? ('red' as const) : ('blue' as const), inject: 'left' as const }));
  const qItems = queue.map((q) => ({ color: (q.color === 'red' ? 0 : 1) as 0 | 1, inject: q.inject }));
  const m = buildMachine(two, parts, true);
  if (!m) return null;
  const run = new QueueRun(m.board, qItems);
  run.runAll();
  if (run.loop || run.results.some((r) => r.status !== 'binned')) return null;
  const bins = binsOf(run, m.board.w);
  if (bins.filter((b) => b.red + b.blue > 0).length < 2) return null;
  // 스위치만 고정해 둔 판(시작 방향을 어떻게 골라도)으로는 안 풀려야 기계가 필요하다
  const switches = parts.filter((p) => p.type === 'switch');
  for (let mask = 0; mask < 1 << switches.length; mask++) {
    const sp = parts.map((p) => (p.type === 'switch' ? { ...p, start: (mask >> switches.indexOf(p)) & 1 ? ('B' as const) : ('A' as const) } : p));
    const s = buildMachine(two, sp, false);
    if (!s) continue;
    const r2 = new QueueRun(s.board, qItems);
    r2.runAll();
    const b2 = binsOf(r2, s.board.w);
    if (!r2.loop && b2.every((b, i) => b.red === bins[i]!.red && b.blue === bins[i]!.blue)) return null;
  }
  const r = levelFromBoard(
    m.board,
    queue,
    { id, name: two ? '오늘의 두 단 기계' : '오늘의 기계', mechanic: '대기열 순서를 읽고 센서·모터·기어로 스위치를 넘겨 통마다 나눠 담는다.', bins, allowed: { minos: MINOS.map((d) => d.id), parts: [...ALL_PARTS] } },
    (uid) => m.fixed.has(uid),
    () => false,
    prices,
  );
  return r.ok ? r.level : null;
}

/** 그날의 퍼즐. 같은 날짜·종류면 언제 어디서나 같은 레벨 */
export function dailyLevel(date: string, kind: DailyKind, prices: PriceTable): Level {
  const id = dailyId(date, kind);
  const rand = rngFrom(id);
  for (let k = 0; k < 4000; k++) {
    const lv = kind === 'easy' ? easyOnce(rand, id, prices) : hardOnce(rand, id, prices);
    if (lv) return lv;
  }
  throw new Error(`데일리 퍼즐을 만들지 못했다: ${id}`);
}
