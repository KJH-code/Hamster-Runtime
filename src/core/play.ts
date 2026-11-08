/**
 * 레벨 플레이 상태. 순수 로직 — 키보드 UI 는 이 API 만 부른다.
 *  - 미노: 중력 쌓기(stack.ts). 스폰 → 좌우·소프트 드롭·SRS 회전 → 하드 드롭/락 딜레이로 고정
 *  - 미노 제거는 마지막에 떨어뜨린 것만 (공중에 뜬 미노가 생기지 않게)
 *  - 부품: 놓인 미노 칸 위에 1차 규칙대로
 *  - 사용 가능 종류만, 고정 미노·부품은 못 건드림, 스위치 분기점 갈래가 바뀌는 동작은 거부
 *  - 모든 편집은 되돌리기/다시하기 가능
 */
import { MINOS, type MinoDef } from '../data/minos';
import { PRICES, type PriceTable } from '../data/prices';
import type { Board } from './board';
import { QueueRun } from './hamster';
import {
  brokenSwitch,
  buildFixed,
  fromPart,
  judge,
  queueItems,
  srsCells,
  type Built,
  type Judgement,
  type Layout,
  type Level,
  type LevelMino,
} from './level';
import { computeLinks } from './links';
import { cycleCommon, defaultCommon, partRuleError } from './parts';
import { totalPrice } from './price';
import { Stack, type Active } from './stack';
import type { Dir, Part, PartType, SwitchState } from './types';

export type Result = { ok: true } | { ok: false; reason: string };
const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

interface Snapshot {
  drops: LevelMino[];
  parts: [number, Part][];
}

const LOTS = 1_000_000;

export class LevelPlay {
  readonly level: Level;
  readonly defs: MinoDef[];
  readonly prices: PriceTable;
  built!: Built;
  stack!: Stack;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  constructor(level: Level, defs: MinoDef[] = MINOS, prices: PriceTable = PRICES) {
    this.level = level;
    this.defs = defs;
    this.prices = prices;
    this.restore({ drops: [], parts: [] });
  }

  get board(): Board {
    return this.built.board;
  }
  get active(): Active | null {
    return this.stack.active;
  }

  // ---------- 스냅샷 ----------
  /** 플레이어가 놓은 것 (떨어뜨린 순서) */
  private drops(): LevelMino[] {
    return this.stack.history.map((uid) => {
      const p = this.board.placed.find((q) => q.uid === uid)!;
      return { id: p.defId, r: p.rot, x: p.x, y: p.y };
    });
  }
  private snap(): Snapshot {
    const parts: [number, Part][] = [];
    for (const [i, p] of this.board.parts) if (!this.built.fixed.parts.has(i)) parts.push([i, { ...p }]);
    return { drops: this.drops(), parts };
  }
  private restore(s: Snapshot): void {
    this.built = buildFixed(this.level, this.defs);
    const supply = Object.fromEntries(this.level.allowed.minos.map((id) => [id, LOTS]));
    this.stack = new Stack(this.built.board, supply, this.defs);
    for (const m of s.drops) {
      const p = this.board.placeCells(m.id, m.r, srsCells(m.id, m.r, this.defs), m.x, m.y)!;
      this.stack.history.push(p.uid);
    }
    for (const [i, p] of s.parts) this.board.parts.set(i, { ...p });
  }
  private commit(before: Snapshot): void {
    this.undoStack.push(before);
    this.redoStack = [];
  }
  /** 편집 하나. 실패하거나 스위치 분기점이 망가지면 원상복구 */
  private edit(f: () => Result): Result {
    const active = this.stack.active;
    const before = this.snap();
    const r = f();
    const broken = r.ok ? brokenSwitch(this.board) : null;
    if (r.ok && !broken) {
      this.commit(before);
      return r;
    }
    this.restore(before);
    this.stack.active = active;
    return broken ? fail(`${broken} (스위치를 먼저 지우세요)`) : r;
  }

  undo(): boolean {
    if (this.stack.active) {
      this.stack.cancelActive();
      return true;
    }
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(this.snap());
    this.restore(s);
    return true;
  }
  redo(): boolean {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.stack.active = null;
    this.undoStack.push(this.snap());
    this.restore(s);
    return true;
  }

  // ---------- 미노 ----------
  /** 떨어질 미노를 고른다 (떨어지는 중인 것은 취소) */
  spawn(defId: string, now = 0): Result {
    if (!this.level.allowed.minos.includes(defId)) return fail('이 레벨에서 쓸 수 없는 미노');
    this.stack.cancelActive();
    return this.stack.spawn(defId, now) ? OK : fail('스폰 자리가 막혀 있다');
  }
  move(dx: number, now = 0): boolean {
    return this.stack.move(dx, now);
  }
  softDrop(now = 0): boolean {
    return this.stack.softDrop(now);
  }
  rotate(dir: 1 | -1, now = 0): boolean {
    return this.stack.rotate(dir, now);
  }
  ghost(): Active | null {
    return this.stack.ghost();
  }
  /** 고정 시도. 스위치 분기점이 망가지면 되돌리고 미노는 고정하려던 자리에 떠 있는 채로 둔다 */
  private lockAt(pose: Active, lockFn: () => boolean): Result | null {
    const before = this.snap();
    if (!lockFn()) return null;
    const broken = brokenSwitch(this.board);
    if (broken) {
      this.restore(before);
      this.stack.active = pose;
      this.stack.groundedAt = null;
      return fail(`${broken} — 여기에는 놓을 수 없다`);
    }
    this.commit(before);
    return OK;
  }
  hardDrop(): Result {
    const g = this.stack.ghost();
    if (!g) return fail('떨어지는 미노가 없다');
    const prev = this.stack.active!;
    const r = this.lockAt(g, () => {
      this.stack.active = g;
      return this.stack.lock();
    });
    if (r) return r;
    this.stack.active = prev;
    return fail('판 위로 삐져나와서 고정할 수 없다');
  }
  /** 락 딜레이 경과 처리. 고정이 일어났으면 결과 */
  tick(now: number): Result | null {
    const a = this.stack.active;
    return a ? this.lockAt(a, () => this.stack.tick(now)) : null;
  }
  /** 마지막에 떨어뜨린 미노를 지운다 (그 위 부품도) */
  removeLastMino(): Result {
    return this.edit(() => {
      const uid = this.stack.history.pop();
      if (uid === undefined) return fail('지울 미노가 없다');
      this.board.removeUid(uid);
      return OK;
    });
  }
  lastMinoUid(): number | undefined {
    return this.stack.history[this.stack.history.length - 1];
  }

  // ---------- 부품 ----------
  isFixedCell(x: number, y: number): boolean {
    return this.built.fixed.parts.has(this.board.idx(x, y));
  }
  placePart(x: number, y: number, type: PartType, dir?: Dir): Result {
    if (!this.level.allowed.parts.includes(type)) return fail('이 레벨에서 쓸 수 없는 부품');
    return this.edit(() => {
      const links = computeLinks(this.board);
      const err = partRuleError(this.board, x, y, type, links);
      if (err) return fail(err);
      const i = this.board.idx(x, y);
      const part: Part = { type };
      if (type === 'motor') part.dir = dir ?? 1;
      if (type === 'switch') {
        part.arms = links.link[i]!;
        part.common = defaultCommon(part.arms, this.board.cells[i]!.inner);
        part.start = 'A';
      }
      this.board.parts.set(i, part);
      return OK;
    });
  }
  removePart(x: number, y: number): Result {
    if (!this.board.inBounds(x, y)) return fail('판 밖');
    if (this.isFixedCell(x, y)) return fail('고정 부품은 지울 수 없다');
    return this.edit(() => (this.board.parts.delete(this.board.idx(x, y)) ? OK : fail('지울 부품이 없다')));
  }
  private mySwitch(x: number, y: number): Part | string {
    const p = this.board.partAt(x, y);
    if (p?.type !== 'switch') return '스위치가 아니다';
    if (this.isFixedCell(x, y)) return '고정 스위치는 바꿀 수 없다';
    return p;
  }
  rotateSwitch(x: number, y: number, dir: 1 | -1): Result {
    return this.edit(() => {
      const p = this.mySwitch(x, y);
      if (typeof p === 'string') return fail(p);
      const next = cycleCommon(p.arms!, p.common!, dir);
      if (next === p.common) return fail('이 분기점에서는 공통 갈래를 다른 쪽으로 돌릴 수 없다 (양옆 직각 갈래가 있어야 한다)');
      p.common = next;
      return OK;
    });
  }
  setSwitchStart(x: number, y: number, state: SwitchState): Result {
    return this.edit(() => {
      const p = this.mySwitch(x, y);
      if (typeof p === 'string') return fail(p);
      p.start = state;
      return OK;
    });
  }

  // ---------- 가격 · 실행 ----------
  price(): number {
    return totalPrice(this.board, this.prices, this.built.fixed);
  }
  /** 플레이어 배치 (참조 풀이 형식) */
  layout(): Layout {
    const parts = this.snap().parts.map(([i, p]) => fromPart(i % this.board.w, Math.floor(i / this.board.w), p));
    return { minos: this.drops(), parts };
  }
  newRun(): QueueRun {
    return new QueueRun(this.board, queueItems(this.level));
  }
  judge(run: QueueRun): Judgement {
    return judge(this.level, run, this.price());
  }
  /** 끝까지 한 번에 돌려 판정 */
  runAll(): Judgement {
    const run = this.newRun();
    run.runAll();
    return this.judge(run);
  }
}
