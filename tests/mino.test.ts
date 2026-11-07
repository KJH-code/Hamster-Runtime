import { describe, expect, it } from 'vitest';
import { MINOS, PIECE_ORDER } from '../src/data/minos';
import { buildShape, rotateShape } from '../src/core/mino';
import { srsPiece } from '../src/core/srs';
import { E, N, S, W } from '../src/core/types';
import { RULE_MINOS as M } from './fixtures/minos';

const coords = (cs: { x: number; y: number }[]) =>
  cs.map((c) => `${c.x},${c.y}`).sort().join(' ');

describe('미노 데이터 검사 (src/data/minos.ts — 재혁이 고치는 파일)', () => {
  it('id 가 겹치지 않는다', () => {
    expect(new Set(MINOS.map((d) => d.id)).size).toBe(MINOS.length);
  });
  it('모든 미노는 4칸이고 글자의 테트로미노 모양이다', () => {
    for (const d of MINOS) {
      expect(buildShape(d).length, d.id).toBe(4);
      expect(() => srsPiece(d), d.id).not.toThrow();
    }
  });
  it('튜브 경로는 하나로 이어지고(파싱 성공), 끝 칸은 연결 1개·중간 칸은 2개', () => {
    for (const d of MINOS) {
      const tubes = buildShape(d).filter((c) => c.cell.kind === 'tube');
      for (const t of tubes) {
        const n = [N, E, S, W].filter((s) => t.cell.inner & s).length;
        expect(n, d.id).toBe(t.cell.end ? 1 : 2);
      }
      if (tubes.length) expect(tubes.filter((t) => t.cell.end).length, d.id).toBe(2);
    }
  });
  it('7모양 모두 숫자 키로 고를 수 있다', () => {
    for (const p of PIECE_ORDER) expect(MINOS.some((d) => d.piece === p), p).toBe(true);
  });
});

describe('경로 파싱', () => {
  it('L: 1→2→3→4, 끝은 (0,0) 과 (1,2)', () => {
    const s = buildShape(M.find((m) => m.id === 'L-tube')!);
    const at = (x: number, y: number) => s.find((c) => c.x === x && c.y === y)!.cell;
    expect(at(0, 0)).toEqual({ kind: 'tube', inner: S, end: true });
    expect(at(0, 2)).toEqual({ kind: 'tube', inner: N | E, end: false });
    expect(at(1, 2)).toEqual({ kind: 'tube', inner: W, end: true });
  });
  it('T ㄱ: 튜브 3칸 + 빈칸 1', () => {
    const s = buildShape(M.find((m) => m.id === 'T-tube-a')!);
    expect(s.filter((c) => c.cell.kind === 'tube').length).toBe(3);
    expect(s.find((c) => c.x === 2 && c.y === 0)!.cell.kind).toBe('empty');
  });
  it('O U자: 네 칸 모두 튜브, 끝 두 칸이 이웃해도 경로 연결은 3개', () => {
    const s = buildShape(M.find((m) => m.id === 'O-tube')!);
    const links = s.reduce((n, c) => n + [N, E, S, W].filter((d) => c.cell.inner & d).length, 0);
    expect(links).toBe(6); // 연결 3개 × 양쪽
  });
  it('잘못된 경로는 오류: 번호가 떨어져 있거나 빠짐', () => {
    expect(() => buildShape({ id: 'x', name: 'x', piece: 'I', rows: ['1', '3', '2', 'e'] })).toThrow();
    expect(() => buildShape({ id: 'x', name: 'x', piece: 'I', rows: ['1', '2', '4', 'e'] })).toThrow();
  });
});

describe('회전', () => {
  it('세로 I 를 돌리면 가로, 경로 연결도 같이 돈다', () => {
    const r = rotateShape(buildShape(M.find((m) => m.id === 'I-tube')!), 1);
    expect(coords(r)).toBe('0,0 1,0 2,0 3,0');
    expect(r.filter((c) => c.cell.end).map((c) => c.cell.inner).sort()).toEqual([E, W].sort());
  });
  it('4번 돌리면 원래대로', () => {
    for (const d of M) {
      const s = buildShape(d);
      expect(coords(rotateShape(s, 4))).toBe(coords(s));
    }
  });
});
