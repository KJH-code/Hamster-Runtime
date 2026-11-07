/**
 * 중력 쌓기 (레벨 모드). 순수 로직 — 시간은 인자로 받는다.
 * - 자동 낙하 없음. 플레이어가 좌우·회전(SRS)·소프트 드롭·하드 드롭
 * - 바닥/다른 미노에 닿아 있으면 락 딜레이 후 고정. 이동·회전 성공 시 리셋(최대 LOCK_RESETS 번)
 * - 하드 드롭은 즉시 고정. 줄 지우기 없음. 무르기는 마지막에 놓은 것부터
 */
import { MINOS, type MinoDef } from '../data/minos';
import { Board, findDef } from './board';
import { kicks, srsPiece } from './srs';
import type { ShapeCell } from './types';

export const LOCK_MS = 1000;
export const LOCK_RESETS = 15;

export interface Pose {
  r: number;
  x: number;
  y: number;
}
export interface Active extends Pose {
  defId: string;
}

export class Stack {
  readonly board: Board;
  readonly defs: MinoDef[];
  supply: Map<string, number>;
  active: Active | null = null;
  /** 플레이어가 놓은 미노 uid (무르기 순서) */
  history: number[] = [];
  /** 바닥에 닿은 시각. null = 공중 */
  groundedAt: number | null = null;
  resets = 0;

  constructor(board: Board, supply: Record<string, number>, defs: MinoDef[] = MINOS) {
    this.board = board;
    this.defs = defs;
    this.supply = new Map(Object.entries(supply));
  }

  cellsOf(a: { defId: string; r: number }): ShapeCell[] {
    return srsPiece(findDef(a.defId, this.defs)).states[a.r]!;
  }

  fits(defId: string, p: Pose): boolean {
    return this.board.canPlace(this.cellsOf({ defId, r: p.r }), p.x, p.y);
  }

  isGrounded(a: Active = this.active!): boolean {
    return !this.fits(a.defId, { r: a.r, x: a.x, y: a.y + 1 });
  }

  spawnPose(defId: string): Pose {
    const piece = srsPiece(findDef(defId, this.defs));
    const top = Math.min(...piece.states[0]!.map((c) => c.y));
    return { r: 0, x: Math.floor((this.board.w - piece.n) / 2), y: -top || 0 };
  }

  /** 공급에서 하나 꺼내 맨 위에 나타나게 한다. 자리가 막혔거나 공급이 없으면 false */
  spawn(defId: string, now = 0): boolean {
    if (this.active) return false;
    if ((this.supply.get(defId) ?? 0) <= 0) return false;
    const p = this.spawnPose(defId);
    if (!this.fits(defId, p)) return false;
    this.supply.set(defId, this.supply.get(defId)! - 1);
    this.active = { defId, ...p };
    this.resets = 0;
    this.groundedAt = null;
    this.updateGround(now, false);
    return true;
  }

  /** 이동·회전 뒤 바닥 판정과 락 타이머 갱신 */
  private updateGround(now: number, moved: boolean): void {
    if (!this.active) return;
    if (!this.isGrounded()) {
      this.groundedAt = null;
      return;
    }
    if (this.groundedAt === null) this.groundedAt = now;
    else if (moved && this.resets < LOCK_RESETS) {
      this.resets++;
      this.groundedAt = now;
    }
  }

  move(dx: number, now = 0): boolean {
    const a = this.active;
    if (!a) return false;
    const p = { r: a.r, x: a.x + dx, y: a.y };
    if (!this.fits(a.defId, p)) return false;
    this.active = { ...a, ...p };
    this.updateGround(now, true);
    return true;
  }

  softDrop(now = 0): boolean {
    const a = this.active;
    if (!a) return false;
    const p = { r: a.r, x: a.x, y: a.y + 1 };
    if (!this.fits(a.defId, p)) return false;
    this.active = { ...a, ...p };
    this.updateGround(now, false);
    return true;
  }

  /** dir: 1 = 시계, -1 = 반시계 */
  rotate(dir: 1 | -1, now = 0): boolean {
    const a = this.active;
    if (!a) return false;
    const def = findDef(a.defId, this.defs);
    const to = (a.r + dir + 4) % 4;
    for (const [kx, ky] of kicks(def.piece, a.r, to)) {
      const p = { r: to, x: a.x + kx, y: a.y + ky };
      if (this.fits(a.defId, p)) {
        this.active = { ...a, ...p };
        this.updateGround(now, true);
        return true;
      }
    }
    return false;
  }

  /** 착지 위치 (고스트) */
  ghost(): Active | null {
    const a = this.active;
    if (!a) return null;
    let y = a.y;
    while (this.fits(a.defId, { r: a.r, x: a.x, y: y + 1 })) y++;
    return { ...a, y };
  }

  /** 즉시 착지 + 고정 */
  hardDrop(): boolean {
    const g = this.ghost();
    if (!g) return false;
    this.active = g;
    return this.lock();
  }

  /** 시간 경과 처리. 락 딜레이가 끝났으면 고정하고 true */
  tick(now: number): boolean {
    if (!this.active || this.groundedAt === null) return false;
    if (now - this.groundedAt >= LOCK_MS) return this.lock();
    return false;
  }

  /** 현재 미노를 판에 고정. 공중이면 고정하지 않는다 */
  lock(): boolean {
    const a = this.active;
    if (!a || !this.isGrounded()) return false;
    const p = this.board.placeCells(a.defId, a.r, this.cellsOf(a), a.x, a.y);
    if (!p) return false;
    this.history.push(p.uid);
    this.active = null;
    this.groundedAt = null;
    return true;
  }

  /** 떨어지는 중인 미노를 취소하고 공급으로 돌린다 */
  cancelActive(): void {
    if (!this.active) return;
    this.supply.set(this.active.defId, (this.supply.get(this.active.defId) ?? 0) + 1);
    this.active = null;
    this.groundedAt = null;
  }

  /** 마지막에 놓은 미노를 되돌려 공급으로. 떨어지는 중인 미노가 있으면 그것부터 취소 */
  undo(): boolean {
    if (this.active) {
      this.cancelActive();
      return true;
    }
    const uid = this.history.pop();
    if (uid === undefined) return false;
    const p = this.board.placed.find((q) => q.uid === uid)!;
    this.board.removeUid(uid);
    this.supply.set(p.defId, (this.supply.get(p.defId) ?? 0) + 1);
    return true;
  }

  /**
   * 스폰에서 출발해 도달 가능한 고정 자세 전부 (BFS: 좌우·소프트 드롭·회전).
   * 락 딜레이 시간 제한은 무시한다(리셋 15번 안에 할 수 있다고 가정 — 레벨 풀이 검증용).
   */
  reachableLocks(defId: string): Pose[] {
    const start = this.spawnPose(defId);
    if (!this.fits(defId, start)) return [];
    const def = findDef(defId, this.defs);
    const k = (p: Pose) => `${p.r},${p.x},${p.y}`;
    const seen = new Set([k(start)]);
    const q: Pose[] = [start];
    const out: Pose[] = [];
    while (q.length) {
      const p = q.shift()!;
      if (!this.fits(defId, { ...p, y: p.y + 1 })) out.push(p);
      const next: Pose[] = [
        { ...p, x: p.x - 1 },
        { ...p, x: p.x + 1 },
        { ...p, y: p.y + 1 },
      ];
      for (const dir of [1, -1]) {
        const to = (p.r + dir + 4) % 4;
        for (const [kx, ky] of kicks(def.piece, p.r, to)) {
          const n = { r: to, x: p.x + kx, y: p.y + ky };
          if (this.fits(defId, n)) {
            next.push(n);
            break;
          }
        }
      }
      for (const n of next) {
        if (!this.fits(defId, n) || seen.has(k(n))) continue;
        seen.add(k(n));
        q.push(n);
      }
    }
    return out;
  }
}
