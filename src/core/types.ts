// 변 비트마스크. N=위, E=오른쪽, S=아래, W=왼쪽
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export type Sides = number;
export const SIDE_LIST: readonly Sides[] = [N, E, S, W];

export type CellKind = 'empty' | 'tube' | 'sensor' | 'gear' | 'motor' | 'switch';
export type Dir = 1 | -1; // 1 = 시계, -1 = 반시계
export type SwitchState = 'A' | 'B';

export interface Cell {
  kind: CellKind;
  /** 열린 변. tube/sensor/switch 만 의미 있음 */
  open: Sides;
  /** motor: 자기 방향 */
  dir?: Dir;
  /** switch: 공통 변, 상태 A 갈래 변, 상태 B 갈래 변 */
  common?: Sides;
  armA?: Sides;
  armB?: Sides;
}

export interface ShapeCell {
  x: number;
  y: number;
  cell: Cell;
}

export const BOARD_W = 10;
export const BOARD_H = 14;
/** 기본 판(10칸)의 통 개수. 판마다는 binCount(w) 를 쓴다 */
export const BIN_COUNT = 5;
export const BIN_WIDTH = 2;
export function binCount(w: number): number {
  return Math.ceil(w / BIN_WIDTH);
}

export function opposite(s: Sides): Sides {
  return s === N ? S : s === S ? N : s === E ? W : E;
}
export function sideDelta(s: Sides): [number, number] {
  return s === N ? [0, -1] : s === S ? [0, 1] : s === E ? [1, 0] : [-1, 0];
}
export function rotateSides(m: Sides): Sides {
  return ((m << 1) & 15) | ((m & W) >> 3);
}
export function isTubeLike(c: Cell): boolean {
  return c.kind === 'tube' || c.kind === 'sensor' || c.kind === 'switch';
}
export function isGearLike(c: Cell): boolean {
  return c.kind === 'gear' || c.kind === 'motor' || c.kind === 'switch';
}
