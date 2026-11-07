/**
 * 레벨 형식 · JSON 불러오기/저장 · 판정. 순수 로직.
 *
 * 레벨 = 판 크기, 대기열(고정 순서), 통별 색 마릿수 조건, 사용 가능한 미노·부품 종류, 예산,
 *        (선택) 고정 미노·부품, (선택) 참조 풀이.
 * 클리어 = 대기열을 끝까지 돌린 뒤 모든 통의 색별 마릿수가 조건과 같고, 총 가격 ≤ 예산.
 * 미노 좌표는 중력 모드(SRS) 자세 {r, x, y} — stack.ts 의 cellsOf 기준.
 */
import { MINOS, type MinoDef } from '../data/minos';
import type { PriceTable } from '../data/prices';
import { Board, findDef } from './board';
import { QueueRun, type QueueItem, type Tally } from './hamster';
import { computeLinks } from './links';
import { partRuleError, switchArms } from './parts';
import { totalPrice, type Fixed } from './price';
import { srsPiece } from './srs';
import { Stack } from './stack';
import { binCount, E, N, S, SWITCH_STATES, W, type Part, type PartType, type Sides, type SwitchState } from './types';

export type ColorName = 'red' | 'blue';
export type SideName = 'N' | 'E' | 'S' | 'W';
export const PART_TYPES: readonly PartType[] = ['sensor', 'gear', 'motor', 'switch', 'plug'];

export interface LevelMino {
  id: string;
  r: number;
  x: number;
  y: number;
}
export interface LevelPart {
  x: number;
  y: number;
  type: PartType;
  /** motor */
  dir?: 'cw' | 'ccw';
  /** switch: 공통 갈래 */
  common?: SideName;
  /** switch: 시작 상태 */
  start?: SwitchState;
}
export interface Layout {
  /** 떨어뜨리는 순서 (고정 미노는 순서 무관, 중력 검사 없음) */
  minos: LevelMino[];
  parts: LevelPart[];
}
export interface BinGoal {
  red: number;
  blue: number;
}
export interface Level {
  id: string;
  name: string;
  /** 이 레벨의 핵심 메커니즘 한 줄 (풀이 방법은 적지 않는다) */
  mechanic: string;
  w: number;
  h: number;
  queue: { color: ColorName; inject: 'left' | 'right' }[];
  /** 통마다 하나 (길이 = 통 개수) */
  bins: BinGoal[];
  allowed: { minos: string[]; parts: PartType[] };
  budget: number;
  fixed?: Layout;
  solution?: Layout;
}

export const BUDGET_MARGIN_PERCENT = 25;
/** 예산 = 참조 풀이 가격 + 25% (올림) */
export function budgetFromReference(price: number, marginPercent = BUDGET_MARGIN_PERCENT): number {
  return Math.ceil((price * (100 + marginPercent)) / 100);
}
export function overBudget(price: number, budget: number): boolean {
  return price > budget;
}

const SIDE_OF: Record<SideName, Sides> = { N, E, S, W };
export function sideName(s: Sides): SideName {
  return s === N ? 'N' : s === E ? 'E' : s === S ? 'S' : 'W';
}

export function queueItems(level: Level): QueueItem[] {
  return level.queue.map((q) => ({ color: q.color === 'red' ? 0 : 1, inject: q.inject }));
}

// ---------------- JSON ----------------

function fail(msg: string): never {
  throw new Error(`레벨 JSON: ${msg}`);
}
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${what} 는 객체여야 한다`);
  return v as Record<string, unknown>;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) fail(`${what} 는 배열이어야 한다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') fail(`${what} 는 문자열이어야 한다`);
  return v;
}
function int(v: unknown, what: string, min = 0): number {
  if (!isInt(v) || v < min) fail(`${what} 는 ${min} 이상의 정수여야 한다`);
  return v;
}

function parseMino(v: unknown, what: string): LevelMino {
  const o = obj(v, what);
  return { id: str(o.id, `${what}.id`), r: int(o.r, `${what}.r`) % 4, x: int(o.x, `${what}.x`, -3), y: int(o.y, `${what}.y`, -3) };
}
function parsePart(v: unknown, what: string): LevelPart {
  const o = obj(v, what);
  const type = str(o.type, `${what}.type`) as PartType;
  if (!PART_TYPES.includes(type)) fail(`${what}.type 알 수 없음: ${type}`);
  const p: LevelPart = { x: int(o.x, `${what}.x`), y: int(o.y, `${what}.y`), type };
  if (type === 'motor') {
    if (o.dir !== 'cw' && o.dir !== 'ccw') fail(`${what}.dir 는 "cw" 또는 "ccw"`);
    p.dir = o.dir;
  }
  if (type === 'switch') {
    if (typeof o.common !== 'string' || !(o.common in SIDE_OF)) fail(`${what}.common 는 "N" "E" "S" "W" 중 하나`);
    p.common = o.common as SideName;
    const st = o.start ?? 'A';
    if (!SWITCH_STATES.includes(st as SwitchState)) fail(`${what}.start 는 "A" "B" "C" 중 하나`);
    p.start = st as SwitchState;
  }
  return p;
}
function parseLayout(v: unknown, what: string): Layout {
  const o = obj(v, what);
  return {
    minos: arr(o.minos ?? [], `${what}.minos`).map((m, i) => parseMino(m, `${what}.minos[${i}]`)),
    parts: arr(o.parts ?? [], `${what}.parts`).map((p, i) => parsePart(p, `${what}.parts[${i}]`)),
  };
}

/** JSON 문자열 또는 이미 파싱된 값 → 검증된 Level. 틀리면 이유와 함께 throw */
export function parseLevel(input: string | unknown): Level {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      fail(`문법 오류 (${(e as Error).message})`);
    }
  }
  const o = obj(raw, '레벨');
  const w = int(o.w, 'w', 2);
  const h = int(o.h, 'h', 2);
  const queue = arr(o.queue, 'queue').map((q, i) => {
    const qo = obj(q, `queue[${i}]`);
    if (qo.color !== 'red' && qo.color !== 'blue') fail(`queue[${i}].color 는 "red" 또는 "blue"`);
    if (qo.inject !== 'left' && qo.inject !== 'right') fail(`queue[${i}].inject 는 "left" 또는 "right"`);
    return { color: qo.color as ColorName, inject: qo.inject as 'left' | 'right' };
  });
  if (queue.length === 0) fail('queue 가 비어 있다');
  const bins = arr(o.bins, 'bins').map((b, i) => {
    const bo = obj(b, `bins[${i}]`);
    return { red: int(bo.red, `bins[${i}].red`), blue: int(bo.blue, `bins[${i}].blue`) };
  });
  if (bins.length !== binCount(w)) fail(`bins 는 통 개수(${binCount(w)})만큼`);
  const al = obj(o.allowed, 'allowed');
  const allowed = {
    minos: arr(al.minos, 'allowed.minos').map((m, i) => str(m, `allowed.minos[${i}]`)),
    parts: arr(al.parts, 'allowed.parts').map((p, i) => {
      const t = str(p, `allowed.parts[${i}]`) as PartType;
      if (!PART_TYPES.includes(t)) fail(`allowed.parts 알 수 없음: ${t}`);
      return t;
    }),
  };
  const level: Level = {
    id: str(o.id, 'id'),
    name: str(o.name, 'name'),
    mechanic: str(o.mechanic ?? '', 'mechanic'),
    w,
    h,
    queue,
    bins,
    allowed,
    budget: int(o.budget, 'budget'),
  };
  if (o.fixed !== undefined) level.fixed = parseLayout(o.fixed, 'fixed');
  if (o.solution !== undefined) level.solution = parseLayout(o.solution, 'solution');
  return level;
}

/** Level → JSON 문자열 (사람이 읽기 좋게) */
export function serializeLevel(level: Level): string {
  const out: Record<string, unknown> = {
    id: level.id,
    name: level.name,
    mechanic: level.mechanic,
    w: level.w,
    h: level.h,
    queue: level.queue,
    bins: level.bins,
    allowed: level.allowed,
    budget: level.budget,
  };
  if (level.fixed) out.fixed = level.fixed;
  if (level.solution) out.solution = level.solution;
  return compactJson(out) + '\n';
}

/** 들여쓴 JSON 이되, 안에 객체·배열이 없는 작은 객체·배열은 한 줄로 */
function compactJson(v: unknown): string {
  return JSON.stringify(v, null, 2)
    .replace(/\{\n\s+([^{}[\]]*?)\n\s+\}/g, (_, body: string) => `{ ${body.split(/,\n\s+/).join(', ')} }`)
    .replace(/\[\n\s+([^{}[\]]*?)\n\s+\]/g, (_, body: string) => `[${body.split(/,\n\s+/).join(', ')}]`);
}

// ---------------- 판 만들기 ----------------

export function toPart(lp: LevelPart, board: Board): Part {
  const p: Part = { type: lp.type };
  if (lp.type === 'motor') p.dir = lp.dir === 'ccw' ? -1 : 1;
  if (lp.type === 'switch') {
    p.arms = computeLinks(board).link[board.idx(lp.x, lp.y)]!;
    p.common = SIDE_OF[lp.common!];
    p.start = lp.start ?? 'A';
  }
  return p;
}
export function fromPart(x: number, y: number, p: Part): LevelPart {
  const lp: LevelPart = { x, y, type: p.type };
  if (p.type === 'motor') lp.dir = p.dir === -1 ? 'ccw' : 'cw';
  if (p.type === 'switch') {
    lp.common = sideName(p.common!);
    lp.start = p.start ?? 'A';
  }
  return lp;
}

/** 부품 하나를 규칙대로 놓는다. 실패하면 이유 */
export function placeLevelPart(board: Board, lp: LevelPart): string | null {
  const err = partRuleError(board, lp.x, lp.y, lp.type);
  if (err) return `(${lp.x},${lp.y}) ${err}`;
  const p = toPart(lp, board);
  if (p.type === 'switch') {
    const arms = switchArms(p.arms!, p.common!);
    if (!(p.arms! & p.common!)) return `(${lp.x},${lp.y}) 스위치 공통 갈래 ${lp.common} 가 분기점의 갈래가 아니다`;
    if (SWITCH_STATES.indexOf(p.start!) >= arms.length) return `(${lp.x},${lp.y}) 스위치에 ${p.start} 갈래가 없다`;
  }
  board.parts.set(board.idx(lp.x, lp.y), p);
  return null;
}

/** 스위치가 놓인 분기점의 갈래가 바뀌었으면 이유 */
export function brokenSwitch(board: Board): string | null {
  const links = computeLinks(board);
  for (const [i, p] of board.parts)
    if (p.type === 'switch' && links.link[i] !== p.arms) return '스위치가 놓인 분기점의 갈래가 바뀐다';
  return null;
}

export function srsCells(defId: string, r: number, defs: MinoDef[] = MINOS) {
  return srsPiece(findDef(defId, defs)).states[((r % 4) + 4) % 4]!;
}

export interface Built {
  board: Board;
  fixed: Fixed;
}

/** 고정 미노·부품만 놓인 판 */
export function buildFixed(level: Level, defs: MinoDef[] = MINOS): Built {
  const board = new Board(level.w, level.h);
  const fixed: Fixed = { minos: new Set(), parts: new Set() };
  for (const m of level.fixed?.minos ?? []) {
    const p = board.placeCells(m.id, m.r, srsCells(m.id, m.r, defs), m.x, m.y);
    if (!p) throw new Error(`고정 미노 ${m.id} (${m.x},${m.y}) 를 놓을 수 없다`);
    fixed.minos.add(p.uid);
  }
  for (const lp of level.fixed?.parts ?? []) {
    const err = placeLevelPart(board, lp);
    if (err) throw new Error(`고정 부품: ${err}`);
    fixed.parts.add(board.idx(lp.x, lp.y));
  }
  return { board, fixed };
}

/**
 * 고정 판 위에 풀이를 놓는다. 미노는 적힌 순서대로 스폰에서 실제 조작(좌우·드롭·SRS 회전)으로
 * 도달할 수 있는 고정 자세여야 한다. 그다음 부품을 적힌 순서대로 규칙에 맞게 놓는다.
 * 사용 가능 종류에 없는 것을 쓰면 실패.
 */
export function applyLayout(level: Level, built: Built, layout: Layout, defs: MinoDef[] = MINOS): string | null {
  const { board } = built;
  const stack = new Stack(board, {}, defs);
  for (const [k, m] of layout.minos.entries()) {
    if (!level.allowed.minos.includes(m.id)) return `미노 ${m.id} 는 이 레벨에서 쓸 수 없다`;
    const ok = stack.reachableLocks(m.id).some((p) => p.r === m.r && p.x === m.x && p.y === m.y);
    if (!ok) return `${k + 1}번째 미노 ${m.id} r${m.r} (${m.x},${m.y}) 에 중력으로 도달할 수 없다`;
    board.placeCells(m.id, m.r, srsCells(m.id, m.r, defs), m.x, m.y);
    const broken = brokenSwitch(board);
    if (broken) return `${k + 1}번째 미노: ${broken}`;
  }
  for (const lp of layout.parts) {
    if (!level.allowed.parts.includes(lp.type)) return `부품 ${lp.type} 는 이 레벨에서 쓸 수 없다`;
    const err = placeLevelPart(board, lp);
    if (err) return err;
    const broken = brokenSwitch(board);
    if (broken) return broken;
  }
  return null;
}

// ---------------- 판정 ----------------

export interface Judgement {
  /** 대기열을 끝까지 돌렸는가 (루프면 false) */
  finished: boolean;
  loop: boolean;
  tally: Tally;
  /** 통별 조건 일치 */
  binsOk: boolean[];
  price: number;
  overBudget: boolean;
  clear: boolean;
}

/** 통 조건: 모든 통에서 빨강·파랑 마릿수가 정확히 같다 */
export function binsMatch(tally: Tally, goals: BinGoal[]): boolean[] {
  return goals.map((g, i) => {
    const b = tally.bins[i] ?? [0, 0];
    return b[0] === g.red && b[1] === g.blue;
  });
}

export function judge(level: Level, run: QueueRun, price: number): Judgement {
  const finished = run.done && !run.loop;
  const binsOk = binsMatch(run.tally, level.bins);
  const over = overBudget(price, level.budget);
  return {
    finished,
    loop: run.loop,
    tally: run.tally,
    binsOk,
    price,
    overBudget: over,
    clear: finished && binsOk.every(Boolean) && !over,
  };
}

/** 판을 대기열 끝까지 돌리고 판정 */
export function runAndJudge(level: Level, built: Built, prices: PriceTable): Judgement {
  const run = new QueueRun(built.board, queueItems(level));
  run.runAll();
  return judge(level, run, totalPrice(built.board, prices, built.fixed));
}

/** 풀이 검증: 놓을 수 있는가 + 클리어하는가. error 가 있으면 놓기부터 실패 */
export function verifyLayout(
  level: Level,
  layout: Layout,
  prices: PriceTable,
  defs: MinoDef[] = MINOS,
): { error: string | null; judgement: Judgement | null } {
  let built: Built;
  try {
    built = buildFixed(level, defs);
  } catch (e) {
    return { error: (e as Error).message, judgement: null };
  }
  const error = applyLayout(level, built, layout, defs);
  if (error) return { error, judgement: null };
  return { error: null, judgement: runAndJudge(level, built, prices) };
}
