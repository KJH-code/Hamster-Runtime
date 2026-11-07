import { RULE_MINOS as M } from './fixtures/minos';
import { describe, expect, it } from 'vitest';
import { MINOS } from '../src/data/minos';
import { kicks, srsPiece } from '../src/core/srs';
import { N, S, E, W } from '../src/core/types';

const key = (cs: { x: number; y: number }[]) => cs.map((c) => `${c.x},${c.y}`).sort().join(' ');
const def = (id: string) => M.find((m) => m.id === id)!;

describe('SRS 모양', () => {
  // 이 첫 테스트만 실제 데이터(MINOS)를 검사한다: piece 글자와 rows 모양이 맞는지
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
    expect(key(srsPiece(def('T-tube-a')).states[1]!)).toBe('1,0 1,1 1,2 2,1');
  });
  it('I 상태 1 은 3번째 열 세로줄', () => {
    expect(key(srsPiece(def('I-tube')).states[1]!)).toBe('2,0 2,1 2,2 2,3');
  });
  it('경로 연결도 같이 돈다: I 상태 0 가로(끝은 E/W), 상태 1 세로(끝은 N/S)', () => {
    const p = srsPiece(def('I-tube'));
    const ends = (r: number) => p.states[r]!.filter((c) => c.cell.end).map((c) => c.cell.inner).sort();
    expect(ends(0)).toEqual([E, W].sort());
    expect(ends(1)).toEqual([N, S].sort());
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
