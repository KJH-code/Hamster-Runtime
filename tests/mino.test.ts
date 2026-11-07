import { RULE_MINOS as M } from './fixtures/minos';
import { describe, expect, it } from 'vitest';
import { MINOS } from '../src/data/minos';
import { Board } from '../src/core/board';
import { buildShape, rotateShape } from '../src/core/mino';
import { E, N, S, W } from '../src/core/types';

const coords = (cs: { x: number; y: number }[]) =>
  cs.map((c) => `${c.x},${c.y}`).sort().join(' ');

describe('미노 데이터 검사 (src/data/minos.ts — 재혁이 고치는 파일)', () => {
  it('id 가 겹치지 않는다', () => {
    expect(new Set(MINOS.map((d) => d.id)).size).toBe(MINOS.length);
  });
  it('모든 미노는 정확히 4칸이고 연결되어 있다', () => {
    for (const d of MINOS) {
      const s = buildShape(d);
      expect(s.length, d.id).toBe(4);
      const seen = new Set<string>([`${s[0]!.x},${s[0]!.y}`]);
      const stack = [s[0]!];
      while (stack.length) {
        const c = stack.pop()!;
        for (const o of s) {
          const k = `${o.x},${o.y}`;
          if (!seen.has(k) && Math.abs(o.x - c.x) + Math.abs(o.y - c.y) === 1) {
            seen.add(k);
            stack.push(o);
          }
        }
      }
      expect(seen.size, d.id).toBe(4);
    }
  });
  it('튜브·센서 칸은 열린 변이 정확히 2개', () => {
    for (const d of MINOS)
      for (const c of buildShape(d))
        if (c.cell.kind === 'tube' || c.cell.kind === 'sensor') {
          const bits = [N, E, S, W].filter((b) => c.cell.open & b).length;
          expect(bits, d.id).toBe(2);
        }
  });
});

describe('회전', () => {
  it('I 세로를 한 번 돌리면 가로 4칸, 열린 변도 NS→EW', () => {
    const r = rotateShape(buildShape(M[0]!), 1);
    expect(coords(r)).toBe('0,0 1,0 2,0 3,0');
    for (const c of r) expect(c.cell.open).toBe(E | W);
  });
  it('4번 돌리면 원래대로', () => {
    for (const d of M) {
      const s = buildShape(d);
      const r = rotateShape(s, 4);
      expect(coords(r)).toBe(coords(s));
    }
  });
  it('T-스위치 정방향: 1 왼쪽·3 오른쪽, 스위치 공통=아래, 4는 아래칸', () => {
    const t = buildShape(M.find((m) => m.id === 'T-switch')!);
    const sw = t.find((c) => c.cell.kind === 'switch')!;
    expect([sw.x, sw.y]).toEqual([1, 0]);
    expect(sw.cell.common).toBe(S);
    expect(sw.cell.armA).toBe(W);
    expect(sw.cell.armB).toBe(E);
  });
  it('T-스위치 180° 회전: 4가 위, 공통 변이 위로, 갈래는 좌우 뒤바뀜', () => {
    const r = rotateShape(buildShape(M.find((m) => m.id === 'T-switch')!), 2);
    const sw = r.find((c) => c.cell.kind === 'switch')!;
    expect([sw.x, sw.y]).toEqual([1, 1]);
    expect(sw.cell.common).toBe(N);
    expect(sw.cell.armA).toBe(E);
    expect(sw.cell.armB).toBe(W);
    const four = r.find((c) => c.x === 1 && c.y === 0)!;
    expect(four.cell.open).toBe(N | S);
  });
  it('S-모터 방향은 회전해도 시계 유지', () => {
    const r = rotateShape(buildShape(M.find((m) => m.id === 'S-motor')!), 1);
    expect(r.find((c) => c.cell.kind === 'motor')!.cell.dir).toBe(1);
  });
});

describe('보드', () => {
  it('겹치면 배치 실패, 경계 밖 실패', () => {
    const b = new Board();
    expect(b.place('O-gear', 0, 0, 0, M)).not.toBeNull();
    expect(b.place('O-gear', 0, 1, 1, M)).toBeNull();
    expect(b.place('I-tube', 0, 9, 11, M)).toBeNull();
    expect(b.place('I-tube', 0, 9, 10, M)).not.toBeNull();
  });
  it('삭제는 미노 통째, 초기화는 전부', () => {
    const b = new Board();
    b.place('O-gear', 0, 2, 2, M);
    b.place('I-tube', 0, 6, 0, M);
    expect(b.removeAt(3, 3)).toBe(true);
    expect(b.at(2, 2)).toBeNull();
    expect(b.placed.length).toBe(1);
    b.clear();
    expect(b.placed.length).toBe(0);
  });
});
