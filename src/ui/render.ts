import type { Board } from '../core/board';
import type { Simulation } from '../core/hamster';
import { BIN_COUNT, BIN_WIDTH, Cell, E, N, S, ShapeCell, SIDE_LIST, SwitchState } from '../core/types';

export const CELL = 40;
export const TOP_ROWS = 1; // 투입구 줄
export const BIN_ROWS = 1;

const C = {
  bg: '#14161c',
  grid: '#232733',
  tubeEdge: '#7c5a2b',
  tube: '#e8c98f',
  tubeDim: '#5a4a33',
  gear: '#7fa6d8',
  gearEdge: '#2d4a73',
  motor: '#f0a04b',
  locked: '#e5484d',
  sensor: '#53c26b',
  sensorOn: '#ffe14a',
  text: '#f0f0f0',
};

function sideVec(s: number): [number, number] {
  return s === N ? [0, -1] : s === S ? [0, 1] : s === E ? [1, 0] : [-1, 0];
}

function drawTubeArm(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, side: number, fill: string, edge: string) {
  const [vx, vy] = sideVec(side);
  const ex = cx + vx * size * 0.5;
  const ey = cy + vy * size * 0.5;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = edge;
  ctx.lineWidth = size * 0.52;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = size * 0.36;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

function drawTubeJoint(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string, edge: string) {
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, fill: string, edge: string) {
  const teeth = 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / teeth / 2;
    ctx.lineTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78);
    ctx.lineTo(Math.cos(a0 + 0.12) * r, Math.sin(a0 + 0.12) * r);
    ctx.lineTo(Math.cos(a1 - 0.12) * r, Math.sin(a1 - 0.12) * r);
    ctx.lineTo(Math.cos(a1) * r * 0.78, Math.sin(a1) * r * 0.78);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  // 회전이 보이도록 한 칸에 표식
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.arc(r * 0.45, 0, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface CellDrawOpts {
  angle?: number;
  locked?: boolean;
  switchState?: SwitchState;
  pressed?: boolean;
  ghost?: boolean;
}

export function drawCell(ctx: CanvasRenderingContext2D, cell: Cell, px: number, py: number, size: number, o: CellDrawOpts = {}) {
  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.55;
  const tubeFill = C.tube;
  switch (cell.kind) {
    case 'empty': {
      ctx.strokeStyle = '#3a3f52';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(px + 3, py + 3, size - 6, size - 6);
      ctx.setLineDash([]);
      break;
    }
    case 'tube':
    case 'sensor': {
      for (const s of SIDE_LIST) if (cell.open & s) drawTubeArm(ctx, cx, cy, size, s, tubeFill, C.tubeEdge);
      drawTubeJoint(ctx, cx, cy, size, tubeFill, C.tubeEdge);
      if (cell.kind === 'sensor') {
        ctx.fillStyle = o.pressed ? C.sensorOn : C.sensor;
        ctx.strokeStyle = '#1d5a2c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - size * 0.24, cy - size * 0.24, size * 0.48, size * 0.48, 5);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'switch': {
      const active = o.switchState === 'B' ? cell.armB! : cell.armA!;
      const inactive = o.switchState === 'B' ? cell.armA! : cell.armB!;
      drawTubeArm(ctx, cx, cy, size, inactive, C.tubeDim, '#2a2118'); // 닫힌 갈래
      drawTubeArm(ctx, cx, cy, size, cell.common!, tubeFill, C.tubeEdge);
      drawTubeArm(ctx, cx, cy, size, active, tubeFill, C.tubeEdge);
      drawTubeJoint(ctx, cx, cy, size, tubeFill, C.tubeEdge);
      drawGear(ctx, cx, cy, size * 0.3, o.angle ?? 0, o.locked ? C.locked : C.gear, o.locked ? '#7a1d20' : C.gearEdge);
      ctx.fillStyle = '#0d1420';
      ctx.font = `bold ${Math.round(size * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.switchState ?? 'A', cx, cy + 1);
      break;
    }
    case 'gear':
      drawGear(ctx, cx, cy, size * 0.42, o.angle ?? 0, o.locked ? C.locked : C.gear, o.locked ? '#7a1d20' : C.gearEdge);
      break;
    case 'motor': {
      drawGear(ctx, cx, cy, size * 0.42, o.angle ?? 0, o.locked ? C.locked : C.motor, o.locked ? '#7a1d20' : '#8a4b10');
      ctx.fillStyle = '#1b1208';
      ctx.font = `bold ${Math.round(size * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.dir === 1 ? '↻' : '↺', cx, cy + 1);
      break;
    }
  }
  if (o.locked && (cell.kind === 'gear' || cell.kind === 'motor' || cell.kind === 'switch')) {
    ctx.strokeStyle = C.locked;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
  }
  ctx.restore();
}

export interface Ghost {
  cells: ShapeCell[];
  x: number;
  y: number;
  ok: boolean;
}

export interface RenderState {
  board: Board;
  sim: Simulation | null;
  startSwitches: Map<number, SwitchState>;
  ghost: Ghost | null;
  gearAngle: Map<number, number>; // 노드 → 각도(라디안)
  pressed: Set<string>;
  hamster: { x: number; y: number; shake: number } | null; // 격자 좌표(소수 가능)
  inject: 'left' | 'right';
  binCounts: number[];
  lastBin: number | null;
}

export function canvasSize(board: Board): [number, number] {
  return [board.w * CELL, (board.h + TOP_ROWS + BIN_ROWS) * CELL];
}

const oy = TOP_ROWS * CELL;

export function render(ctx: CanvasRenderingContext2D, st: RenderState) {
  const { board, sim } = st;
  const [W_, H_] = canvasSize(board);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W_, H_);

  // 투입구 줄
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 0 : board.w - 1;
    ctx.fillStyle = st.inject === side ? '#3b6e3f' : '#262a36';
    ctx.fillRect(x * CELL + 2, 2, CELL - 4, CELL - 4);
    ctx.fillStyle = C.text;
    ctx.fillText('▼ 투입', x * CELL + CELL / 2, CELL / 2);
  }

  // 격자
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= board.w; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 0.5, oy);
    ctx.lineTo(x * CELL + 0.5, oy + board.h * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= board.h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, oy + y * CELL + 0.5);
    ctx.lineTo(board.w * CELL, oy + y * CELL + 0.5);
    ctx.stroke();
  }

  // 미노 배경(같은 미노끼리 같은 색조)
  for (const p of board.placed) {
    ctx.fillStyle = `hsla(${(p.uid * 67) % 360}, 35%, 40%, 0.22)`;
    for (const c of p.cells) ctx.fillRect((p.x + c.x) * CELL + 1, oy + (p.y + c.y) * CELL + 1, CELL - 1, CELL - 1);
  }

  // 칸
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const c = board.at(x, y);
      if (!c) continue;
      const node = sim?.nodeOfCell.get(board.idx(x, y));
      const sw = c.kind === 'switch' ? (sim ? sim.switchStateAt(x, y) : st.startSwitches.get(board.idx(x, y)) ?? 'A') : undefined;
      drawCell(ctx, c, x * CELL, oy + y * CELL, CELL, {
        angle: node !== undefined ? st.gearAngle.get(node) ?? 0 : 0,
        locked: sim ? sim.isCellLocked(x, y) : false,
        switchState: sw,
        pressed: st.pressed.has(`${x},${y}`),
      });
    }

  // 배치 미리보기
  if (st.ghost) {
    for (const c of st.ghost.cells) {
      const gx = st.ghost.x + c.x;
      const gy = st.ghost.y + c.y;
      if (gx < 0 || gy < 0 || gx >= board.w || gy >= board.h) continue;
      if (!st.ghost.ok) {
        ctx.fillStyle = 'rgba(229,72,77,0.35)';
        ctx.fillRect(gx * CELL, oy + gy * CELL, CELL, CELL);
      }
      drawCell(ctx, c.cell, gx * CELL, oy + gy * CELL, CELL, { ghost: true, switchState: 'A' });
    }
  }

  // 통
  const by = oy + board.h * CELL;
  for (let i = 0; i < BIN_COUNT; i++) {
    const bx = i * BIN_WIDTH * CELL;
    ctx.fillStyle = st.lastBin === i ? '#3b6e3f' : '#20242f';
    ctx.fillRect(bx + 2, by + 2, BIN_WIDTH * CELL - 4, CELL - 4);
    ctx.strokeStyle = '#4a5068';
    ctx.strokeRect(bx + 2.5, by + 2.5, BIN_WIDTH * CELL - 5, CELL - 5);
    ctx.fillStyle = C.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`통 ${i}`, bx + (BIN_WIDTH * CELL) / 2, by + CELL / 2 - 7);
    ctx.fillText(`${st.binCounts[i] ?? 0}`, bx + (BIN_WIDTH * CELL) / 2, by + CELL / 2 + 8);
  }

  // 튕김 표시
  if (sim?.bounce) {
    ctx.strokeStyle = C.locked;
    ctx.lineWidth = 3;
    ctx.strokeRect(sim.bounce.x * CELL + 2, oy + sim.bounce.y * CELL + 2, CELL - 4, CELL - 4);
  }

  // 햄스터
  if (st.hamster) {
    const hx = (st.hamster.x + 0.5) * CELL + st.hamster.shake;
    const hy = oy + (st.hamster.y + 0.5) * CELL;
    ctx.fillStyle = '#c98b52';
    ctx.strokeStyle = '#6b4220';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, CELL * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e7b98a';
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + dx * CELL * 0.17, hy - CELL * 0.2, CELL * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#1b1208';
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + dx * CELL * 0.1, hy - CELL * 0.03, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 화면 좌표 → 격자 좌표 (판 밖이면 null) */
export function cellAt(board: Board, px: number, py: number): { x: number; y: number } | null {
  const x = Math.floor(px / CELL);
  const y = Math.floor((py - oy) / CELL);
  return board.inBounds(x, y) ? { x, y } : null;
}
