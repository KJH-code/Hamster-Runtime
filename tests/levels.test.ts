/**
 * 실제 레벨 세트 검증. src/data 의 미노·가격을 그대로 쓴다 (재혁이 바꾸면 여기서 알려준다).
 */
import { describe, expect, it } from 'vitest';
import { budgetFromReference, buildFixed, verifyLayout, type Layout, type Level } from '../src/core/level';
import { Stack } from '../src/core/stack';
import { LEVELS } from '../src/data/levels';
import { PRICES } from '../src/data/prices';

/** × 2 규칙의 예외 (재혁이 정함). 2번: 참조 1원 × 2 = 2 는 너무 빡빡해서 6 (2026-11-08) */
const BUDGET_OVERRIDE: Record<string, number> = { '02-junction-plug': 6 };
const solve = (lv: Level, layout: Layout) => verifyLayout(lv, layout, PRICES);

describe('레벨 세트', () => {
  it('10개, 번호 순서', () => {
    expect(LEVELS.map((l) => l.id.slice(0, 2))).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  });
  for (const lv of LEVELS) {
    describe(lv.id, () => {
      it('핵심 메커니즘 한 줄이 있다', () => {
        expect(lv.mechanic.length).toBeGreaterThan(5);
        expect(lv.mechanic).not.toMatch(/\n/);
      });
      it('참조 풀이가 중력으로 놓이고 클리어한다', () => {
        const r = solve(lv, lv.solution!);
        expect(r.error).toBeNull();
        expect(r.judgement!.finished).toBe(true);
        expect(r.judgement!.binsOk.every(Boolean)).toBe(true);
        expect(r.judgement!.clear).toBe(true);
      });
      it('예산 = 참조 풀이 가격 × 2 (prices.ts 를 바꾸면 budget 도 고친다)', () => {
        const price = solve(lv, lv.solution!).judgement!.price;
        expect(lv.budget).toBe(BUDGET_OVERRIDE[lv.id] ?? budgetFromReference(price));
      });
      it('통 조건의 합 = 대기열 마릿수', () => {
        const red = lv.queue.filter((q) => q.color === 'red').length;
        expect(lv.bins.reduce((s, b) => s + b.red, 0)).toBe(red);
        expect(lv.bins.reduce((s, b) => s + b.blue, 0)).toBe(lv.queue.length - red);
      });
      it('빈 판(고정만)으로는 클리어하지 못한다', () => {
        expect(solve(lv, { minos: [], parts: [] }).judgement!.clear).toBe(false);
      });
      it('쓸 수 있는 미노는 처음에 스폰할 수 있다 (스폰 자리가 비어 있음)', () => {
        const { board } = buildFixed(lv);
        const st = new Stack(board, Object.fromEntries(lv.allowed.minos.map((id) => [id, 1])));
        for (const id of lv.allowed.minos) expect(st.fits(id, st.spawnPose(id)), id).toBe(true);
      });
    });
  }
});

describe('막아 둔 우회 (재혁 요청 2026-11-08)', () => {
  const byId = (id: string) => LEVELS.find((l) => l.id.startsWith(id))!;
  it('3: 마개 하나로는 스위치 없이 못 푼다 (튜브 끝 어디에 꽂아도)', () => {
    const lv = byId('03');
    const { board } = buildFixed(lv);
    let tried = 0;
    for (let i = 0; i < board.w * board.h; i++) {
      const c = board.cells[i];
      if (!c || c.kind !== 'tube' || !c.end) continue;
      tried++;
      const r = solve(lv, { minos: [], parts: [{ x: i % board.w, y: Math.floor(i / board.w), type: 'plug' }] });
      expect(r.judgement?.clear ?? false, `plug ${i % board.w},${Math.floor(i / board.w)}`).toBe(false);
    }
    expect(tried).toBe(8); // 고정 미노 4개 × 끝 2개
  });
  it('3: 바닥 줄로 되돌아가는 길은 판에 자리가 없다 (출구가 바로 바닥)', () => {
    const lv = byId('03');
    expect(lv.h).toBe(8);
  });
  it('9: 투입구 아래로 새 길을 깔아 토글을 피하는 풀이는 통 3에 못 간다', () => {
    const lv = byId('09');
    const r = solve(lv, {
      minos: [{ id: 'I-tube', r: 0, x: 2, y: 1 }, { id: 'T-tube-b', r: 2, x: 4, y: -1 }],
      parts: [{ x: 3, y: 3, type: 'plug' }],
    });
    expect(r.judgement?.clear ?? false).toBe(false);
  });
});
