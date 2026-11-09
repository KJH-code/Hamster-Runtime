/**
 * 힌트: 지금 판에서 "다음에 놓을 미노 하나" 또는 "다음 부품 하나". 순수 로직 (DOM 없음).
 *
 * 1. 내가 놓은 미노가 전부 참조 풀이에 있으면 → 참조 풀이에서 아직 안 놓은 다음 미노 (빠름)
 * 2. 다르면 내 미노를 살린 채로 찾는다 (시간 제한 안에서):
 *    a. 참조 풀이 중 내 미노와 안 겹치는 것들을 마저 놓으면 풀리는가
 *    b. 미노 1~2개를 더 놓아서 (중력으로 닿는 자리만) 풀리는가
 *    부품은 참조 풀이의 부품 중 놓을 수 있는 것을 쓴다.
 * 3. 못 찾으면 참조 풀이 기준으로 다음 미노 + 방해되는 내 미노 (blockers)
 * 미노가 다 맞으면 부품을 하나씩 (참조 풀이 부품 중 아직 없는 것).
 */
import type { MinoDef } from '../data/minos';
import { MINOS } from '../data/minos';
import type { PriceTable } from '../data/prices';
import { Board } from './board';
import { QueueRun } from './hamster';
import { applyLayout, binsMatch, brokenSwitch, buildFixed, placeLevelPart, queueItems, srsCells, type Built, type Layout, type Level, type LevelMino, type LevelPart } from './level';
import { totalPrice } from './price';
import { findDropOrder } from './solution';
import { Stack } from './stack';

export type Hint =
  /** 다음 미노. blockers = 방해되는 내 미노 (layout.minos 의 번호) */
  | { kind: 'mino'; mino: LevelMino; source: 'ref' | 'search'; blockers: number[] }
  /** 다음 부품. blockers = 그 칸에 다른 부품이 있으면 그 부품 (layout.parts 의 번호) */
  | { kind: 'part'; part: LevelPart; blockers: number[] }
  /** 다 맞음. blockers = 풀이에 없는 내 부품 */
  | { kind: 'done'; blockers: number[] }
  | { kind: 'none'; reason: string };

export interface HintOpts {
  /** 탐색에 쓸 시간 (ms) */
  budgetMs?: number;
  now?: () => number;
  defs?: MinoDef[];
}

/** 같은 미노·같은 칸이면 같은 자리 (돌려서 모양이 같은 자세도 같게 본다) */
export function minoKey(m: LevelMino, defs: MinoDef[] = MINOS): string {
  return (
    m.id +
    ':' +
    srsCells(m.id, m.r, defs)
      .map((c) => `${m.x + c.x},${m.y + c.y}`)
      .sort()
      .join(' ')
  );
}

function cellSet(m: LevelMino, defs: MinoDef[]): Set<string> {
  return new Set(srsCells(m.id, m.r, defs).map((c) => `${m.x + c.x},${m.y + c.y}`));
}

function samePart(a: LevelPart, b: LevelPart): boolean {
  if (a.x !== b.x || a.y !== b.y || a.type !== b.type) return false;
  if (a.type === 'motor') return (a.dir ?? 'cw') === (b.dir ?? 'cw');
  if (a.type === 'switch') return (a.common ?? 'N') === (b.common ?? 'N') && (a.start ?? 'A') === (b.start ?? 'A');
  return true;
}

function cloneBoard(b: Board): Board {
  const n = new Board(b.w, b.h);
  for (const p of b.placed) n.placeCells(p.defId, p.rot, p.cells, p.x, p.y);
  for (const [i, p] of b.parts) n.parts.set(i, { ...p });
  return n;
}

/** 판에 부품을 놓을 수 있는 만큼 놓고 돌려 본다. 풀리면 실제로 놓인 부품 목록 */
function tryWithParts(level: Level, board: Board, fixed: Built['fixed'], parts: LevelPart[], prices: PriceTable): LevelPart[] | null {
  const b = cloneBoard(board);
  const used: LevelPart[] = [];
  for (const lp of parts) {
    if (b.parts.has(b.idx(lp.x, lp.y))) continue; // 고정 부품 자리
    if (placeLevelPart(b, lp) === null) used.push(lp);
  }
  if (brokenSwitch(b)) return null;
  if (totalPrice(b, prices, fixed) > level.budget) return null;
  const run = new QueueRun(b, queueItems(level));
  run.runAll();
  if (run.loop || !binsMatch(run.tally, level.bins).every(Boolean)) return null;
  return used;
}

/** 미노가 정해졌을 때 부품 힌트 */
function partHint(target: LevelPart[], mine: LevelPart[]): Hint {
  for (const t of target) {
    if (mine.some((p) => samePart(p, t))) continue;
    const blockers = mine.flatMap((p, i) => (p.x === t.x && p.y === t.y ? [i] : []));
    return { kind: 'part', part: t, blockers };
  }
  const blockers = mine.flatMap((p, i) => (target.some((t) => samePart(p, t)) ? [] : [i]));
  return { kind: 'done', blockers };
}

export function nextHint(level: Level, layout: Layout, prices: PriceTable, opts: HintOpts = {}): Hint {
  const defs = opts.defs ?? MINOS;
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + (opts.budgetMs ?? 1500);
  const ref = level.solution;
  if (!ref) return { kind: 'none', reason: '이 레벨에는 참조 풀이가 없다' };
  const refParts = ref.parts.filter((p) => !(level.fixed?.parts ?? []).some((f) => f.x === p.x && f.y === p.y));
  const P = layout.minos;
  const refKeys = ref.minos.map((m) => minoKey(m, defs));
  const pKeys = P.map((m) => minoKey(m, defs));
  const extra = P.flatMap((_, i) => (refKeys.includes(pKeys[i]!) ? [] : [i]));
  const rest = ref.minos.filter((_, i) => !pKeys.includes(refKeys[i]!));

  // 1. 내 미노가 전부 참조 풀이 안에 있다
  if (extra.length === 0) {
    if (rest.length) return { kind: 'mino', mino: rest[0]!, source: 'ref', blockers: [] };
    return partHint(refParts, layout.parts);
  }

  // 내 미노만 놓인 판 (부품 없이)
  const built = buildFixed(level, defs);
  if (applyLayout(level, built, { minos: P, parts: [] }, defs)) return { kind: 'none', reason: '지금 판을 다시 놓을 수 없다' };
  const base = built.board;

  // 2a. 참조 풀이 중 내 미노와 안 겹치는 것들을 마저 놓는다
  const pCells = new Set(P.flatMap((m) => [...cellSet(m, defs)]));
  const free = rest.filter((m) => ![...cellSet(m, defs)].some((c) => pCells.has(c)));
  const order = free.length ? findDropOrder({ board: cloneBoard(base), fixed: built.fixed }, free, defs) : [];
  if (order) {
    const b = cloneBoard(base);
    for (const m of order) b.placeCells(m.id, m.r, srsCells(m.id, m.r, defs), m.x, m.y);
    const used = tryWithParts(level, b, built.fixed, refParts, prices);
    if (used) return order.length ? { kind: 'mino', mino: order[0]!, source: 'search', blockers: [] } : partHint(used, layout.parts);
  }

  // 2b. 미노 0~2개를 더 놓아 본다 (시간 안에서)
  let found: { first: LevelMino | null; parts: LevelPart[] } | null = null;
  const search = (b: Board, depth: number, first: LevelMino | null): boolean => {
    if (now() > deadline) return true;
    const used = tryWithParts(level, b, built.fixed, refParts, prices);
    if (used) {
      found = { first, parts: used };
      return true;
    }
    if (depth === 0) return false;
    for (const id of level.allowed.minos) {
      for (const p of new Stack(b, {}, defs).reachableLocks(id)) {
        const b2 = cloneBoard(b);
        b2.placeCells(id, p.r, srsCells(id, p.r, defs), p.x, p.y);
        if (brokenSwitch(b2)) continue;
        if (search(b2, depth - 1, first ?? { id, r: p.r, x: p.x, y: p.y })) return true;
      }
    }
    return false;
  };
  for (let d = 0; d <= 2 && !found && now() <= deadline; d++) search(base, d, null);
  if (found) {
    const f = found as { first: LevelMino | null; parts: LevelPart[] };
    return f.first ? { kind: 'mino', mino: f.first, source: 'search', blockers: [] } : partHint(f.parts, layout.parts);
  }

  // 3. 참조 풀이 기준 + 방해되는 내 미노
  const next = rest[0];
  if (!next) return partHint(refParts, layout.parts);
  const restCells = new Set(rest.flatMap((m) => [...cellSet(m, defs)]));
  const blockers = extra.filter((i) => [...cellSet(P[i]!, defs)].some((c) => restCells.has(c)));
  return { kind: 'mino', mino: next, source: 'ref', blockers: blockers.length ? blockers : extra };
}
