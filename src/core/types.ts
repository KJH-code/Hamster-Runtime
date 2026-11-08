// 변 비트마스크. N=위, E=오른쪽, S=아래, W=왼쪽. 시계 방향 순서 = N → E → S → W
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export type Sides = number;
export const SIDE_LIST: readonly Sides[] = [N, E, S, W];

/** 미노 칸: 튜브(경로의 한 칸) 또는 빈칸 */
export type CellKind = 'tube' | 'empty';
export type Dir = 1 | -1; // 1 = 시계, -1 = 반시계
/** 스위치 = ㄱ자 관. A = 공통 갈래의 반시계 쪽 직각 갈래, B = 시계 쪽 직각 갈래 */
export type SwitchState = 'A' | 'B';
export const SWITCH_STATES: readonly SwitchState[] = ['A', 'B'];

export interface Cell {
  kind: CellKind;
  /** 미노 안 경로로 이어진 변 (튜브만). 경로 중간 칸 = 2개, 끝 칸 = 1개 */
  inner: Sides;
  /** 경로의 끝 칸인가 (출구가 자동으로 정해지는 칸) */
  end: boolean;
}

export interface ShapeCell {
  x: number;
  y: number;
  cell: Cell;
}

export const BOARD_W = 10;
export const BOARD_H = 14;
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
/** 시계 방향 90° */
export function rotateSides(m: Sides): Sides {
  return ((m << 1) & 15) | ((m & W) >> 3);
}
export function popcount(m: Sides): number {
  let n = 0;
  for (const s of SIDE_LIST) if (m & s) n++;
  return n;
}
export function sidesOf(m: Sides): Sides[] {
  return SIDE_LIST.filter((s) => m & s);
}

/** 미노 칸 위에 놓는 부품. 한 칸에 하나 */
export type PartType = 'sensor' | 'gear' | 'motor' | 'switch' | 'plug';
export interface Part {
  type: PartType;
  /** motor: 방향 */
  dir?: Dir;
  /** switch: 공통 갈래(입구) 변 */
  common?: Sides;
  /** switch: 놓을 때의 갈래 전체(공통 포함). 이후 편집으로 갈래가 바뀌면 그 편집은 거부된다 */
  arms?: Sides;
  /** switch: 시작 상태 */
  start?: SwitchState;
}
