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
  it('19개, 번호 순서 (00 = 입문)', () => {
    expect(LEVELS.map((l) => l.id.slice(0, 2))).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18']);
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

describe('막아 둔 우회', () => {
  const byId = (id: string) => LEVELS.find((l) => l.id.startsWith(id))!;
  it('5: 미끼 튜브 위 끝은 고정 마개로 막혀 있어 그 길로는 못 간다', () => {
    // 마개 없이 미끼 위에 J 를 대던 우회 (탐색에서 2원)
    const r = solve(byId('05'), { minos: [{ id: 'J-tube', r: 0, x: 0, y: 2 }], parts: [] });
    expect(r.judgement?.clear ?? false).toBe(false);
  });
  it('6: 왼쪽 갈래 끝 위 (2,5) 는 고정 빈 미노라 분기점을 건너뛸 수 없다', () => {
    const lv = byId('06');
    const { board } = buildFixed(lv);
    expect(board.at(2, 5)?.kind).toBe('empty');
  });
  it('9: 오른쪽 갈래 출구 밑 바닥은 고정 빈 미노라 되돌리는 길을 못 깐다', () => {
    const r = solve(byId('09'), { minos: [{ id: 'I-tube', r: 2, x: 2, y: 6 }], parts: [] });
    expect(r.judgement?.clear ?? false).toBe(false);
  });
  it('17: 오른쪽 고정 기둥이 처마 위(지붕)로 건너가는 길을 막는다', () => {
    // 기둥이 없으면 왼쪽에 받침을 쌓아 지붕 위로 튜브를 깔고 오른쪽 끝(열 12)으로 떨어뜨리는 길이 예산 16 에 딱 맞게 풀린다
    const roof = [
      { id: 'O-empty', r: 0, x: 0, y: 8 }, { id: 'O-empty', r: 0, x: 0, y: 6 }, { id: 'O-empty', r: 0, x: 0, y: 4 }, { id: 'L-tube', r: 1, x: -1, y: 1 },
      { id: 'I-empty', r: 0, x: 3, y: 4 }, { id: 'I-empty', r: 0, x: 7, y: 4 }, { id: 'I-empty', r: 0, x: 2, y: 3 }, { id: 'I-empty', r: 0, x: 6, y: 3 },
      { id: 'I-tube', r: 0, x: 2, y: 2 }, { id: 'I-tube', r: 0, x: 6, y: 2 }, { id: 'Z-empty', r: 0, x: 10, y: 4 }, { id: 'J-tube', r: 2, x: 10, y: 2 },
    ];
    const r = solve(byId('16'), { minos: roof, parts: [] });
    expect(r.judgement?.clear ?? false).toBe(false);
  });
  it('13: 오른쪽 투입구 위 (5,0) 는 고정 빈 미노라 합류 문을 건너뛰는 길을 못 깐다', () => {
    // 오른쪽 위로 L·I 를 돌려 대고 (4,3) 을 마개로 막던 우회 (탐색에서 5원)
    const r = solve(byId('13'), { minos: [{ id: 'L-tube', r: 0, x: 4, y: 0 }, { id: 'I-tube', r: 0, x: 1, y: -1 }], parts: [{ x: 4, y: 3, type: 'plug' }] });
    expect(r.judgement?.clear ?? false).toBe(false);
  });
});