import { describe, expect, it } from 'vitest';
import { dailyLevel, kstDate, prevDate, rngFrom, streakFrom } from '../src/core/daily';
import { verifyLayout } from '../src/core/level';
import { PRICES } from '../src/data/prices';

describe('오늘의 퍼즐', () => {
  it('같은 씨앗 → 같은 수열', () => {
    const a = rngFrom('x');
    const b = rngFrom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rngFrom('y')()).not.toBe(rngFrom('x')());
  });
  it('한국 시간 날짜: UTC 15:00 이 다음 날 자정', () => {
    expect(kstDate(Date.UTC(2026, 10, 9, 14, 59))).toBe('2026-11-09');
    expect(kstDate(Date.UTC(2026, 10, 9, 15, 0))).toBe('2026-11-10');
    expect(prevDate('2026-03-01')).toBe('2026-02-28');
    expect(prevDate('2026-01-01')).toBe('2025-12-31');
  });
  it('연속 기록: 오늘 안 깼으면 어제부터, 빈 날에서 끊김', () => {
    const done = new Set(['2026-11-07', '2026-11-08', '2026-11-09']);
    expect(streakFrom('2026-11-10', (d) => done.has(d))).toBe(3);
    done.add('2026-11-10');
    expect(streakFrom('2026-11-10', (d) => done.has(d))).toBe(4);
    expect(streakFrom('2026-11-12', (d) => done.has(d))).toBe(0);
  });
  it('같은 날짜는 같은 퍼즐, 참조 풀이는 깨지고 빈 판으로는 안 깨진다 (14일 × 쉬움·어려움)', () => {
    for (let d = 0; d < 14; d++) {
      const date = new Date(Date.UTC(2026, 10, 10 + d)).toISOString().slice(0, 10);
      for (const kind of ['easy', 'hard'] as const) {
        const lv = dailyLevel(date, kind, PRICES);
        expect(dailyLevel(date, kind, PRICES)).toEqual(lv);
        expect(lv.id).toBe(`daily-${date}-${kind}`);
        expect(verifyLayout(lv, lv.solution!, PRICES).judgement?.clear).toBe(true);
        expect(verifyLayout(lv, { minos: [], parts: [] }, PRICES).judgement?.clear).toBe(false);
        if (kind === 'hard') expect(lv.solution!.parts.some((p) => p.type === 'sensor')).toBe(true);
      }
    }
  }, 60000);
});
