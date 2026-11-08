import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { buildFixed, parseLevel, serializeLevel, verifyLayout, type Level } from '../src/core/level';
import { findDropOrder, levelFromBoard, srsPoseOf, type LevelMeta } from '../src/core/solution';
import type { PriceTable } from '../src/data/prices';
import { RULE_MINOS as M } from './fixtures/minos';
import { put } from './helpers';

const P: PriceTable = {
  minos: Object.fromEntries(M.map((d) => [d.id, d.id.endsWith('empty') ? 1 : 5])),
  parts: { plug: 1, gear: 1, sensor: 2, motor: 3, switch: 3 },
};
const empty4x6: Level = {
  id: 'x', name: 'x', mechanic: '', w: 4, h: 6,
  queue: [{ color: 'red', inject: 'left' }],
  bins: [{ red: 0, blue: 0 }, { red: 0, blue: 0 }],
  allowed: { minos: [], parts: [] },
  budget: 0,
};

describe('자유 배치 → 중력 자세', () => {
  it('세로 I (열 0, 2~5행) → SRS r1, 상자 x=-2', () => {
    const b = new Board(4, 6);
    const p = put(b, 'I-tube', 0, 0, 2);
    expect(srsPoseOf('I-tube', p.cells, p.x, p.y, M)).toEqual({ id: 'I-tube', r: 1, x: -2, y: 2 });
  });
  it('O (회전 무관 모양) → 상자 좌상단 그대로', () => {
    const b = new Board(4, 6);
    const p = put(b, 'O-empty', 0, 1, 4);
    expect(srsPoseOf('O-empty', p.cells, p.x, p.y, M)).toEqual({ id: 'O-empty', r: 0, x: 1, y: 4 });
  });
});

describe('떨어뜨리는 순서 찾기', () => {
  it('위에 얹힌 것은 아래 것 다음', () => {
    const built = buildFixed(empty4x6, M);
    const I = { id: 'I-tube', r: 0, x: 0, y: 4 }; // 가로, 5행
    const O = { id: 'O-empty', r: 0, x: 1, y: 3 }; // 3~4행, I 위
    expect(findDropOrder(built, [O, I], M)).toEqual([I, O]);
    expect(built.board.placed.length).toBe(0); // 판은 그대로
  });
  it('떠 있으면 null', () => {
    const built = buildFixed(empty4x6, M);
    expect(findDropOrder(built, [{ id: 'O-empty', r: 0, x: 1, y: 1 }], M)).toBeNull();
  });
});

describe('현재 배치를 참조 풀이로 저장', () => {
  const meta = (bins: LevelMeta['bins']): LevelMeta => ({
    id: 't', name: '시험', mechanic: '한 줄', bins, allowed: { minos: ['I-tube'], parts: [] },
  });
  const queue: Level['queue'] = [{ color: 'red', inject: 'left' }, { color: 'blue', inject: 'right' }];
  const board = () => {
    const b = new Board(4, 6);
    put(b, 'I-tube', 0, 0, 2);
    return b;
  };
  it('통 조건이 맞으면 레벨이 되고, 예산 = 5 × 2 = 10', () => {
    const r = levelFromBoard(board(), queue, meta([{ red: 1, blue: 0 }, { red: 0, blue: 1 }]), () => false, () => false, P, M);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.level.budget).toBe(10);
    expect(r.level.solution!.minos).toEqual([{ id: 'I-tube', r: 1, x: -2, y: 2 }]);
    const again = parseLevel(serializeLevel(r.level));
    expect(verifyLayout(again, again.solution!, P, M).judgement!.clear).toBe(true);
  });
  it('통 조건이 틀리면 저장 거부', () => {
    const r = levelFromBoard(board(), queue, meta([{ red: 0, blue: 1 }, { red: 1, blue: 0 }]), () => false, () => false, P, M);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/통 조건/);
    expect(r.judgement!.binsOk).toEqual([false, false]);
  });
  it('고정으로 고른 미노는 fixed 로, 가격 0 → 예산 0', () => {
    const b = board();
    const uid = b.placed[0]!.uid;
    const r = levelFromBoard(b, queue, meta([{ red: 1, blue: 0 }, { red: 0, blue: 1 }]), (u) => u === uid, () => false, P, M);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.level.fixed!.minos.length).toBe(1);
    expect(r.level.solution!.minos).toEqual([]);
    expect(r.level.budget).toBe(0);
  });
  it('사용 가능 목록에 없는 미노를 쓰면 거부', () => {
    const b = board();
    put(b, 'O-empty', 0, 2, 4);
    const r = levelFromBoard(b, queue, meta([{ red: 1, blue: 0 }, { red: 0, blue: 1 }]), () => false, () => false, P, M);
    expect(r.ok).toBe(false);
  });
});
