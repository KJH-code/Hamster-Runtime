/**
 * 샌드박스 편집 상태. 순수 로직 — 키보드 UI 는 이 API 만 부른다.
 * 미노 배치·제거, 부품 배치·제거, 스위치 방향·시작 상태, 대기열. 모든 편집은 되돌리기/다시하기 가능.
 * 스위치가 놓인 분기점의 갈래를 바꾸는 편집은 거부한다.
 */
import { MINOS, type MinoDef } from '../data/minos';
import { Board, findDef } from './board';
import { computeLinks } from './links';
import { buildShape, rotateShape } from './mino';
import { cycleCommon, defaultCommon, partRuleError, PART_NAMES } from './parts';
import type { QueueItem } from './hamster';
import { BOARD_H, BOARD_W, Dir, Part, PartType, ShapeCell, SwitchState } from './types';

interface Snapshot {
  w: number;
  h: number;
  minos: [string, number, number, number][];
  parts: [number, Part][];
  queue: QueueItem[];
}

export type Result = { ok: true } | { ok: false; reason: string };
const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

export class Editor {
  board: Board;
  queue: QueueItem[] = [
    { color: 0, inject: 'left' },
    { color: 1, inject: 'left' },
  ];
  readonly defs: MinoDef[];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  constructor(w = BOARD_W, h = BOARD_H, defs: MinoDef[] = MINOS) {
    this.board = new Board(w, h);
    this.defs = defs;
  }

  shapeOf(defId: string, rot: number): ShapeCell[] {
    return rotateShape(buildShape(findDef(defId, this.defs)), rot);
  }

  // ---------- 스냅샷 / 되돌리기 ----------
  private snap(): Snapshot {
    return {
      w: this.board.w,
      h: this.board.h,
      minos: this.board.placed.map((p) => [p.defId, p.rot, p.x, p.y]),
      parts: Array.from(this.board.parts.entries()).map(([i, p]) => [i, { ...p }]),
      queue: this.queue.map((q) => ({ ...q })),
    };
  }
  private restore(s: Snapshot): void {
    const b = new Board(s.w, s.h);
    for (const [id, r, x, y] of s.minos) b.place(id, r, x, y, this.defs);
    for (const [i, p] of s.parts) b.parts.set(i, { ...p });
    this.board = b;
    this.queue = s.queue.map((q) => ({ ...q }));
  }
  /** 편집 하나를 실행. 실패하거나 스위치 분기점이 망가지면 원상복구 */
  private edit(f: () => Result): Result {
    const before = this.snap();
    const r = f();
    if (r.ok) {
      const broken = this.brokenSwitch();
      if (broken) {
        this.restore(before);
        return fail(broken);
      }
      this.undoStack.push(before);
      this.redoStack = [];
    } else this.restore(before);
    return r;
  }
  private brokenSwitch(): string | null {
    const links = computeLinks(this.board);
    for (const [i, p] of this.board.parts) {
      if (p.type !== 'switch') continue;
      if (links.link[i] !== p.arms) return '스위치가 놓인 분기점의 갈래가 바뀌는 편집은 할 수 없다 (스위치를 먼저 지우세요)';
    }
    return null;
  }
  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(this.snap());
    this.restore(s);
    return true;
  }
  redo(): boolean {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.undoStack.push(this.snap());
    this.restore(s);
    return true;
  }

  // ---------- 미노 ----------
  placeMino(defId: string, rot: number, x: number, y: number): Result {
    return this.edit(() => (this.board.place(defId, rot, x, y, this.defs) ? OK : fail('다른 미노와 겹치거나 판 밖')));
  }
  /** 주어진 칸들(떠 있는 미노)과 겹치는 미노를 모두 제거 */
  removeMinosOverlapping(cells: ShapeCell[], x: number, y: number): Result {
    return this.edit(() => {
      const uids = new Set<number>();
      for (const c of cells) {
        const px = x + c.x;
        const py = y + c.y;
        if (this.board.inBounds(px, py)) {
          const u = this.board.owner[this.board.idx(px, py)];
          if (u) uids.add(u);
        }
      }
      if (uids.size === 0) return fail('겹치는 미노가 없다');
      for (const u of uids) this.board.removeUid(u);
      return OK;
    });
  }

  // ---------- 부품 ----------
  placePart(x: number, y: number, type: PartType, dir?: Dir): Result {
    return this.edit(() => {
      const links = computeLinks(this.board);
      const err = partRuleError(this.board, x, y, type, links);
      if (err) return fail(err);
      const i = this.board.idx(x, y);
      const part: Part = { type };
      if (type === 'motor') part.dir = dir ?? 1;
      if (type === 'switch') {
        part.arms = links.link[i]!;
        // 기본 공통 갈래: 경로가 미노 안에서 들어오는 변
        part.common = defaultCommon(part.arms, this.board.cells[i]!.inner);
        part.start = 'A';
      }
      this.board.parts.set(i, part);
      return OK;
    });
  }
  /** 부품을 지운다. 부품이 없으면 그 칸의 미노를 지운다 */
  removeAt(x: number, y: number): Result {
    return this.edit(() => {
      if (!this.board.inBounds(x, y)) return fail('판 밖');
      const i = this.board.idx(x, y);
      if (this.board.parts.delete(i)) return OK;
      return this.board.removeAt(x, y) ? OK : fail('지울 것이 없다');
    });
  }
  /** 스위치 공통 갈래를 다음 갈래로 (회전 키) */
  rotateSwitch(x: number, y: number, dir: 1 | -1): Result {
    return this.edit(() => {
      const p = this.board.partAt(x, y);
      if (p?.type !== 'switch') return fail('스위치가 아니다');
      const next = cycleCommon(p.arms!, p.common!, dir);
      if (next === p.common) return fail('이 분기점에서는 공통 갈래를 다른 쪽으로 돌릴 수 없다 (양옆 직각 갈래가 있어야 한다)');
      p.common = next;
      return OK;
    });
  }
  setSwitchStart(x: number, y: number, state: SwitchState): Result {
    return this.edit(() => {
      const p = this.board.partAt(x, y);
      if (p?.type !== 'switch') return fail('스위치가 아니다');
      p.start = state;
      return OK;
    });
  }

  // ---------- 판 크기 ----------
  /** 판 크기를 바꾼다. 들어가는 미노·부품만 남기고, 갈래가 바뀐 스위치는 지운다 */
  resize(w: number, h: number): Result {
    if (w < 2 || h < 2) return fail('판이 너무 작다');
    return this.edit(() => {
      const old = this.board;
      const b = new Board(w, h);
      for (const p of old.placed) b.placeCells(p.defId, p.rot, p.cells, p.x, p.y);
      for (const [i, part] of old.parts) {
        const x = i % old.w;
        const y = Math.floor(i / old.w);
        if (b.inBounds(x, y) && b.at(x, y)) b.parts.set(b.idx(x, y), { ...part });
      }
      const links = computeLinks(b);
      for (const [i, part] of [...b.parts]) if (part.type === 'switch' && links.link[i] !== part.arms) b.parts.delete(i);
      this.board = b;
      return OK;
    });
  }

  // ---------- 대기열 ----------
  queueAdd(after: number, item: QueueItem): Result {
    return this.edit(() => {
      this.queue.splice(after + 1, 0, { ...item });
      return OK;
    });
  }
  queueRemove(i: number): Result {
    return this.edit(() => {
      if (!this.queue[i]) return fail('항목 없음');
      this.queue.splice(i, 1);
      return OK;
    });
  }
  queueSet(i: number, patch: Partial<QueueItem>): Result {
    return this.edit(() => {
      const q = this.queue[i];
      if (!q) return fail('항목 없음');
      Object.assign(q, patch);
      return OK;
    });
  }
}

export { PART_NAMES };
