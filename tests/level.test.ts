import { describe, expect, it } from 'vitest';
import {
  binsMatch,
  budgetFromReference,
  overBudget,
  parseLevel,
  serializeLevel,
  verifyLayout,
  type Level,
} from '../src/core/level';
import type { PriceTable } from '../src/data/prices';
import { RULE_MINOS as M } from './fixtures/minos';

const P: PriceTable = {
  minos: Object.fromEntries(M.map((d) => [d.id, d.id.endsWith('empty') ? 1 : 5])),
  parts: { plug: 1, gear: 1, sensor: 2, motor: 3, switch: 3 },
};

/** 4×6 판, 통 2개. 빨강 왼쪽 → 파랑 오른쪽 */
function base(): Level {
  return {
    id: 't',
    name: '테스트',
    mechanic: '',
    w: 4,
    h: 6,
    queue: [
      { color: 'red', inject: 'left' },
      { color: 'blue', inject: 'right' },
    ],
    bins: [
      { red: 1, blue: 0 },
      { red: 0, blue: 1 },
    ],
    allowed: { minos: ['I-tube'], parts: ['plug'] },
    budget: 6,
  };
}

describe('통 조건 판정', () => {
  it('색별 마릿수가 모두 같아야 맞음', () => {
    const tally = { bins: [[1, 0], [0, 2]], stopped: [0, 0] };
    expect(binsMatch(tally, [{ red: 1, blue: 0 }, { red: 0, blue: 2 }])).toEqual([true, true]);
    expect(binsMatch(tally, [{ red: 1, blue: 0 }, { red: 0, blue: 1 }])).toEqual([true, false]);
    expect(binsMatch(tally, [{ red: 0, blue: 1 }, { red: 0, blue: 2 }])).toEqual([false, true]);
  });
  it('빈 판: 빨강 열 0 → 통 0, 파랑 열 3 → 통 1 → 클리어 (가격 0)', () => {
    const r = verifyLayout(base(), { minos: [], parts: [] }, P, M);
    expect(r.error).toBeNull();
    expect(r.judgement!.tally.bins).toEqual([[1, 0], [0, 1]]);
    expect(r.judgement!.price).toBe(0);
    expect(r.judgement!.clear).toBe(true);
  });
  it('조건이 바뀌면 실패', () => {
    const lv = base();
    lv.bins = [{ red: 0, blue: 1 }, { red: 1, blue: 0 }];
    const j = verifyLayout(lv, { minos: [], parts: [] }, P, M).judgement!;
    expect(j.binsOk).toEqual([false, false]);
    expect(j.clear).toBe(false);
  });
  it('바닥 가로 I: 둘 다 튕겨서 통이 비어 실패', () => {
    // I r0 스폰 x=0, 가로줄은 상자 y=1 → 바닥(5행)에 닿는 자세 y=4
    const j = verifyLayout(base(), { minos: [{ id: 'I-tube', r: 0, x: 0, y: 4 }], parts: [] }, P, M).judgement!;
    expect(j.tally.bins).toEqual([[0, 0], [0, 0]]);
    expect(j.tally.stopped).toEqual([1, 1]);
    expect(j.clear).toBe(false);
  });
});

describe('예산', () => {
  it('예산 = 참조 가격 × 1.25 올림', () => {
    expect(budgetFromReference(8)).toBe(10);
    expect(budgetFromReference(7)).toBe(9); // 8.75
    expect(budgetFromReference(10)).toBe(13); // 12.5
    expect(budgetFromReference(0)).toBe(0);
  });
  it('초과 판정: 같으면 통과, 1 넘으면 초과', () => {
    expect(overBudget(10, 10)).toBe(false);
    expect(overBudget(11, 10)).toBe(true);
  });
  // 세로 I (r1, 상자 x=2 열) 를 x=-2 에 → 판 열 0, 2~5행. 빨강은 위로 받아져 아래로 → 통 0
  const vertical = { minos: [{ id: 'I-tube', r: 1, x: -2, y: 2 }], parts: [] };
  it('세로 I 하나(5원): 예산 6 이면 클리어', () => {
    const j = verifyLayout(base(), vertical, P, M).judgement!;
    expect(j.tally.bins).toEqual([[1, 0], [0, 1]]);
    expect(j.price).toBe(5);
    expect(j.clear).toBe(true);
  });
  it('예산 4 면 통 조건은 맞아도 초과로 실패', () => {
    const lv = base();
    lv.budget = 4;
    const j = verifyLayout(lv, vertical, P, M).judgement!;
    expect(j.binsOk).toEqual([true, true]);
    expect(j.overBudget).toBe(true);
    expect(j.clear).toBe(false);
  });
  it('고정 미노는 0원', () => {
    const lv = base();
    lv.budget = 0;
    lv.fixed = vertical;
    const j = verifyLayout(lv, { minos: [], parts: [] }, P, M).judgement!;
    expect(j.price).toBe(0);
    expect(j.clear).toBe(true);
  });
});

describe('풀이 놓기 검사', () => {
  it('공중에 뜬 자세는 중력으로 도달 불가', () => {
    const r = verifyLayout(base(), { minos: [{ id: 'I-tube', r: 0, x: 0, y: 1 }], parts: [] }, P, M);
    expect(r.error).toMatch(/도달할 수 없다/);
  });
  it('허용 안 된 미노·부품은 실패', () => {
    expect(verifyLayout(base(), { minos: [{ id: 'O-tube', r: 0, x: 1, y: 4 }], parts: [] }, P, M).error).toMatch(/쓸 수 없다/);
    expect(
      verifyLayout(base(), { minos: [{ id: 'I-tube', r: 1, x: -2, y: 2 }], parts: [{ x: 0, y: 2, type: 'gear' }] }, P, M).error,
    ).toMatch(/쓸 수 없다/);
  });
  it('부품 규칙 위반은 실패 (마개는 경로 끝만)', () => {
    const lv = base();
    const r = verifyLayout(lv, { minos: [{ id: 'I-tube', r: 1, x: -2, y: 2 }], parts: [{ x: 0, y: 3, type: 'plug' }] }, P, M);
    expect(r.error).toMatch(/마개/);
  });
});

describe('레벨 JSON', () => {
  const full: Level = {
    ...base(),
    allowed: { minos: ['I-tube', 'O-empty'], parts: ['motor', 'switch', 'sensor'] },
    fixed: { minos: [{ id: 'O-empty', r: 0, x: 2, y: 4 }], parts: [{ x: 2, y: 4, type: 'motor', dir: 'ccw' }] },
    solution: { minos: [{ id: 'I-tube', r: 1, x: -2, y: 2 }], parts: [{ x: 1, y: 1, type: 'switch', common: 'W', start: 'B' }] },
  };
  it('저장 → 불러오기 하면 같다', () => {
    expect(parseLevel(serializeLevel(full))).toEqual(full);
    expect(parseLevel(serializeLevel(base()))).toEqual(base());
  });
  it('잘못된 JSON 은 이유와 함께 거부', () => {
    expect(() => parseLevel('{')).toThrow(/문법/);
    const bad = JSON.parse(serializeLevel(base()));
    bad.bins = [{ red: 1, blue: 0 }];
    expect(() => parseLevel(bad)).toThrow(/통 개수\(2\)/);
    const bad2 = JSON.parse(serializeLevel(base()));
    bad2.queue[0].color = 'green';
    expect(() => parseLevel(bad2)).toThrow(/color/);
    const bad3 = JSON.parse(serializeLevel(base()));
    bad3.allowed.parts = ['laser'];
    expect(() => parseLevel(bad3)).toThrow(/알 수 없음/);
  });
});
