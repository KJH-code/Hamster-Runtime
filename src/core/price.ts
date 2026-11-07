/**
 * 가격 합산. 순수 로직. 고정(레벨에 미리 박힌) 미노·부품은 0원.
 */
import type { Board } from './board';
import type { PriceTable } from '../data/prices';

export interface Fixed {
  /** 고정 미노 uid */
  minos: Set<number>;
  /** 고정 부품 칸 인덱스 */
  parts: Set<number>;
}
export const NO_FIXED: Fixed = { minos: new Set(), parts: new Set() };

export function minoPrice(defId: string, prices: PriceTable): number {
  const p = prices.minos[defId];
  if (p === undefined) throw new Error(`가격 없음: 미노 ${defId}`);
  return p;
}

/** 판 위의 (고정 아닌) 미노와 부품 가격 합 */
export function totalPrice(board: Board, prices: PriceTable, fixed: Fixed = NO_FIXED): number {
  let sum = 0;
  for (const p of board.placed) if (!fixed.minos.has(p.uid)) sum += minoPrice(p.defId, prices);
  for (const [i, part] of board.parts) if (!fixed.parts.has(i)) sum += prices.parts[part.type];
  return sum;
}
