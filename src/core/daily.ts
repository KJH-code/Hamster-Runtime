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

/** 쌓기 생성 옵션 (기본값 = 데일리 쉬움) */
export interface StackOpts {
  name: string;
  mechanic: string;
  /** 참조 풀이에 쓸 수 있는 튜브 / 빈 미노 (덱) */
  tubes: string[];
  empties: string[];
  /** 판 가로 = w[0] + 0..w[1]-1, 세로·미노 수·햄스터 수도 같은 꼴 */
  w: [number, number];
  h: [number, number];
  n: [number, number];
  q: [number, number];
  /** 2 = 양쪽 투입구 (길 두 개) */
  inlets: 1 | 2;
  allowed: Level['allowed'];
  /** 예산 = 참조 가격 × 이 값 (올림) */
  budgetMul: number;
  /** 튜브는 햄스터가 실제로 지나가게 되는 자리만 고른다 (긴 길을 빨리 찾는다) */
  smart?: boolean;
}
const EASY: StackOpts = {
  name: '오늘의 쌓기',
  mechanic: '투입구에서 목표 통까지 길을 잇는다. 고정 블록 밑은 옆에서 밀어 넣는다.',
  tubes: TUBES,
  empties: EMPTIES,
  w: [7, 3],
  h: [8, 3],
  n: [2, 3],
  q: [2, 2],
  inlets: 1,
  allowed: { minos: MINOS.map((d) => d.id), parts: [...ALL_PARTS] },
  budgetMul: 2,
};

/** 미노를 n 개 길을 따라 떨어뜨린다 (햄스터가 지금 떨어지는 열에 걸치는 자리를 먼저) */
function growPath(board: Board, rand: () => number, inject: 'left' | 'right', n: number, o: StackOpts): boolean {
  const ri = (k: number) => Math.floor(rand() * k);
  const pick = <T>(xs: readonly T[]) => xs[ri(xs.length)]!;
  for (let k = 0; k < n; k++) {
    const useEmpty = rand() >= 0.8;
    const defId = useEmpty && o.empties.length ? pick(o.empties) : pick(o.tubes);
    const all = new Stack(board, {}).reachableLocks(defId);
    const col = trace(board, inject).lastX;
    const near = all.filter((l) => srsCells(defId, l.r).some((c) => l.x + c.x === col));
    const locks = near.length && rand() < 0.85 ? near : all;
    if (!locks.length) return false;
    if (o.smart && defId.includes('tube')) {
      // 후보를 섞어 보고, 햄스터가 새 튜브를 지나가게 되는 첫 자리
      const before = trace(board, inject).cells.size;
      const order = locks.map((l) => [rand(), l] as const).sort((a, b) => a[0] - b[0]).map(([, l]) => l);
      let ok = false;
      for (const l of order.slice(0, 24)) {
        const p = board.placeCells(defId, l.r, srsCells(defId, l.r), l.x, l.y);
        if (!p) continue;
        const tr = trace(board, inject);
        if (tr.status !== 'crashed' && tr.cells.size > before && p.cells.some((c) => tr.cells.has(board.idx(p.x + c.x, p.y + c.y)))) {
          ok = true;
          break;
        }
        board.removeUid(p.uid);
      }
      if (!ok) return false;
      continue;
    }
    const l = pick(locks);
    if (!board.placeCells(defId, l.r, srsCells(defId, l.r), l.x, l.y)) return false;
  }
  return true;
}

export function stackOnce(rand: () => number, id: string, prices: PriceTable, o: StackOpts = EASY): Level | null {
  const ri = (n: number) => Math.floor(rand() * n);
  const pick = <T>(xs: readonly T[]) => xs[ri(xs.length)]!;
  const w = o.w[0] + ri(o.w[1]);
  const h = o.h[0] + ri(o.h[1]);
  const inject = rand() < 0.5 ? 'left' : 'right';
  const other = inject === 'left' ? 'right' : 'left';
  const inletX = inject === 'left' ? 0 : w - 1;
  const board = new Board(w, h);
  const fixed = new Set<number>();
  // 고정 장애물 (처마): 위 세 줄과 투입구 열은 비운다 (스폰 자리·햄스터 낙하)
  const nObs = 1 + ri(2);
  for (let k = 0; k < nObs * 4 && fixed.size < nObs; k++) {
    const p = board.place(pick(EMPTIES), ri(4), ri(w), 3 + ri(h - 4));
    if (!p) continue;
    if (p.cells.some((c) => p.x + c.x === inletX || (o.inlets === 2 && p.x + c.x === (inletX === 0 ? w - 1 : 0)))) {
      board.removeUid(p.uid);
      continue;
    }
    fixed.add(p.uid);
  }
  if (board.placed.length !== fixed.size) return null;
  const empty = trace(board, inject);
  const empty2 = o.inlets === 2 ? trace(board, other) : null;
  // 미노를 중력으로 떨어뜨려 길을 짓는다 (튜브 위주, 가끔 빈 받침). 양쪽이면 반대쪽 길도
  const n = o.n[0] + ri(o.n[1]);
  if (!growPath(board, rand, inject, n, o)) return null;
  if (o.inlets === 2 && !growPath(board, rand, other, o.n[0] + ri(o.n[1]), o)) return null;
  // 스폰 자리(위 두 줄)는 비어 있어야 한다
  for (const p of board.placed) if (p.cells.some((c) => p.y + c.y < 2)) return null;
  const tr = trace(board, inject);
  if (tr.status !== 'binned' || tr.bin === null) return null;
  if (empty.status === 'binned' && empty.bin === tr.bin) return null;
  const visited = new Set(tr.cells);
  if (empty2) {
    const tr2 = trace(board, other);
    if (tr2.status !== 'binned' || tr2.bin === null) return null;
    if (empty2.status === 'binned' && empty2.bin === tr2.bin) return null;
    for (const c of tr2.cells) visited.add(c);
  }
  // 놓은 튜브는 전부 햄스터가 지나가야 한다 (쓸데없는 튜브 없음), 튜브는 둘 이상
  if (board.placed.filter((p) => !fixed.has(p.uid) && p.defId.includes('tube')).length < 2) return null;
  for (const p of board.placed) {
    if (fixed.has(p.uid) || !p.defId.includes('tube')) continue;
    if (!p.cells.some((c) => visited.has(board.idx(p.x + c.x, p.y + c.y)))) return null;
  }
  const qn = o.q[0] + ri(o.q[1]);
  const queue = Array.from({ length: qn }, (_, i) => ({ color: rand() < 0.5 ? ('red' as const) : ('blue' as const), inject: (o.inlets === 2 && i % 2 ? other : inject) as 'left' | 'right' }));
  const run = new QueueRun(board, queue.map((q) => ({ color: (q.color === 'red' ? 0 : 1) as 0 | 1, inject: q.inject })));
  run.runAll();
  const r = levelFromBoard(
    board,
    queue,
    { id, name: o.name, mechanic: o.mechanic, bins: binsOf(run, w), allowed: o.allowed },
    (uid) => fixed.has(uid),
    () => false,
    prices,
  );
  if (!r.ok) return null;
  if (o.budgetMul !== 2) r.level.budget = Math.ceil(r.judgement.price * o.budgetMul);
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

function buildMachine(two: boolean, parts: PartSpec[], withMachine: boolean, fixAll = false): { board: Board; fixed: Set<number> } | null {
  const board = new Board(8, two ? 10 : 9);
  const fixed = new Set<number>();
  for (const [id, r, x, y, f] of [...BASE, ...(two ? LOWER : [])]) {
    const p = board.place(id, r, x, y);
    if (!p) return null;
    if (f || fixAll) fixed.add(p.uid);
  }
  for (const p of parts) {
    if (!withMachine && p.type !== 'switch') continue;
    if (placeLevelPart(board, p)) return null;
  }
  return { board, fixed };
}

/** 기계 생성 옵션 (기본값 = 데일리 어려움) */
export interface MachineOpts {
  name: string;
  name2: string;
  /** 길·받침 미노까지 전부 고정 (부품만 놓는 퍼즐) */
  fixAll: boolean;
  twoProb: number;
  q: [number, number];
  allowed: Level['allowed'];
  budgetMul: number;
  /** 색 나누기: 통마다 한 색만 담기게 대기열 색을 고른다 (11번처럼) */
  colorSort?: boolean;
}
const HARD: MachineOpts = {
  name: '오늘의 기계',
  name2: '오늘의 두 단 기계',
  fixAll: false,
  twoProb: 0.35,
  q: [4, 3],
  allowed: { minos: MINOS.map((d) => d.id), parts: [...ALL_PARTS] },
  budgetMul: 2,
};

export function machineOnce(rand: () => number, id: string, prices: PriceTable, o: MachineOpts = HARD): Level | null {
  const two = rand() < o.twoProb;
  const parts = machineParts(rand, two);
  const qn = o.q[0] + Math.floor(rand() * o.q[1]);
  const queue = Array.from({ length: qn }, () => ({ color: rand() < 0.5 ? ('red' as const) : ('blue' as const), inject: 'left' as const }));
  let qItems = queue.map((q) => ({ color: (q.color === 'red' ? 0 : 1) as 0 | 1, inject: q.inject }));
  const m = buildMachine(two, parts, true, o.fixAll);
  if (!m) return null;
  let run = new QueueRun(m.board, qItems);
  run.runAll();
  if (o.colorSort) {
    // 햄스터마다 들어간 통을 보고, 통마다 색 하나를 정해 대기열 색을 다시 칠한다 (두 색 다 쓰이게)
    if (run.loop || run.results.some((r) => r.status !== 'binned')) return null;
    const used = [...new Set(run.results.map((r) => r.bin!))];
    if (used.length < 2) return null;
    const colorOf = new Map(used.map((b) => [b, rand() < 0.5 ? ('red' as const) : ('blue' as const)]));
    if (new Set(colorOf.values()).size < 2) colorOf.set(used[0]!, colorOf.get(used[1]!) === 'red' ? 'blue' : 'red');
    run.results.forEach((r, i) => (queue[i]!.color = colorOf.get(r.bin!)!));
    qItems = queue.map((q) => ({ color: (q.color === 'red' ? 0 : 1) as 0 | 1, inject: q.inject }));
    run = new QueueRun(m.board, qItems);
    run.runAll();
  }
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
    { id, name: two ? o.name2 : o.name, mechanic: o.colorSort ? '색 나누기: 통마다 한 색만. 대기열 순서를 읽고 차례에 맞춰 스위치를 넘긴다.' : '대기열 순서를 읽고 센서·모터·기어로 스위치를 넘겨 통마다 나눠 담는다.', bins, allowed: o.allowed },
    (uid) => m.fixed.has(uid),
    () => false,
    prices,
  );
  if (!r.ok) return null;
  if (o.budgetMul !== 2) r.level.budget = Math.ceil(r.judgement.price * o.budgetMul);
  return r.level;
}

/** 그날의 퍼즐. 같은 날짜·종류면 언제 어디서나 같은 레벨 */
export function dailyLevel(date: string, kind: DailyKind, prices: PriceTable): Level {
  const id = dailyId(date, kind);
  const rand = rngFrom(id);
  for (let k = 0; k < 4000; k++) {
    const lv = kind === 'easy' ? stackOnce(rand, id, prices) : machineOnce(rand, id, prices);
    if (lv) return lv;
  }
  throw new Error(`데일리 퍼즐을 만들지 못했다: ${id}`);
}
