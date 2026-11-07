import type { MinoDef } from '../data/minos';
import { Cell, E, N, rotateSides, S, ShapeCell, W } from './types';

/** 데이터 정의 → 칸 목록 (회전 0). 경로 번호가 이어지지 않으면 오류 */
export function buildShape(def: MinoDef): ShapeCell[] {
  const tubes: { x: number; y: number; k: number }[] = [];
  const out: ShapeCell[] = [];
  def.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ' ') return;
      if (ch === 'e') out.push({ x, y, cell: { kind: 'empty', inner: 0, end: false } });
      else if (/^[1-9]$/.test(ch)) tubes.push({ x, y, k: Number(ch) });
      else throw new Error(`미노 '${def.id}': 알 수 없는 글자 '${ch}'`);
    }),
  );
  tubes.sort((a, b) => a.k - b.k);
  tubes.forEach((t, i) => {
    if (t.k !== i + 1) throw new Error(`미노 '${def.id}': 경로 번호는 1부터 빠짐없이 (${t.k})`);
  });
  if (tubes.length === 1) throw new Error(`미노 '${def.id}': 경로는 2칸 이상`);
  const sideTo = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 1 && dy === 0) return E;
    if (dx === -1 && dy === 0) return W;
    if (dx === 0 && dy === 1) return S;
    if (dx === 0 && dy === -1) return N;
    throw new Error(`미노 '${def.id}': 경로 ${'' + a} 와 다음 칸이 붙어 있지 않다`);
  };
  tubes.forEach((t, i) => {
    let inner = 0;
    if (i > 0) inner |= sideTo(t, tubes[i - 1]!);
    if (i < tubes.length - 1) inner |= sideTo(t, tubes[i + 1]!);
    const end = i === 0 || i === tubes.length - 1;
    out.push({ x: t.x, y: t.y, cell: { kind: 'tube', inner, end } });
  });
  return out;
}

export function rotateCell(c: Cell): Cell {
  return { ...c, inner: rotateSides(c.inner) };
}

/** 시계 방향 90° × times. 거울 없음. 좌상단을 (0,0)으로 정규화 */
export function rotateShape(cells: ShapeCell[], times: number): ShapeCell[] {
  let cur = cells;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
    const h = Math.max(...cur.map((c) => c.y)) + 1;
    cur = cur.map((c) => ({ x: h - 1 - c.y, y: c.x, cell: rotateCell(c.cell) }));
  }
  const minX = Math.min(...cur.map((c) => c.x));
  const minY = Math.min(...cur.map((c) => c.y));
  return cur.map((c) => ({ x: c.x - minX, y: c.y - minY, cell: c.cell }));
}
