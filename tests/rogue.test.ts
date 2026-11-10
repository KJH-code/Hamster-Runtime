import { describe, expect, it } from 'vitest';
import { budgetMul, clearFloor, drawRewards, floorLevel, newRun, parseRun, pickReward, runPrices, skipFloor, START_MINOS, weeklySeed, type RunState } from '../src/core/rogue';
import { verifyLayout } from '../src/core/level';
import { PRICES } from '../src/data/prices';

describe('로그라이크', () => {
  it('새 런: 1층, 목숨 3, 지갑 0, I·L·J 튜브 + O 빈', () => {
    const st = newRun('s');
    expect([st.floor, st.lives, st.wallet, st.phase]).toEqual([1, 3, 0, 'play']);
    expect(st.minos).toEqual(['I-tube', 'L-tube', 'J-tube', 'O-empty']);
    expect(st.parts).toEqual([]);
  });
  it('유물 가격: 속 빈 나무 = 빈 미노 1 → 0, 코르크 = 마개 0, 싸구려 센서 = 2 → 1', () => {
    const st = { ...newRun('s'), relics: ['hollow', 'cork', 'cheap-eye'] };
    const p = runPrices(st, PRICES);
    expect(p.minos['O-empty']).toBe(0);
    expect(p.minos['I-tube']).toBe(2);
    expect(p.parts.plug).toBe(0);
    expect(p.parts.sensor).toBe(1);
    expect(p.parts.switch).toBe(3);
  });
  it('층을 깨면 남은 돈이 지갑으로: 예산 10 - 가격 6 = 4, 이자 20% 면 +1 (올림), 용돈 +2', () => {
    const st = newRun('s');
    expect(clearFloor(st, 6, 10).wallet).toBe(4);
    expect(clearFloor({ ...st, relics: ['piggy'] }, 6, 10).wallet).toBe(5);
    expect(clearFloor({ ...st, relics: ['piggy', 'allowance'] }, 6, 10).wallet).toBe(7);
    const c = clearFloor(st, 6, 10);
    expect([c.floor, c.cleared, c.phase]).toEqual([2, 1, 'reward']);
    expect(c.offer.length).toBe(3);
  });
  it('포기: 목숨 -1, 다음 층. 마지막 목숨이면 끝', () => {
    const st = skipFloor(newRun('s'));
    expect([st.lives, st.floor, st.phase]).toEqual([2, 2, 'play']);
    expect(skipFloor({ ...st, lives: 1 }).phase).toBe('over');
  });
  it('보상: 가진 것은 안 나오고, 고르면 덱에 들어간다. 유물 여분 쳇바퀴 = 목숨 +1, 해바라기씨 = +6원', () => {
    const st: RunState = { ...newRun('s'), phase: 'reward' };
    const offer = drawRewards(st);
    expect(offer).toEqual(drawRewards(st));
    for (const r of offer) if (r.kind === 'mino') expect(START_MINOS).not.toContain(r.id);
    expect(offer.map((r) => r.kind)).toEqual(['mino', 'part', 'relic']);
    const a = pickReward({ ...st, offer: [{ kind: 'relic', id: 'spare-wheel' }] }, 0);
    expect([a.lives, a.relics, a.phase]).toEqual([4, ['spare-wheel'], 'play']);
    expect(pickReward({ ...st, offer: [{ kind: 'relic', id: 'sunflower' }] }, 0).wallet).toBe(6);
    expect(pickReward({ ...st, offer: [{ kind: 'part', type: 'plug' }] }, 0).parts).toEqual(['plug']);
  });
  it('층: 같은 상태면 같은 레벨, 덱의 미노만으로 풀리고 예산 = 층 예산 + 지갑', () => {
    const st = { ...newRun('seed-a'), wallet: 5 };
    const a = floorLevel(st, PRICES);
    expect(floorLevel(st, PRICES)).toEqual(a);
    expect(a.level.budget).toBe(a.floorBudget + 5);
    expect(a.level.allowed.minos).toEqual(st.minos);
    for (const m of a.level.solution!.minos) expect(st.minos).toContain(m.id);
    expect(verifyLayout(a.level, a.level.solution!, PRICES).judgement?.clear).toBe(true);
  });
  it('기계 층: 스위치·센서·모터·기어를 다 가지면 3층마다, 미노는 전부 고정이고 부품만 놓는다', () => {
    const st: RunState = { ...newRun('seed-b'), floor: 3, parts: ['switch', 'sensor', 'motor', 'gear'] };
    const m = floorLevel(st, PRICES);
    expect(m.machine).toBe(true);
    expect(m.level.solution!.minos).toEqual([]);
    for (const p of m.level.solution!.parts) expect(st.parts).toContain(p.type);
    expect(verifyLayout(m.level, m.level.solution!, PRICES).judgement?.clear).toBe(true);
    expect(floorLevel({ ...st, floor: 4 }, PRICES).machine).toBe(false);
  }, 30000);
  it('주간 씨앗: ISO 주 (2026-11-10 화 = 46주, 2026-01-01 목 = 1주, 다음 월요일 = 47주)', () => {
    expect(weeklySeed('2026-11-10')).toBe('week-2026-W46');
    expect(weeklySeed('2026-01-01')).toBe('week-2026-W01');
    expect(weeklySeed('2026-11-16')).toBe('week-2026-W47');
  });
  it('저장된 런 읽기: 깨진 것은 null', () => {
    const st = newRun('s');
    expect(parseRun(JSON.parse(JSON.stringify(st)))).toEqual(st);
    expect(parseRun({ v: 2 })).toBeNull();
    expect(parseRun(null)).toBeNull();
  });
  it('층 예산 배율: 1층 1.5 → 6층 1.3 → 11층 1.1 → 12층 1.08 → 23층 0.86 → 최저 0.85', () => {
    expect([1, 6, 11, 12, 23, 24, 40].map(budgetMul)).toEqual([1.5, 1.3, 1.1, 1.08, 0.86, 0.85, 0.85]);
  });
  it('기계 색 나누기 층: 통마다 한 색만, 두 색 다 쓰인다', () => {
    let found = 0;
    for (let f = 3; f <= 30 && found < 2; f += 3) {
      const st: RunState = { ...newRun('seed-color'), floor: f, parts: ['switch', 'sensor', 'motor', 'gear'] };
      const m = floorLevel(st, PRICES);
      if (!m.level.name.includes('색 나누기')) continue;
      found++;
      for (const b of m.level.bins) expect(b.red === 0 || b.blue === 0).toBe(true);
      expect(m.level.bins.some((b) => b.red > 0) && m.level.bins.some((b) => b.blue > 0)).toBe(true);
      expect(verifyLayout(m.level, m.level.solution!, PRICES).judgement?.clear).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  }, 60000);
});
