/**
 * 실제 레벨 세트 검증. src/data 의 미노·가격을 그대로 쓴다 (재혁이 바꾸면 여기서 알려준다).
 */
import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { QueueRun } from '../src/core/hamster';
import { binsMatch, budgetFromReference, buildFixed, queueItems, srsCells, verifyLayout, type Layout, type Level } from '../src/core/level';
import { Stack } from '../src/core/stack';
import { LEVELS } from '../src/data/levels';
import { PRICES } from '../src/data/prices';

const byId = (id: string) => LEVELS.find((l) => l.id.startsWith(id))!;
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
      it('예산 = 참조 풀이 가격 + 25% (prices.ts 를 바꾸면 budget 도 고친다)', () => {
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

describe('메커니즘을 건너뛰는 풀이는 막혀 있다', () => {
  it('1: 미노 하나로는 오른쪽 통에 못 간다 (가능한 착지 전부)', () => {
    const lv = byId('01');
    for (const id of lv.allowed.minos) {
      const board = new Board(lv.w, lv.h);
      for (const p of new Stack(board, {}).reachableLocks(id)) {
        const b = new Board(lv.w, lv.h);
        b.placeCells(id, p.r, srsCells(id, p.r), p.x, p.y);
        const run = new QueueRun(b, queueItems(lv));
        run.runAll();
        expect(binsMatch(run.tally, lv.bins).every(Boolean), `${id} ${JSON.stringify(p)}`).toBe(false);
      }
    }
  });
  it('2: 다른 끝을 막으면 통 조건이 틀린다', () => {
    const lv = byId('02');
    for (const [x, y] of [[2, 1], [3, 1], [3, 4], [5, 3], [0, 0]] as const)
      expect(solve(lv, { minos: [], parts: [{ x, y, type: 'plug' }] }).judgement?.clear ?? false, `${x},${y}`).toBe(false);
  });
  it('3: 시작 상태 B 로는 실패', () => {
    const lv = byId('03');
    expect(solve(lv, { minos: [], parts: [{ x: 3, y: 6, type: 'switch', common: 'N', start: 'B' }] }).judgement!.clear).toBe(false);
  });
  it('4: 센서 없이 스위치만으로는 첫 마리만 다르게 못 보낸다', () => {
    const lv = byId('04');
    for (const start of ['A', 'B'] as const)
      expect(solve(lv, { minos: [], parts: [{ x: 3, y: 6, type: 'switch', common: 'N', start }] }).judgement!.clear).toBe(false);
  });
  it('5: 모터 방향을 반대로 하면 스위치가 거부·잠김', () => {
    const lv = byId('05');
    const wrong = structuredClone(lv.solution!);
    wrong.parts[0]!.dir = 'cw' === wrong.parts[0]!.dir ? 'ccw' : 'cw';
    const j = solve(lv, wrong).judgement!;
    expect(j.clear).toBe(false);
    expect(j.tally.bins[3]).toEqual([2, 2]); // 전부 A 쪽
  });
  it('6: 오른쪽 스위치를 줄에서 떼면 실패', () => {
    const lv = byId('06');
    const cut = structuredClone(lv.solution!);
    cut.parts = cut.parts.filter((p) => !(p.type === 'gear' && (p.x === 6 || p.x === 7)));
    expect(solve(lv, cut).judgement!.clear).toBe(false);
  });
  it('7: 모터 하나로는 한 번만 넘어가고 끝', () => {
    const lv = byId('07');
    const one = structuredClone(lv.solution!);
    one.parts = one.parts.filter((p) => !(p.x === 2 && p.y <= 6 && p.type !== 'switch'));
    expect(solve(lv, one).judgement!.clear).toBe(false);
  });
  it('8: 리셋 모터 하나를 빼면 순환이 끊긴다', () => {
    const lv = byId('08');
    const cut = structuredClone(lv.solution!);
    cut.parts = cut.parts.filter((p) => !(p.x === 8 && p.y === 7));
    expect(solve(lv, cut).judgement!.clear).toBe(false);
  });
  it('9: 아무것도 안 하면 고정 토글이 번갈아 보낸다', () => {
    const j = solve(byId('09'), { minos: [], parts: [] }).judgement!;
    expect(j.tally.bins[0]).toEqual([1, 1]);
    expect(j.clear).toBe(false);
  });
  it('10: 토글 없이 (시작 상태만) 은 실패', () => {
    const lv = byId('10');
    const sw = { minos: lv.solution!.minos, parts: [lv.solution!.parts[0]!] };
    expect(solve(lv, sw).judgement!.clear).toBe(false);
  });
});
