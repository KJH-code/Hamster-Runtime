import type { MinoDef } from '../data/minos';
import { Cell, E, N, rotateSides, S, ShapeCell, Sides, W } from './types';

const SIDE_CHAR: Record<string, Sides> = { N, E, S, W };

function parseSides(str: string): Sides {
  let m = 0;
  for (const ch of str.replace(/,/g, '')) {
    const v = SIDE_CHAR[ch];
    if (v === undefined) throw new Error(`알 수 없는 변 '${ch}' in '${str}'`);
    m |= v;
  }
  return m;
}

export function parseToken(tok: string): Cell {
  const [kind, arg = ''] = tok.split(':');
  switch (kind) {
    case 'empty':
      return { kind: 'empty', open: 0 };
    case 'gear':
      return { kind: 'gear', open: 0 };
    case 'tube':
      return { kind: 'tube', open: parseSides(arg) };
    case 'sensor':
      return { kind: 'sensor', open: parseSides(arg) };
    case 'motor':
      if (arg !== 'cw' && arg !== 'ccw') throw new Error(`motor 방향은 cw/ccw: '${tok}'`);
      return { kind: 'motor', open: 0, dir: arg === 'cw' ? 1 : -1 };
    case 'switch': {
      const [c, a, b] = arg.split(',');
      if (!c || !a || !b) throw new Error(`switch 는 '공통,A갈래,B갈래': '${tok}'`);
      const common = parseSides(c);
      const armA = parseSides(a);
      const armB = parseSides(b);
      return { kind: 'switch', open: common | armA | armB, common, armA, armB };
    }
    default:
      throw new Error(`알 수 없는 칸 토큰 '${tok}'`);
  }
}

/** 데이터 정의 → 칸 목록 (회전 0) */
export function buildShape(def: MinoDef): ShapeCell[] {
  const out: ShapeCell[] = [];
  def.rows.forEach((row, y) =>
    row.forEach((tok, x) => {
      if (tok !== '') out.push({ x, y, cell: parseToken(tok) });
    }),
  );
  return out;
}

export function rotateCell(c: Cell): Cell {
  const r: Cell = { ...c, open: rotateSides(c.open) };
  if (c.common !== undefined) r.common = rotateSides(c.common);
  if (c.armA !== undefined) r.armA = rotateSides(c.armA);
  if (c.armB !== undefined) r.armB = rotateSides(c.armB);
  return r;
}

/** 시계 방향 90° 회전. 거울(뒤집기)은 없다. 좌상단을 (0,0)으로 정규화 */
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
