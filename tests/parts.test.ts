import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { activeArm, cycleCommon, partRuleError, switchArms } from '../src/core/parts';
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

describe('스위치 갈래 이름', () => {
  it('공통에서 시계 방향 순서로 A, B, C', () => {
    expect(switchArms(N | E | W, N)).toEqual([E, W]);
    expect(switchArms(N | E | W, E)).toEqual([W, N]);
    expect(switchArms(N | E | S | W, N)).toEqual([E, S, W]);
    expect(switchArms(N | E | S | W, W)).toEqual([N, E, S]);
  });
  it('상태 → 열린 갈래', () => {
    const p = { type: 'switch' as const, arms: N | E | S | W, common: N };
    expect(activeArm(p, 'A')).toBe(E);
    expect(activeArm(p, 'B')).toBe(S);
    expect(activeArm(p, 'C')).toBe(W);
  });
  it('공통 갈래 돌리기: 실제 갈래 중에서만 순환', () => {
    expect(cycleCommon(N | E | W, N, 1)).toBe(E);
    expect(cycleCommon(N | E | W, E, 1)).toBe(W); // S 는 갈래가 아님
    expect(cycleCommon(N | E | W, N, -1)).toBe(W);
  });
});
