import type { Board } from '../core/board';
import type { Links } from '../core/links';
import { activeArm, switchArms } from '../core/parts';
import { binCount, BIN_WIDTH, E, N, popcount, S, SIDE_LIST, type Cell, type Part, type ShapeCell, type Sides, type SwitchState } from '../core/types';

export const CELL = 40;
export const TOP_ROWS = 1;
export const BIN_ROWS = 2;
const OY = TOP_ROWS * CELL;

export const COLORS = ['#ef5b5b', '#4f9cf0']; // 햄스터 색 0, 1
const C = {
  bg: '#14161c',
  grid: '#232733',
  tubeEdge: '#7c5a2b',
  tube: '#e8c98f',
  tubeDim: '#5a4a33',
  exit: '#fff3c4',
  gear: '#7fa6d8',
  gearEdge: '#2d4a73',
  motor: '#f0a04b',
  switchGear: '#b48cf2',
  switchEdge: '#4b2d7a',
  locked: '#e5484d',
  sensor: '#53c26b',
  sensorOn: '#ffe14a',
  warn: '#ff8a3d',
  text: '#f0f0f0',
};

function vec(s: Sides): [number, number] {
  return s === N ? [0, -1] : s === S ? [0, 1] : s === E ? [1, 0] : [-1, 0];
}

function arm(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, s: Sides, fill: string, edge: string, len = 0.5) {
  const [vx, vy] = vec(s);
  ctx.lineCap = 'butt';
  for (const [w, col] of [[0.5, edge], [0.34, fill]] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = size * w;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + vx * size * len, cy + vy * size * len);
    ctx.stroke();
  }
}

export function drawGear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, fill: string, edge: string) {
  const teeth = 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = a0 + Math.PI / teeth;
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
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.arc(r * 0.45, 0, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 미노 칸 하나 (튜브 연결은 links 를 따른다. links 가 없으면 미노 안 경로만) */
export function drawTubeCell(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  px: number,
  py: number,
  size: number,
  link: Sides,
  exit: Sides,
) {
  if (cell.kind !== 'tube') return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  for (const s of SIDE_LIST) if (link & s) arm(ctx, cx, cy, size, s, C.tube, C.tubeEdge);
  if (exit) {
    arm(ctx, cx, cy, size, exit, C.exit, C.tubeEdge);
    // 열린 출구 표시: 바깥을 향한 작은 화살촉
    const [vx, vy] = vec(exit);
    const tx = cx + vx * size * 0.42;
    const ty = cy + vy * size * 0.42;
    ctx.fillStyle = '#7c5a2b';
    ctx.beginPath();
    ctx.moveTo(tx + vx * size * 0.08, ty + vy * size * 0.08);
    ctx.lineTo(tx - vy * size * 0.1, ty + vx * size * 0.1);
    ctx.lineTo(tx + vy * size * 0.1, ty - vx * size * 0.1);
    ctx.fill();
  }
  ctx.fillStyle = C.tubeEdge;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.tube;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.17, 0, Math.PI * 2);
  ctx.fill();
}

export interface PartDrawOpts {
  angle?: number;
  locked?: boolean;
  state?: SwitchState;
  pressed?: boolean;
  link?: Sides;
  /** 부품이 놓인 칸이 튜브 끝일 때 막힌 변 (마개 그림 위치) */
  plugSide?: Sides;
}

export function drawPart(ctx: CanvasRenderingContext2D, part: Part, px: number, py: number, size: number, o: PartDrawOpts = {}) {
  const cx = px + size / 2;
  const cy = py + size / 2;
  const red = o.locked;
  switch (part.type) {
    case 'sensor': {
      ctx.fillStyle = o.pressed ? C.sensorOn : C.sensor;
      ctx.strokeStyle = '#1d5a2c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx - size * 0.24, cy - size * 0.24, size * 0.48, size * 0.48, 4);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.5;
      for (const k of [-0.09, 0, 0.09]) {
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.15, cy + k * size);
        ctx.lineTo(cx + size * 0.15, cy + k * size);
        ctx.stroke();
      }
      break;
    }
    case 'gear':
      drawGear(ctx, cx, cy, size * 0.36, o.angle ?? 0, red ? C.locked : C.gear, red ? '#7a1d20' : C.gearEdge);
      break;
    case 'motor':
      drawGear(ctx, cx, cy, size * 0.4, o.angle ?? 0, red ? C.locked : C.motor, red ? '#7a1d20' : '#8a4b10');
      ctx.fillStyle = '#1b1208';
      ctx.font = `bold ${Math.round(size * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(part.dir === 1 ? '↻' : '↺', cx, cy + 1);
      break;
    case 'switch': {
      const arms = switchArms(part.arms!, part.common!);
      const open = activeArm(part, o.state ?? 'A');
      // 닫힌 갈래: 어둡게 + 빨간 막대
      for (const a of arms) {
        if (a === open) continue;
        arm(ctx, cx, cy, size, a, C.tubeDim, '#2a2118');
        const [vx, vy] = vec(a);
        ctx.strokeStyle = C.locked;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const bx = cx + vx * size * 0.38;
        const by = cy + vy * size * 0.38;
        ctx.moveTo(bx - vy * size * 0.18, by - vx * size * 0.18);
        ctx.lineTo(bx + vy * size * 0.18, by + vx * size * 0.18);
        ctx.stroke();
      }
      arm(ctx, cx, cy, size, part.common!, C.tube, C.tubeEdge);
      arm(ctx, cx, cy, size, open, C.tube, C.tubeEdge);
      // 공통 갈래 표시: 흰 점
      const [vx, vy] = vec(part.common!);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx + vx * size * 0.38, cy + vy * size * 0.38, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
      drawGear(ctx, cx, cy, size * 0.3, o.angle ?? 0, red ? C.locked : C.switchGear, red ? '#7a1d20' : C.switchEdge);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(size * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.state ?? 'A', cx, cy + 1);
      break;
    }
    case 'plug': {
      const s = o.plugSide ?? N;
      const [vx, vy] = vec(s);
      ctx.fillStyle = '#5b6170';
      ctx.strokeStyle = '#c9d1e6';
      ctx.lineWidth = 2;
      const w = vx ? size * 0.16 : size * 0.5;
      const h = vy ? size * 0.16 : size * 0.5;
      const mx = cx + vx * size * 0.34;
      const my = cy + vy * size * 0.34;
      ctx.fillRect(mx - w / 2, my - h / 2, w, h);
      ctx.strokeRect(mx - w / 2, my - h / 2, w, h);
      break;
    }
  }
}

export interface Floating {
  cells: ShapeCell[];
  x: number;
  y: number;
  ok: boolean;
}

export interface View {
  board: Board;
  links: Links;
  switchState: (x: number, y: number) => SwitchState | undefined;
  locked: (x: number, y: number) => boolean;
  gearAngle: (x: number, y: number) => number;
  pressed: Set<string>;
  floating: Floating | null;
  cursor: { x: number; y: number } | null;
  hamster: { x: number; y: number; color: number; shake: number } | null;
  nextInject: 'left' | 'right' | null;
  /** bins[통][색] */
  bins: number[][];
  blink: boolean;
}

export function canvasSize(board: Board): [number, number] {
  return [board.w * CELL, (board.h + TOP_ROWS + BIN_ROWS) * CELL];
}

export function render(ctx: CanvasRenderingContext2D, v: View) {
  const { board, links } = v;
  const [W_, H_] = canvasSize(board);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W_, H_);

  // 투입구
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 0 : board.w - 1;
    ctx.fillStyle = v.nextInject === side ? '#3b6e3f' : '#262a36';
    ctx.fillRect(x * CELL + 2, 2, CELL - 4, CELL - 4);
    ctx.fillStyle = C.text;
    ctx.fillText(side === 'left' ? '▼왼' : '▼오', x * CELL + CELL / 2, CELL / 2);
  }

  // 격자
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= board.w; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 0.5, OY);
    ctx.lineTo(x * CELL + 0.5, OY + board.h * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= board.h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, OY + y * CELL + 0.5);
    ctx.lineTo(board.w * CELL, OY + y * CELL + 0.5);
    ctx.stroke();
  }

  // 미노 바탕 + 테두리
  for (const p of board.placed) {
    for (const c of p.cells) {
      ctx.fillStyle = c.cell.kind === 'empty' ? '#2a3040' : `hsla(${(p.uid * 67) % 360}, 25%, 35%, 0.35)`;
      ctx.fillRect((p.x + c.x) * CELL, OY + (p.y + c.y) * CELL, CELL, CELL);
    }
  }
  ctx.strokeStyle = 'rgba(201,209,230,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const p of board.placed)
    for (const c of p.cells) {
      const gx = p.x + c.x;
      const gy = p.y + c.y;
      const same = (dx: number, dy: number) => board.inBounds(gx + dx, gy + dy) && board.owner[board.idx(gx + dx, gy + dy)] === p.uid;
      const x0 = gx * CELL + 1;
      const y0 = OY + gy * CELL + 1;
      const x1 = (gx + 1) * CELL - 1;
      const y1 = OY + (gy + 1) * CELL - 1;
      if (!same(0, -1)) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (!same(0, 1)) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (!same(-1, 0)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (!same(1, 0)) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
  ctx.stroke();

  // 튜브 + 부품 + 분기점
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const i = board.idx(x, y);
      const c = board.cells[i];
      if (!c) continue;
      const px = x * CELL;
      const py = OY + y * CELL;
      const part = board.parts.get(i);
      if (part?.type !== 'switch') drawTubeCell(ctx, c, px, py, CELL, links.link[i]!, links.exit[i]!);
      const deg = popcount(links.link[i]!);
      if (deg >= 3) {
        ctx.strokeStyle = part?.type === 'switch' ? C.switchGear : v.blink ? C.warn : '#a85a22';
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
      }
      if (part) {
        drawPart(ctx, part, px, py, CELL, {
          angle: v.gearAngle(x, y),
          locked: v.locked(x, y),
          state: v.switchState(x, y),
          pressed: v.pressed.has(`${x},${y}`),
          plugSide: c.kind === 'tube' && c.end ? oppositeOf(c.inner) : N,
        });
      }
    }

  // 떠 있는 미노
  if (v.floating) {
    for (const c of v.floating.cells) {
      const gx = v.floating.x + c.x;
      const gy = v.floating.y + c.y;
      const px = gx * CELL;
      const py = OY + gy * CELL;
      ctx.fillStyle = v.floating.ok ? 'rgba(80,140,220,0.35)' : 'rgba(229,72,77,0.45)';
      ctx.fillRect(px, py, CELL, CELL);
      if (c.cell.kind === 'tube') drawTubeCell(ctx, c.cell, px, py, CELL, c.cell.inner, 0);
      ctx.strokeStyle = v.floating.ok ? '#8fc1ff' : C.locked;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
  }

  // 부품 커서
  if (v.cursor) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(v.cursor.x * CELL + 2, OY + v.cursor.y * CELL + 2, CELL - 4, CELL - 4);
    ctx.setLineDash([]);
  }

  // 통: 색별 마릿수
  const by = OY + board.h * CELL;
  for (let i = 0; i < binCount(board.w); i++) {
    const bx = i * BIN_WIDTH * CELL;
    const w = BIN_WIDTH * CELL;
    ctx.fillStyle = '#20242f';
    ctx.fillRect(bx + 2, by + 2, w - 4, BIN_ROWS * CELL - 4);
    ctx.strokeStyle = '#4a5068';
    ctx.strokeRect(bx + 2.5, by + 2.5, w - 5, BIN_ROWS * CELL - 5);
    ctx.fillStyle = C.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`통 ${i}`, bx + w / 2, by + 14);
    const counts = v.bins[i] ?? [0, 0];
    counts.forEach((n, col) => {
      ctx.fillStyle = COLORS[col]!;
      ctx.beginPath();
      ctx.arc(bx + w / 2 - 18 + col * 36 - 8, by + 44, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(String(n), bx + w / 2 - 18 + col * 36 + 8, by + 44);
    });
  }

  // 햄스터
  if (v.hamster) {
    const hx = (v.hamster.x + 0.5) * CELL + v.hamster.shake;
    const hy = OY + (v.hamster.y + 0.5) * CELL;
    ctx.fillStyle = COLORS[v.hamster.color]!;
    ctx.strokeStyle = '#1b1208';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, CELL * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe2c4';
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + dx * CELL * 0.16, hy - CELL * 0.2, CELL * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#1b1208';
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + dx * CELL * 0.09, hy - CELL * 0.02, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function oppositeOf(inner: Sides): Sides {
  // 끝 칸의 경로 반대쪽(직진 방향) = 마개가 막는 쪽
  return inner === N ? S : inner === S ? N : inner === E ? 8 : E;
}
