import { describe, expect, it } from 'vitest';
import { buildLevelBoard, gradeCase, gradeLevel, matches } from '../src/core/level';
import { Stack } from '../src/core/stack';
import { LEVELS } from '../src/data/levels';
import { template } from '../src/data/levels/template';
import { Board } from '../src/core/board';

/*
 * 레벨 풀이 검증. 아래 풀이는 "풀 수 있다"는 증명용이다 — 화면에는 나오지 않는다.
 * 각 수는 [미노 id, SRS 방향, 상자 x, 상자 y]. 스폰에서 실제 조작(좌우·소프트 드롭·SRS 회전)으로
 * 그 자세에 도달할 수 있고 바닥에 닿아 있어야(고정 가능) 한다.
 */
const SOLUTIONS: Record<string, [string, number, number, number][]> = {
  '01-splitter': [
    ['L-tube', 0, 0, 2],
    ['L-tube', 1, 0, 5],
    ['J-tube', 0, 0, 0],
  ],
  '02-one-time-door': [
    ['I-tube', 0, 4, 8],
    ['O-gear', 0, 0, 8],
    ['L-tube', 1, -1, 5],
    ['I-sensor', 3, 2, 6],
    ['S-motor', 1, 3, 6],
    ['O-gear', 0, 5, 5],
    ['O-gear', 0, 5, 3],
    ['Z-motor', 0, 2, 2],
    ['L-tube', 1, -1, 2],
  ],
};

function play(levelId: string) {
  const level = LEVELS.find((l) => l.id === levelId)!;
  const board = buildLevelBoard(level);
  const st = new Stack(board, level.supply);
  for (const [id, r, x, y] of SOLUTIONS[levelId]!) {
    const reach = st.reachableLocks(id);
    expect(reach, `${id} r${r} (${x},${y}) 도달 불가`).toContainEqual({ r, x, y });
    expect(st.spawn(id)).toBe(true);
    st.active = { defId: id, r, x, y };
    expect(st.lock()).toBe(true);
  }
  return { level, board };
}

describe('예시 레벨', () => {
  for (const level of LEVELS) {
    it(`${level.title}: 빈 판은 실패 (오답 케이스가 있다)`, () => {
      expect(gradeLevel(level, buildLevelBoard(level)).ok).toBe(false);
    });
    it(`${level.title}: 공급 안에서 중력 조작으로 풀 수 있다`, () => {
      const { board } = play(level.id);
      const g = gradeLevel(level, board);
      expect(g.ok).toBe(true);
    });
  }
  it('템플릿 데이터가 판에 놓인다', () => {
    expect(() => buildLevelBoard(template)).not.toThrow();
  });
});

describe('채점', () => {
  it('통 기대: 그 통에 들어가야만 통과', () => {
    expect(matches({ bin: 1 }, 'binned', 1)).toBe(true);
    expect(matches({ bin: 1 }, 'binned', 2)).toBe(false);
    expect(matches({ bin: 1 }, 'dead', null)).toBe(false);
  });
  it('실패 기대: 종류가 맞아야 통과, any 는 아무 실패나, 통에 들어가면 실패', () => {
    expect(matches({ fail: 'dead' }, 'dead', null)).toBe(true);
    expect(matches({ fail: 'dead' }, 'crashed', null)).toBe(false);
    expect(matches({ fail: 'any' }, 'loop', null)).toBe(true);
    expect(matches({ fail: 'any' }, 'binned', 0)).toBe(false);
  });
  it('케이스 안에서는 스위치 상태가 다음 햄스터로 이어진다', () => {
    // 일회용 문 풀이: 첫 마리가 스위치를 B 로 바꾸므로 둘째는 막힌다
    const { board } = play('02-one-time-door');
    const r = gradeCase(board, {
      name: 't',
      hamsters: [
        { inject: 'left', expect: { bin: 1 } },
        { inject: 'left', expect: { fail: 'dead' } },
      ],
    });
    expect(r.hamsters.map((h) => h.status)).toEqual(['binned', 'dead']);
  });
  it('케이스가 바뀌면 상태 초기화: 한 마리짜리 케이스 두 개는 둘 다 통과', () => {
    const { level, board } = play('02-one-time-door');
    const one = { name: 'x', hamsters: [{ inject: 'left' as const, expect: { bin: 1 } }] };
    const g = gradeLevel({ ...level, cases: [one, one] }, board);
    expect(g.cases.map((c) => c.ok)).toEqual([true, true]);
  });
  it('통 개수는 판 가로/2: 가로 6 판에서 오른쪽 끝 열은 통 2', () => {
    const b = new Board(6, 4);
    const r = gradeCase(b, { name: 'r', hamsters: [{ inject: 'right', expect: { bin: 2 } }] });
    expect(r.ok).toBe(true);
  });
});
