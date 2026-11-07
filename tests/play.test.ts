import { describe, expect, it } from 'vitest';
import type { Level } from '../src/core/level';
import { LevelPlay } from '../src/core/play';
import type { PriceTable } from '../src/data/prices';
import { RULE_MINOS as M } from './fixtures/minos';

const P: PriceTable = {
  minos: Object.fromEntries(M.map((d) => [d.id, d.id.endsWith('empty') ? 1 : 5])),
  parts: { plug: 1, gear: 1, sensor: 2, motor: 3, switch: 3 },
};

/** 4×6, 통 2개. 세로 I 를 왼쪽 벽에 세우면 빨강이 그 안을 지나 통 0 */
function small(): Level {
  return {
    id: 's', name: 's', mechanic: '', w: 4, h: 6,
    queue: [{ color: 'red', inject: 'left' }, { color: 'blue', inject: 'right' }],
    bins: [{ red: 1, blue: 0 }, { red: 0, blue: 1 }],
    allowed: { minos: ['I-tube'], parts: ['plug'] },
    budget: 6,
  };
}

/**
 * 6×6. 고정: 세로 I (열 1, 2~5행) + 가로 I (2행, 열 2~5).
 * (1,2) 는 세로 I 윗끝, 가로 I 왼끝과 이어져 2갈래.
 */
function junction(): Level {
  return {
    id: 'j', name: 'j', mechanic: '', w: 6, h: 6,
    queue: [{ color: 'red', inject: 'left' }],
    bins: [{ red: 0, blue: 0 }, { red: 0, blue: 0 }, { red: 0, blue: 0 }],
    allowed: { minos: ['I-tube', 'O-tube'], parts: ['switch', 'plug'] },
    budget: 99,
    fixed: { minos: [{ id: 'I-tube', r: 1, x: -1, y: 2 }, { id: 'I-tube', r: 0, x: 2, y: 1 }], parts: [] },
  };
}

/** 세로 I 를 왼쪽 벽까지 밀어 떨어뜨린다 */
function dropVerticalLeft(p: LevelPlay) {
  expect(p.spawn('I-tube').ok).toBe(true);
  p.rotate(1);
  while (p.move(-1));
  return p.hardDrop();
}

describe('레벨 플레이 — 미노', () => {
  it('허용 안 된 미노는 스폰 안 됨', () => {
    expect(new LevelPlay(small(), M, P).spawn('O-tube').ok).toBe(false);
  });
  it('스폰 → 회전 → 왼쪽 끝 → 하드 드롭 → 바닥에 세로로 선다', () => {
    const p = new LevelPlay(small(), M, P);
    expect(dropVerticalLeft(p).ok).toBe(true);
    expect(p.layout().minos).toEqual([{ id: 'I-tube', r: 1, x: -2, y: 2 }]);
    for (let y = 2; y < 6; y++) expect(p.board.at(0, y)?.kind).toBe('tube');
    expect(p.price()).toBe(5);
    expect(p.runAll().clear).toBe(true);
  });
  it('마지막 미노 지우기 · 되돌리기 · 다시 하기', () => {
    const p = new LevelPlay(small(), M, P);
    dropVerticalLeft(p);
    expect(p.removeLastMino().ok).toBe(true);
    expect(p.board.placed.length).toBe(0);
    expect(p.removeLastMino().ok).toBe(false);
    expect(p.undo()).toBe(true);
    expect(p.board.placed.length).toBe(1);
    expect(p.undo()).toBe(true); // 드롭 자체를 되돌림
    expect(p.board.placed.length).toBe(0);
    expect(p.redo()).toBe(true);
    expect(p.layout().minos).toEqual([{ id: 'I-tube', r: 1, x: -2, y: 2 }]);
  });
  it('떨어지는 중이면 되돌리기는 그 미노만 취소', () => {
    const p = new LevelPlay(small(), M, P);
    dropVerticalLeft(p);
    p.spawn('I-tube');
    expect(p.undo()).toBe(true);
    expect(p.active).toBeNull();
    expect(p.board.placed.length).toBe(1);
  });
  it('고정 미노는 지울 수 없다 (플레이어 미노가 없으면 지울 것 없음)', () => {
    const p = new LevelPlay(junction(), M, P);
    expect(p.removeLastMino().ok).toBe(false);
    expect(p.board.placed.length).toBe(2);
    expect(p.price()).toBe(0);
  });
});

describe('레벨 플레이 — 부품', () => {
  it('허용 안 된 부품은 못 놓음, 규칙도 그대로', () => {
    const p = new LevelPlay(small(), M, P);
    dropVerticalLeft(p);
    expect(p.placePart(0, 3, 'gear').ok).toBe(false); // 허용 안 됨
    expect(p.placePart(0, 3, 'plug').ok).toBe(false); // 경로 중간
    expect(p.placePart(0, 2, 'plug').ok).toBe(true); // 윗끝
    expect(p.price()).toBe(6);
    // 윗끝이 막혀 빨강이 튕긴다
    expect(p.runAll().tally.stopped).toEqual([1, 0]);
  });
  it('고정 부품은 지울 수 없다', () => {
    const lv = small();
    lv.fixed = { minos: [{ id: 'I-tube', r: 1, x: -2, y: 2 }], parts: [{ x: 0, y: 2, type: 'plug' }] };
    const p = new LevelPlay(lv, M, P);
    expect(p.removePart(0, 2).ok).toBe(false);
    expect(p.price()).toBe(0);
  });
  it('스위치 분기점의 갈래를 바꾸는 미노 제거·착지는 거부', () => {
    const p = new LevelPlay(junction(), M, P);
    // 왼쪽 벽 세로 I (열 0, 2~5행) → (1,2) 가 3갈래(아래·오른쪽·왼쪽)
    expect(dropVerticalLeft(p).ok).toBe(true);
    expect(p.placePart(1, 2, 'switch').ok).toBe(true);
    expect(p.removeLastMino().ok).toBe(false);
    expect(p.board.placed.length).toBe(3);
    // ∩ 모양 O (r2) 를 열 0~1, 0~1행에 → (1,1) 끝이 (1,2) 위에 붙어 4갈래가 되므로 거부
    p.spawn('O-tube');
    p.rotate(1);
    p.rotate(1);
    while (p.move(-1));
    const r = p.hardDrop();
    expect(r.ok).toBe(false);
    expect(p.board.placed.length).toBe(3);
    expect(p.active).not.toBeNull(); // 미노는 그대로 들고 있다
  });
});
