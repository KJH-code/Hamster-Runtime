import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { totalPrice } from '../src/core/price';
import type { PriceTable } from '../src/data/prices';
import { part, put } from './helpers';

// 테스트 전용 가격표 (src/data/prices.ts 를 바꿔도 깨지지 않게)
const P: PriceTable = {
  minos: { 'I-tube': 5, 'O-empty': 1, 'L-tube': 3 },
  parts: { plug: 1, gear: 2, sensor: 4, motor: 7, switch: 10 },
};

describe('가격 합산', () => {
  it('빈 판은 0', () => {
    expect(totalPrice(new Board(), P)).toBe(0);
  });
  it('미노 + 부품', () => {
    const b = new Board();
    put(b, 'I-tube', 0, 0, 0); // 5
    put(b, 'O-empty', 0, 4, 4); // 1
    put(b, 'L-tube', 0, 7, 0); // 3
    part(b, 4, 4, { type: 'motor', dir: 1 }); // 7
    part(b, 5, 4, { type: 'gear' }); // 2
    part(b, 0, 0, { type: 'sensor' }); // 4
    expect(totalPrice(b, P)).toBe(5 + 1 + 3 + 7 + 2 + 4);
  });
  it('모터 방향과 상관없이 같은 값', () => {
    const b = new Board();
    put(b, 'O-empty', 0, 0, 0);
    part(b, 0, 0, { type: 'motor', dir: 1 });
    part(b, 1, 0, { type: 'motor', dir: -1 });
    expect(totalPrice(b, P)).toBe(1 + 7 + 7);
  });
  it('고정 미노·부품은 0원', () => {
    const b = new Board();
    const i = put(b, 'I-tube', 0, 0, 0);
    put(b, 'O-empty', 0, 4, 4);
    part(b, 4, 4, { type: 'motor', dir: 1 });
    part(b, 5, 4, { type: 'gear' });
    const fixed = { minos: new Set([i.uid]), parts: new Set([b.idx(4, 4)]) };
    expect(totalPrice(b, P, fixed)).toBe(1 + 2);
  });
  it('가격표에 없는 미노는 오류', () => {
    const b = new Board();
    put(b, 'S-tube', 0, 0, 0);
    expect(() => totalPrice(b, P)).toThrow();
  });
});
