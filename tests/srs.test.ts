import { describe, expect, it } from 'vitest';
import { MINOS } from '../src/data/minos';
import { kicks, srsPiece } from '../src/core/srs';
import { N, S, E, W } from '../src/core/types';

const key = (cs: { x: number; y: number }[]) => cs.map((c) => `${c.x},${c.y}`).sort().join(' ');
const def = (id: string) => MINOS.find((m) => m.id === id)!;

describe('SRS 모양', () => {
  it('모든 미노가 자기 글자의 SRS 스폰 모양으로 맞춰진다', () => {
    const spawn: Record<string, string> = {
      I: '0,1 1,1 2,1 3,1',
      O: '0,0 0,1 1,0 1,1',
      T: '0,1 1,0 1,1 2,1',
      S: '0,1 1,0 1,1 2,0',
      Z: '0,0 1,0 1,1 2,1',
      J: '0,0 0,1 1,1 2,1',
      L: '0,1 1,1 2,0 2,1',
    };
    for (const d of MINOS) expect(key(srsPiece(d).states[0]!), d.id).toBe(spawn[d.piece]);
  });
  it('T 상태 1(R)은 세로줄 + 오른쪽 혹', () => {
    expect(key(srsPiece(def('T-switch')).states[1]!)).toBe('1,0 1,1 1,2 2,1');
  });
  it('I 상태 1 은 3번째 열 세로줄', () => {
    expect(key(srsPiece(def('I-tube')).states[1]!)).toBe('2,0 2,1 2,2 2,3');
  });
  it('T-스위치는 스폰 방향에서 분기기(공통 변이 위)', () => {
    const sw = srsPiece(def('T-switch')).states[0]!.find((c) => c.cell.kind === 'switch')!;
    expect([sw.x, sw.y]).toEqual([1, 1]);
    expect(sw.cell.common).toBe(N);
  });
  it('칸 요소도 같이 돈다: I-튜브 상태 0 은 가로 튜브, 상태 1 은 세로 튜브', () => {
    const p = srsPiece(def('I-tube'));
    for (const c of p.states[0]!) expect(c.cell.open).toBe(E | W);
    for (const c of p.states[1]!) expect(c.cell.open).toBe(N | S);
  });
});

describe('월킥 표', () => {
  it('JLSTZ 0→R 은 (0,0),(-1,0),(-1,-1),(0,2),(-1,2) — y 아래가 +', () => {
    expect(kicks('T', 0, 1)).toEqual([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]);
  });
  it('I 0→R 은 (0,0),(-2,0),(1,0),(-2,1),(1,-2)', () => {
    expect(kicks('I', 0, 1)).toEqual([[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]]);
  });
  it('O 는 킥 없음', () => {
    expect(kicks('O', 0, 1)).toEqual([[0, 0]]);
  });
});
