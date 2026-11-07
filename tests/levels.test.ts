/**
 * 실제 레벨 세트 검증. src/data 의 미노·가격을 그대로 쓴다 (재혁이 바꾸면 여기서 알려준다).
 */
import { describe, expect, it } from 'vitest';
import { budgetFromReference, buildFixed, verifyLayout, type Layout, type Level } from '../src/core/level';
import { Stack } from '../src/core/stack';
import { LEVELS } from '../src/data/levels';
import { PRICES } from '../src/data/prices';

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
        expect(lv.budget).toBe(budgetFromReference(price));
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
