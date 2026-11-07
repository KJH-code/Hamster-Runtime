/**
 * SRS (Super Rotation System) — 중력 모드의 회전.
 * 좌표는 y 가 아래로 증가. 상태 0 = 스폰 방향, 1 = R(시계 1번), 2, 3 = L.
 * 미노 데이터(rows)의 모양을 SRS 기준 모양에 맞춰 회전 수를 자동으로 찾고,
 * 칸 요소(튜브 열린 변 등)도 같이 돌린다.
 */
import type { MinoDef, PieceLetter } from '../data/minos';
import { buildShape, rotateCell, rotateShape } from './mino';
import type { ShapeCell } from './types';

type XY = [number, number];

/** 상태 0 모양 (n×n 상자 안 좌표) */
const SPAWN: Record<PieceLetter, { n: number; cells: XY[] }> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

// 가이드라인 월킥 표 (y 위쪽이 +). 키 = `${from}${to}`
const KICK_JLSTZ: Record<string, XY[]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I: Record<string, XY[]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** from → to 회전 시 시도할 이동 (y 아래가 +) */
export function kicks(letter: PieceLetter, from: number, to: number): XY[] {
  if (letter === 'O') return [[0, 0]];
  const t = (letter === 'I' ? KICK_I : KICK_JLSTZ)[`${from}${to}`];
  if (!t) throw new Error(`잘못된 회전 ${from}→${to}`);
  return t.map(([x, y]) => [x, -y || 0] as XY);
}

export interface SrsPiece {
  letter: PieceLetter;
  n: number;
  /** states[r] = 상태 r 의 칸 (상자 좌표, 칸 요소 포함) */
  states: ShapeCell[][];
}

const key = (cs: { x: number; y: number }[]) =>
  cs.map((c) => `${c.x},${c.y}`).sort().join(' ');

function normalize(cs: XY[]): XY[] {
  const mx = Math.min(...cs.map((c) => c[0]));
  const my = Math.min(...cs.map((c) => c[1]));
  return cs.map(([x, y]) => [x - mx, y - my]);
}

const cache = new Map<MinoDef, SrsPiece>();

export function srsPiece(def: MinoDef): SrsPiece {
  const hit = cache.get(def);
  if (hit) return hit;
  const spawn = SPAWN[def.piece];
  const target = key(normalize(spawn.cells).map(([x, y]) => ({ x, y })));
  const base = buildShape(def);
  let state0: ShapeCell[] | null = null;
  for (let k = 0; k < 4 && !state0; k++) {
    const r = rotateShape(base, k);
    if (key(r) === target) state0 = r;
  }
  if (!state0) throw new Error(`미노 '${def.id}' 의 모양이 ${def.piece} 테트로미노가 아니다`);
  const ox = Math.min(...spawn.cells.map((c) => c[0]));
  const oy = Math.min(...spawn.cells.map((c) => c[1]));
  const states: ShapeCell[][] = [state0.map((c) => ({ x: c.x + ox, y: c.y + oy, cell: c.cell }))];
  for (let r = 1; r < 4; r++) {
    states.push(
      states[r - 1]!.map((c) => ({ x: spawn.n - 1 - c.y, y: c.x, cell: rotateCell(c.cell) })),
    );
  }
  const piece = { letter: def.piece, n: spawn.n, states };
  cache.set(def, piece);
  return piece;
}
