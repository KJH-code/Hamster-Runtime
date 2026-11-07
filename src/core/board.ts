import { MINOS, type MinoDef } from '../data/minos';
import { buildShape, rotateShape } from './mino';
import { BOARD_H, BOARD_W, Cell, Part, ShapeCell } from './types';

export interface Placed {
  uid: number;
  defId: string;
  rot: number;
  x: number;
  y: number;
  cells: ShapeCell[]; // 회전 적용된 칸(상대 좌표)
}

export function findDef(id: string, defs: MinoDef[] = MINOS): MinoDef {
  const d = defs.find((m) => m.id === id);
  if (!d) throw new Error(`미노 없음: ${id}`);
  return d;
}

export class Board {
  readonly w: number;
  readonly h: number;
  readonly cells: (Cell | null)[];
  readonly owner: number[]; // 칸을 차지한 미노 uid, 없으면 0
  /** 부품 층. 키 = 칸 인덱스 */
  readonly parts = new Map<number, Part>();
  placed: Placed[] = [];
  private nextUid = 1;

  constructor(w = BOARD_W, h = BOARD_H) {
    this.w = w;
    this.h = h;
    this.cells = new Array(w * h).fill(null);
    this.owner = new Array(w * h).fill(0);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  at(x: number, y: number): Cell | null {
    return this.inBounds(x, y) ? (this.cells[y * this.w + x] ?? null) : null;
  }
  partAt(x: number, y: number): Part | undefined {
    return this.inBounds(x, y) ? this.parts.get(this.idx(x, y)) : undefined;
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  canPlace(shape: ShapeCell[], x: number, y: number): boolean {
    return shape.every((c) => {
      const px = x + c.x;
      const py = y + c.y;
      return this.inBounds(px, py) && this.owner[this.idx(px, py)] === 0;
    });
  }

  place(defId: string, rot: number, x: number, y: number, defs: MinoDef[] = MINOS): Placed | null {
    const shape = rotateShape(buildShape(findDef(defId, defs)), rot);
    return this.placeCells(defId, rot, shape, x, y);
  }

  /** 이미 회전된 칸 목록을 (x,y) 기준으로 놓는다 */
  placeCells(defId: string, rot: number, shape: ShapeCell[], x: number, y: number): Placed | null {
    if (!this.canPlace(shape, x, y)) return null;
    const p: Placed = { uid: this.nextUid++, defId, rot: ((rot % 4) + 4) % 4, x, y, cells: shape };
    for (const c of shape) {
      const i = this.idx(x + c.x, y + c.y);
      this.cells[i] = c.cell;
      this.owner[i] = p.uid;
    }
    this.placed.push(p);
    return p;
  }

  removeUid(uid: number): boolean {
    const p = this.placed.find((q) => q.uid === uid);
    if (!p) return false;
    const c = p.cells[0]!;
    return this.removeAt(p.x + c.x, p.y + c.y);
  }

  /** 해당 칸을 차지한 미노를 통째로 지운다. 그 위 부품도 같이 지운다 */
  removeAt(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const uid = this.owner[this.idx(x, y)];
    if (!uid) return false;
    const p = this.placed.find((q) => q.uid === uid)!;
    for (const c of p.cells) {
      const i = this.idx(p.x + c.x, p.y + c.y);
      this.cells[i] = null;
      this.owner[i] = 0;
      this.parts.delete(i);
    }
    this.placed = this.placed.filter((q) => q.uid !== uid);
    return true;
  }

  clear(): void {
    this.cells.fill(null);
    this.owner.fill(0);
    this.parts.clear();
    this.placed = [];
  }
}
