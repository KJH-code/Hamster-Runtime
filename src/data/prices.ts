/**
 * 가격표 (데이터). 재혁이 여기서 직접 고친다 — 초안.
 * 미노는 defId 별, 부품은 종류별(모터는 방향과 상관없이 같은 값).
 * 값을 바꾸면 레벨 예산(참조 풀이 가격 × 1.25)과 어긋날 수 있다 → tests/levels.test.ts 가 알려준다.
 */
import type { PartType } from '../core/types';

export interface PriceTable {
  minos: Record<string, number>;
  parts: Record<PartType, number>;
}

export const PRICES: PriceTable = {
  minos: {
    'I-tube': 2,
    'I-empty': 1,
    'O-tube': 2,
    'O-empty': 1,
    'T-tube-a': 2,
    'T-tube-b': 2,
    'T-empty': 1,
    'S-tube': 2,
    'S-empty': 1,
    'Z-tube': 2,
    'Z-empty': 1,
    'L-tube': 2,
    'L-empty': 1,
    'J-tube': 2,
    'J-empty': 1,
  },
  parts: {
    plug: 1,
    gear: 1,
    sensor: 2,
    motor: 3,
    switch: 3,
  },
};
