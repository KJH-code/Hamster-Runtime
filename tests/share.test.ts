import { describe, expect, it } from 'vitest';
import { checkShare, decodeShare, encodeShare, shareFromHash } from '../src/core/share';
import { LEVELS } from '../src/data/levels';
import { PRICES } from '../src/data/prices';

const lv = (n: string) => LEVELS.find((l) => l.id.startsWith(n))!;

describe('풀이 공유 코드', () => {
  it('코드 → 다시 풀면 같은 배치 (부품 방향·스위치까지)', () => {
    for (const l of LEVELS) {
      const code = encodeShare(l.id, l.solution!);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      const d = decodeShare(code);
      expect(d.levelId).toBe(l.id);
      expect(d.layout).toEqual(l.solution);
    }
  });
  it('참조 풀이 코드는 재검증 통과, 가격은 판에서 다시 센다', () => {
    const l = lv('08');
    const r = checkShare(encodeShare(l.id, l.solution!), LEVELS, PRICES);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.judgement.price).toBe(21);
  });
  it('깨진 코드·없는 레벨은 거부', () => {
    expect(checkShare('!!!', LEVELS, PRICES).ok).toBe(false);
    expect(checkShare('abc', LEVELS, PRICES).ok).toBe(false);
    const r = checkShare(encodeShare('99-nope', { minos: [], parts: [] }), LEVELS, PRICES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/없는 레벨/);
  });
  it('조작한 풀이는 재검증에서 실패: 공중 미노, 빠진 부품', () => {
    const l = lv('07');
    const floating = structuredClone(l.solution!);
    floating.minos[0]!.y -= 3;
    const r1 = checkShare(encodeShare(l.id, floating), LEVELS, PRICES);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toMatch(/도달할 수 없다/);
    const noMotor = structuredClone(l.solution!);
    noMotor.parts = noMotor.parts.filter((p) => p.type !== 'motor');
    expect(checkShare(encodeShare(l.id, noMotor), LEVELS, PRICES).ok).toBe(false);
  });
  it('빈 풀이는 통 조건 실패', () => {
    const r = checkShare(encodeShare(lv('01').id, { minos: [], parts: [] }), LEVELS, PRICES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/통 조건/);
  });
  it('링크 해시에서 코드 꺼내기', () => {
    expect(shareFromHash('#s=abc_-1')).toBe('abc_-1');
    expect(shareFromHash('#x=abc')).toBeNull();
    expect(shareFromHash('')).toBeNull();
  });
});
