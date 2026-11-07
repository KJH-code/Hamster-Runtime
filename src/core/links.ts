/**
 * 튜브 자동 연결. 순수 로직.
 *  - 경로 중간 칸은 미노 안 앞뒤 칸과만 연결
 *  - 경로 끝 칸은 상하좌우 이웃 중 "다른 미노의, 마개 없는 경로 끝"과 서로 연결
 *  - 그런 이웃이 하나도 없으면 직진 방향(경로가 들어온 반대쪽)으로 열린 출구
 *  - 마개가 있는 끝은 외부 연결도 출구도 없다(닫힘)
 *  - 연결이 3갈래 이상인 칸 = 분기점 (끝 칸에서만 생긴다)
 */
import type { Board } from './board';
import { opposite, popcount, sideDelta, SIDE_LIST, type Sides } from './types';

export interface Links {
  /** 칸 인덱스 → 연결된 변 (미노 안 + 자동 연결). 튜브가 아니면 0 */
  link: Sides[];
  /** 칸 인덱스 → 직진 출구 변 (없으면 0) */
  exit: Sides[];
}

function isOpenEnd(board: Board, i: number): boolean {
  const c = board.cells[i];
  if (!c || c.kind !== 'tube' || !c.end) return false;
  return board.parts.get(i)?.type !== 'plug';
}

export function computeLinks(board: Board): Links {
  const n = board.w * board.h;
  const link = new Array<Sides>(n).fill(0);
  const exit = new Array<Sides>(n).fill(0);
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const i = board.idx(x, y);
      const c = board.cells[i];
      if (!c || c.kind !== 'tube') continue;
      link[i] = c.inner;
      if (!isOpenEnd(board, i)) continue;
      let ext = 0;
      for (const s of SIDE_LIST) {
        if (c.inner & s) continue;
        const [dx, dy] = sideDelta(s);
        if (!board.inBounds(x + dx, y + dy)) continue;
        const j = board.idx(x + dx, y + dy);
        if (board.owner[j] !== board.owner[i] && isOpenEnd(board, j)) ext |= s;
      }
      link[i] |= ext;
      if (ext === 0) exit[i] = opposite(c.inner);
    }
  return { link, exit };
}

/** 연결 갈래 수 */
export function degree(l: Links, i: number): number {
  return popcount(l.link[i]!);
}
export function isJunction(l: Links, i: number): boolean {
  return degree(l, i) >= 3;
}
