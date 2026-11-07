/**
 * 샌드박스 배치 → 레벨 + 참조 풀이. 순수 로직.
 *  - 자유 배치 좌표(rotateShape 정규화) → 중력 모드 SRS 자세 {r, x, y}
 *  - 플레이어 미노를 중력으로 쌓을 수 있는 순서를 찾는다 (백트래킹)
 *  - 엔진으로 돌려 통 조건 확인, 예산 = 참조 풀이 가격 + 25%
 */
import { MINOS, type MinoDef } from '../data/minos';
import type { PriceTable } from '../data/prices';
import type { Board } from './board';
import { binCount } from './types';
import { budgetFromReference, buildFixed, fromPart, srsCells, verifyLayout, type Built, type Judgement, type Layout, type Level, type LevelMino } from './level';
import { Stack } from './stack';
import type { ShapeCell } from './types';

const cellKey = (c: ShapeCell, dx: number, dy: number) => `${c.x + dx},${c.y + dy},${c.cell.kind},${c.cell.inner},${c.cell.end}`;

/** 판 위 칸 목록(상대 좌표 cells, 기준 x,y) 과 같은 SRS 자세. 없으면 null */
export function srsPoseOf(defId: string, cells: ShapeCell[], x: number, y: number, defs: MinoDef[] = MINOS): LevelMino | null {
  const want = new Set(cells.map((c) => cellKey(c, x, y)));
  for (let r = 0; r < 4; r++) {
    const st = srsCells(defId, r, defs);
    const minX = Math.min(...st.map((c) => c.x));
    const minY = Math.min(...st.map((c) => c.y));
    const px = x - minX;
    const py = y - minY;
    if (st.length === want.size && st.every((c) => want.has(cellKey(c, px, py)))) return { id: defId, r, x: px, y: py };
  }
  return null;
}

/** 고정 판 위에 minos 를 중력으로 모두 놓을 수 있는 순서. 없으면 null (판은 건드리지 않음) */
export function findDropOrder(built: Built, minos: LevelMino[], defs: MinoDef[] = MINOS): LevelMino[] | null {
  const board = built.board;
  const failed = new Set<string>();
  const order: LevelMino[] = [];
  const left = minos.map((_, i) => i);
  const rec = (): boolean => {
    if (left.length === 0) return true;
    const key = left.join(',');
    if (failed.has(key)) return false;
    const stack = new Stack(board, {}, defs);
    for (const [k, i] of left.entries()) {
      const m = minos[i]!;
      if (!stack.reachableLocks(m.id).some((p) => p.r === m.r && p.x === m.x && p.y === m.y)) continue;
      const placed = board.placeCells(m.id, m.r, srsCells(m.id, m.r, defs), m.x, m.y)!;
      left.splice(k, 1);
      order.push(m);
      if (rec()) {
        board.removeUid(placed.uid);
        return true;
      }
      order.pop();
      left.splice(k, 0, i);
      board.removeUid(placed.uid);
    }
    failed.add(key);
    return false;
  };
  return rec() ? order.slice() : null;
}

export interface LevelMeta {
  id: string;
  name: string;
  mechanic: string;
  bins: Level['bins'];
  allowed: Level['allowed'];
}

export type SaveResult =
  | { ok: true; level: Level; judgement: Judgement }
  | { ok: false; reason: string; judgement?: Judgement };

/**
 * 현재 샌드박스 판을 참조 풀이로 하는 레벨을 만든다.
 * isFixedMino / isFixedPart 로 고른 것은 레벨에 미리 박힌 고정 미노·부품이 된다.
 */
export function levelFromBoard(
  board: Board,
  queue: Level['queue'],
  meta: LevelMeta,
  isFixedMino: (uid: number) => boolean,
  isFixedPart: (cellIndex: number) => boolean,
  prices: PriceTable,
  defs: MinoDef[] = MINOS,
): SaveResult {
  if (queue.length === 0) return { ok: false, reason: '대기열이 비어 있다' };
  if (meta.bins.length !== binCount(board.w)) return { ok: false, reason: '통 조건 개수가 판 가로와 맞지 않다' };
  const fixed: Layout = { minos: [], parts: [] };
  const player: LevelMino[] = [];
  for (const p of board.placed) {
    const pose = srsPoseOf(p.defId, p.cells, p.x, p.y, defs);
    if (!pose) return { ok: false, reason: `미노 ${p.defId} 의 자세를 중력 모드로 바꿀 수 없다` };
    if (isFixedMino(p.uid)) fixed.minos.push(pose);
    else {
      if (!meta.allowed.minos.includes(p.defId)) return { ok: false, reason: `풀이에 쓴 미노 ${p.defId} 가 사용 가능 목록에 없다` };
      player.push(pose);
    }
  }
  const parts: Layout['parts'] = [];
  for (const [i, part] of board.parts) {
    const lp = fromPart(i % board.w, Math.floor(i / board.w), part);
    if (isFixedPart(i)) fixed.parts.push(lp);
    else {
      if (!meta.allowed.parts.includes(part.type)) return { ok: false, reason: `풀이에 쓴 부품 ${part.type} 가 사용 가능 목록에 없다` };
      parts.push(lp);
    }
  }
  const level: Level = { ...meta, w: board.w, h: board.h, queue, budget: 0 };
  if (fixed.minos.length || fixed.parts.length) level.fixed = fixed;
  let built: Built;
  try {
    built = buildFixed(level, defs);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const order = findDropOrder(built, player, defs);
  if (!order) return { ok: false, reason: '중력으로 쌓을 수 없는 배치다 (떠 있는 미노가 있거나 위가 막힘)' };
  level.solution = { minos: order, parts };
  // 가격을 먼저 재고(예산 0 이라 초과로 나옴), 예산을 정한 뒤 다시 판정
  const first = verifyLayout(level, level.solution, prices, defs);
  if (first.error) return { ok: false, reason: first.error };
  level.budget = budgetFromReference(first.judgement!.price);
  const r = verifyLayout(level, level.solution, prices, defs);
  const j = r.judgement!;
  if (j.loop) return { ok: false, reason: '무한 루프', judgement: j };
  if (!j.binsOk.every(Boolean)) return { ok: false, reason: '통 조건이 맞지 않다', judgement: j };
  if (!j.clear) return { ok: false, reason: '클리어 판정 실패', judgement: j };
  return { ok: true, level, judgement: j };
}
