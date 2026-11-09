import { beforeEach, describe, expect, it } from 'vitest';
import { _resetForTest, bestCode, bestPrice, isUnlocked, recordClear } from '../src/ui/storage';

// 테스트 환경에는 localStorage 가 없다 → 메모리로 동작하는지 (try/catch 경로)
describe('기록 (저장소 없음)', () => {
  beforeEach(() => _resetForTest());
  it('최저 가격만 남긴다', () => {
    expect(bestPrice('a')).toBeUndefined();
    expect(recordClear('a', 10)).toBe(true);
    expect(recordClear('a', 12)).toBe(false);
    expect(bestPrice('a')).toBe(10);
    expect(recordClear('a', 8)).toBe(true);
    expect(bestPrice('a')).toBe(8);
  });
  it('순서대로 해금', () => {
    const ids = ['a', 'b', 'c'];
    expect([0, 1, 2].map((i) => isUnlocked(ids, i))).toEqual([true, false, false]);
    recordClear('a', 5);
    expect([0, 1, 2].map((i) => isUnlocked(ids, i))).toEqual([true, true, false]);
  });
  it('이미 깬 레벨은 앞 레벨을 안 깼어도 열려 있다 (앞에 새 레벨이 끼어든 경우)', () => {
    const ids = ['new', 'a', 'b'];
    recordClear('a', 5);
    expect([0, 1, 2].map((i) => isUnlocked(ids, i))).toEqual([true, true, true]);
  });
});

describe('최저 기록 풀이 코드', () => {
  beforeEach(() => _resetForTest());
  it('새 최저일 때 코드를 바꾸고, 더 비싸면 그대로', () => {
    recordClear('a', 10, 'X');
    expect(bestCode('a')).toBe('X');
    recordClear('a', 12, 'Y');
    expect(bestCode('a')).toBe('X');
    recordClear('a', 8, 'Z');
    expect(bestCode('a')).toBe('Z');
  });
});
