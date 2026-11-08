import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { activeArm, cycleCommon, defaultCommon, partRuleError, switchArms, validCommon } from '../src/core/parts';
import { E, N, S, W } from '../src/core/types';
import { part, put } from './helpers';

describe('부품 배치 규칙', () => {
  const b = new Board(12, 8);
  put(b, 'I-tube', 0, 5, 0); // 세로 튜브 (5,0)~(5,3)
  put(b, 'I-tube', 1, 1, 3);
  put(b, 'I-tube', 1, 6, 3); // (5,3) = 3갈래
  put(b, 'O-empty', 0, 0, 0); // 빈칸 (0,0)(1,0)(0,1)(1,1)
  it('허공에는 아무것도 못 놓는다', () => {
    expect(partRuleError(b, 3, 6, 'gear')).toMatch(/미노 칸/);
  });
  it('모터는 튜브 위 거부, 빈칸 허용', () => {
    expect(partRuleError(b, 5, 1, 'motor')).toMatch(/빈칸/);
    expect(partRuleError(b, 0, 0, 'motor')).toBeNull();
  });
  it('센서·기어는 튜브 위·빈칸 모두 허용', () => {
    expect(partRuleError(b, 5, 1, 'sensor')).toBeNull();
    expect(partRuleError(b, 0, 1, 'sensor')).toBeNull();
    expect(partRuleError(b, 5, 2, 'gear')).toBeNull();
    expect(partRuleError(b, 1, 1, 'gear')).toBeNull();
  });
  it('마개는 경로 끝 칸만 (중간 칸·빈칸 거부)', () => {
    expect(partRuleError(b, 5, 0, 'plug')).toBeNull();
    expect(partRuleError(b, 5, 1, 'plug')).toMatch(/끝 칸/);
    expect(partRuleError(b, 0, 0, 'plug')).toMatch(/끝 칸/);
  });
  it('스위치는 3갈래 이상 분기점만', () => {
    expect(partRuleError(b, 5, 3, 'switch')).toBeNull();
    expect(partRuleError(b, 4, 3, 'switch')).toMatch(/분기점/);
    expect(partRuleError(b, 5, 0, 'switch')).toMatch(/분기점/);
  });
  it('한 칸에 부품 하나', () => {
    const c = new Board(4, 4);
    put(c, 'O-empty', 0, 0, 0);
    part(c, 0, 0, { type: 'gear' });
    expect(partRuleError(c, 0, 0, 'sensor')).toMatch(/이미/);
  });
});

describe('스위치 = ㄱ자 관', () => {
  it('A = 공통의 반시계 쪽 직각 갈래, B = 시계 쪽 직각 갈래', () => {
    expect(switchArms(N | E | W, N)).toEqual([W, E]); // 위 공통: A 왼쪽, B 오른쪽
    expect(switchArms(N | E | S | W, N)).toEqual([W, E]); // 아래(맞은편)는 일자라 갈래 아님
    expect(switchArms(N | E | S | W, W)).toEqual([S, N]);
    expect(switchArms(N | E | S | W, E)).toEqual([N, S]);
  });
  it('양옆 직각 갈래가 없으면 공통이 될 수 없다 (T자 옆)', () => {
    expect(validCommon(N | E | W, N)).toBe(true);
    expect(validCommon(N | E | W, E)).toBe(false); // 아래 갈래 없음
    expect(validCommon(N | E | W, W)).toBe(false);
    expect(switchArms(N | E | W, E)).toEqual([]);
  });
  it('상태 → 열린 갈래', () => {
    const p = { type: 'switch' as const, arms: N | E | S | W, common: N };
    expect(activeArm(p, 'A')).toBe(W);
    expect(activeArm(p, 'B')).toBe(E);
  });
  it('공통 갈래 돌리기: 유효한 공통만, 없으면 그대로', () => {
    expect(cycleCommon(N | E | W, N, 1)).toBe(N);
    expect(cycleCommon(N | E | S | W, N, 1)).toBe(E);
    expect(cycleCommon(N | E | S | W, N, -1)).toBe(W);
  });
  it('기본 공통: 원하는 쪽이 안 되면 첫 유효한 쪽', () => {
    expect(defaultCommon(N | E | W, E)).toBe(N);
    expect(defaultCommon(N | E | W, N)).toBe(N);
  });
});
