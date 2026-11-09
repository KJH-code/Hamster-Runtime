import { describe, expect, it } from 'vitest';
import { nextHint } from '../src/core/hint';
import { LEVELS } from '../src/data/levels';
import { PRICES } from '../src/data/prices';

const byId = (id: string) => LEVELS.find((l) => l.id.startsWith(id))!;

describe('힌트', () => {
  it('빈 판: 참조 풀이의 첫 미노', () => {
    // 2번 '첫 길' 참조 = L 튜브 r1 (-1,5) → I 튜브 r0 (2,6)
    const h = nextHint(byId('01'), { minos: [], parts: [] }, PRICES);
    expect(h).toEqual({ kind: 'mino', mino: { id: 'L-tube', r: 1, x: -1, y: 5 }, source: 'ref', blockers: [] });
  });
  it('첫 미노를 맞게 놓으면 다음 미노', () => {
    const h = nextHint(byId('01'), { minos: [{ id: 'L-tube', r: 1, x: -1, y: 5 }], parts: [] }, PRICES);
    expect(h).toMatchObject({ kind: 'mino', mino: { id: 'I-tube', r: 0, x: 2, y: 6 } });
  });
  it('미노가 다 맞고 부품이 없는 레벨이면 다 맞음', () => {
    const h = nextHint(byId('01'), { minos: [{ id: 'L-tube', r: 1, x: -1, y: 5 }, { id: 'I-tube', r: 0, x: 2, y: 6 }], parts: [] }, PRICES);
    expect(h).toEqual({ kind: 'done', blockers: [] });
  });
  it('미노가 다 맞으면 부품 하나씩 (6번 마개)', () => {
    const lv = byId('05');
    const h = nextHint(lv, { minos: lv.solution!.minos, parts: [] }, PRICES);
    expect(h).toEqual({ kind: 'part', part: lv.solution!.parts[0], blockers: [] });
  });
  it('참조에 없는 미노가 길을 안 막으면 그대로 두고 참조 미노를 마저', () => {
    // 1번: 오른쪽 아래 (열 4~6) 에 L 하나를 더 놓아도 햄스터는 열 0 → 참조 L → 통 1
    const h = nextHint(byId('00'), { minos: [{ id: 'L-tube', r: 1, x: 3, y: 5 }], parts: [] }, PRICES);
    expect(h).toEqual({ kind: 'mino', mino: { id: 'L-tube', r: 1, x: -1, y: 5 }, source: 'search', blockers: [] });
  });
  it('참조 자리를 막고 있고 찾을 시간이 없으면 참조 미노 + 막는 미노', () => {
    // 1번: L r1 (0,5) 는 참조 L 의 아래 줄 (1,7)(2,7) 과 겹친다
    const h = nextHint(byId('00'), { minos: [{ id: 'L-tube', r: 1, x: 0, y: 5 }], parts: [] }, PRICES, { budgetMs: 0 });
    expect(h).toEqual({ kind: 'mino', mino: { id: 'L-tube', r: 1, x: -1, y: 5 }, source: 'ref', blockers: [0] });
  });
});
