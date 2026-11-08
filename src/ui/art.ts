/**
 * 판 그림 (나무 블록 + 투명 햄스터 튜브 + 목도리 햄스터). 색은 테마로 바꿔 끼운다.
 * - 미노마다 다른 나무 결/색 (이웃한 미노끼리는 겹치지 않게 고른다) + 미노 테두리 아웃라인
 * - 튜브 끝 상태가 한눈에: 이어진 이음매 = 연결 고리, 열린 끝 = 주황 고리와 화살표, 마개 = 빨간 마개
 */
import type { Board } from '../core/board';
import type { Links } from '../core/links';
import { activeArm, switchArms } from '../core/parts';
import { binCount, BIN_WIDTH, E, N, opposite, popcount, S, SIDE_LIST, sidesOf, type Part, type ShapeCell, type Sides, type SwitchState } from '../core/types';

export interface Theme {
  name: string;
  bg: string;
  dot: string;
  /** 나무 색: [밝은 쪽, 어두운 쪽, 결] */
  woods: [string, string, string][];
  /** 빈 미노(튜브 없음) 칸 덧칠 */
  emptyTint: string;
  outline: string;
  outlineInner: string;
  tubeWall: string;
  tubeGlass: string;
  tubeShine: string;
  ring: string;
  coupler: string;
  openEnd: string;
  plug: string;
  warn: string;
  plate: string;
  plateEdge: string;
  brass: string;
  brassEdge: string;
  motor: string;
  sensor: string;
  sensorOn: string;
  locked: string;
  bin: string;
  binEdge: string;
  text: string;
  fur: string;
  furDark: string;
  belly: string;
  scarf: [string, string];
}

/** 시안 C: 물들인 나무 + 투명 튜브 (재혁 선택 2026-11-08) */
export const THEME: Theme = {
  name: '물들인 나무',
  bg: '#14161c',
  dot: '#262a35',
  woods: [
    ['#9fd8c1', '#7bbba2', '#5d9c84'],
    ['#f4b9a0', '#d99a80', '#bb7c62'],
    ['#c7b5ea', '#a895cf', '#8a77b2'],
    ['#a9cdf0', '#86afd6', '#6691ba'],
    ['#f2d58b', '#d7b96c', '#b99c51'],
  ],
  emptyTint: 'rgba(20,20,30,0.25)',
  outline: '#ffffff',
  outlineInner: 'rgba(0,0,0,0.35)',
  tubeWall: 'rgba(220,240,255,0.30)',
  tubeGlass: 'rgba(160,210,240,0.22)',
  tubeShine: 'rgba(255,255,255,0.75)',
  ring: 'rgba(240,250,255,0.55)',
  coupler: '#ffe14a',
  openEnd: '#ff8a3d',
  plug: '#e5484d',
  warn: '#ff8a3d',
  plate: '#6c4fb3',
  plateEdge: '#c9b4ff',
  brass: '#e0b04a',
  brassEdge: '#6e4f12',
  motor: '#f08a3c',
  sensor: '#53c26b',
  sensorOn: '#ffe14a',
  locked: '#e5484d',
  bin: '#1f2430',
  binEdge: '#4a5068',
  text: '#f3ecdf',
  fur: '#e8ad62',
  furDark: '#b97b37',
  belly: '#fff2dc',
  scarf: ['#ef4b4b', '#3d8ef0'],
};

// ---------------------------------------------------------------

const vec = (s: Sides): [number, number] => (s === N ? [0, -1] : s === S ? [0, 1] : s === E ? [1, 0] : [-1, 0]);

/** 미노마다 나무 색 번호: 이웃한 미노와 겹치지 않게 (탐욕 색칠) */
export function woodIndex(board: Board, n: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of board.placed) {
    const used = new Set<number>();
    for (const c of p.cells) {
      const x = p.x + c.x;
      const y = p.y + c.y;
      for (const s of SIDE_LIST) {
        const [dx, dy] = vec(s);
        if (!board.inBounds(x + dx, y + dy)) continue;
        const u = board.owner[board.idx(x + dx, y + dy)]!;
        if (u && u !== p.uid && out.has(u)) used.add(out.get(u)!);
      }
    }
    let k = p.uid % n;
    for (let t = 0; t < n && used.has(k); t++) k = (k + 1) % n;
    out.set(p.uid, k);
  }
  return out;
}

/** 0~1 결정적 난수 */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function drawWoodCell(ctx: CanvasRenderingContext2D, t: Theme, wood: [string, string, string], px: number, py: number, s: number, seed: number, empty: boolean) {
  const g = ctx.createLinearGradient(px, py, px + s, py + s);
  g.addColorStop(0, wood[0]);
  g.addColorStop(1, wood[1]);
  ctx.fillStyle = g;
  ctx.fillRect(px, py, s, s);
  // 나뭇결
  ctx.strokeStyle = wood[2];
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const y0 = py + s * (0.2 + 0.3 * k + 0.1 * rand(seed + k));
    ctx.beginPath();
    ctx.moveTo(px, y0);
    ctx.bezierCurveTo(px + s * 0.3, y0 + s * 0.08 * (rand(seed * 3 + k) - 0.5), px + s * 0.7, y0 - s * 0.1 * (rand(seed * 7 + k) - 0.5), px + s, y0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (empty) {
    ctx.fillStyle = t.emptyTint;
    ctx.fillRect(px, py, s, s);
    // 빈 칸 표시: 작은 나사 네 개
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const) {
      ctx.beginPath();
      ctx.arc(px + s * fx, py + s * fy, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 미노 바깥 테두리 (아웃라인) */
export function drawMinoOutline(ctx: CanvasRenderingContext2D, t: Theme, board: Board, uid: number, cells: { x: number; y: number }[], ox: number, oy: number, s: number) {
  const same = (x: number, y: number) => board.inBounds(x, y) && board.owner[board.idx(x, y)] === uid;
  for (const [color, w, inset] of [[t.outlineInner, 4, 2.5], [t.outline, 2, 1]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const c of cells) {
      const x0 = ox + c.x * s + inset;
      const y0 = oy + c.y * s + inset;
      const x1 = ox + (c.x + 1) * s - inset;
      const y1 = oy + (c.y + 1) * s - inset;
      if (!same(c.x, c.y - 1)) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (!same(c.x, c.y + 1)) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (!same(c.x - 1, c.y)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (!same(c.x + 1, c.y)) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
    ctx.stroke();
  }
}

/** 투명 튜브: 한 칸의 갈래들을 한 경로로 이어 한 번에 칠한다 (겹친 자리가 진해지지 않게) */
export function tubeCell(ctx: CanvasRenderingContext2D, t: Theme, cx: number, cy: number, s: number, arms: { side: Sides; len?: number }[]) {
  if (!arms.length) return;
  const end = (a: { side: Sides; len?: number }) => {
    const [vx, vy] = vec(a.side);
    const l = a.len ?? 0.5;
    return [cx + vx * s * l, cy + vy * s * l] as const;
  };
  const path = () => {
    ctx.beginPath();
    const [x0, y0] = end(arms[0]!);
    ctx.moveTo(x0, y0);
    ctx.lineTo(cx, cy);
    if (arms.length === 1) ctx.lineTo(cx, cy);
    for (const a of arms.slice(1)) {
      const [x1, y1] = end(a);
      ctx.lineTo(x1, y1);
      ctx.moveTo(cx, cy);
    }
  };
  ctx.lineJoin = 'round';
  // 갈래가 하나뿐인 칸(막힌 끝)은 가운데를 둥글게
  ctx.lineCap = arms.length === 1 ? 'round' : 'butt';
  for (const [color, w] of [['rgba(0,0,0,0.35)', 0.6], [t.tubeWall, 0.54], [t.tubeGlass, 0.4], [t.tubeShine, 0.07]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s * w;
    if (color === t.tubeShine) ctx.globalAlpha = 0.45;
    path();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';
}

/** 한 갈래만 (스위치 관, 흐린 토막) */
export function tubeArm(ctx: CanvasRenderingContext2D, t: Theme, cx: number, cy: number, s: number, side: Sides, len = 0.5) {
  tubeCell(ctx, t, cx, cy, s, [{ side, len }]);
}

function tubeJoint(ctx: CanvasRenderingContext2D, t: Theme, cx: number, cy: number, s: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.tubeWall;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.tubeGlass;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** 칸 경계에 걸친 고리 (이음매): 색 = 상태 */
function collar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, side: Sides, color: string, pos = 0.5) {
  const [vx, vy] = vec(side);
  const mx = cx + vx * s * pos;
  const my = cy + vy * s * pos;
  const w = vx ? s * 0.16 : s * 0.7;
  const h = vy ? s * 0.16 : s * 0.7;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(mx - w / 2, my - h / 2, w, h, s * 0.05);
  ctx.fill();
  ctx.stroke();
}

function chevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, side: Sides, color: string) {
  const [vx, vy] = vec(side);
  const tx = cx + vx * s * 0.62;
  const ty = cy + vy * s * 0.62;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx + vx * s * 0.13, ty + vy * s * 0.13);
  ctx.lineTo(tx - vy * s * 0.13, ty + vx * s * 0.13);
  ctx.lineTo(tx + vy * s * 0.13, ty - vx * s * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawGear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, fill: string, edge: string, teeth = 9) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = a0 + Math.PI / teeth;
    ctx.lineTo(Math.cos(a0) * r * 0.8, Math.sin(a0) * r * 0.8);
    ctx.lineTo(Math.cos(a0 + 0.1) * r, Math.sin(a0 + 0.1) * r);
    ctx.lineTo(Math.cos(a1 - 0.1) * r, Math.sin(a1 - 0.1) * r);
    ctx.lineTo(Math.cos(a1) * r * 0.8, Math.sin(a1) * r * 0.8);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface PartLook {
  angle: number;
  locked: boolean;
  state?: SwitchState;
  pressed: boolean;
  /** 스위치 관이 아직 덜 돈 각도 */
  turn: number;
  link: Sides;
}

export function drawPart(ctx: CanvasRenderingContext2D, t: Theme, part: Part, px: number, py: number, s: number, o: PartLook) {
  const cx = px + s / 2;
  const cy = py + s / 2;
  const red = o.locked;
  switch (part.type) {
    case 'gear':
      drawGear(ctx, cx, cy, s * 0.4, o.angle, red ? t.locked : t.brass, red ? '#5a1416' : t.brassEdge);
      break;
    case 'motor': {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76, s * 0.12);
      ctx.fill();
      drawGear(ctx, cx, cy, s * 0.36, o.angle, red ? t.locked : t.motor, red ? '#5a1416' : '#6b3410', 10);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(s * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(part.dir === 1 ? '↻' : '↺', cx, cy + 1);
      break;
    }
    case 'sensor': {
      // 튜브를 감싸는 띠 + 불빛
      ctx.fillStyle = o.pressed ? t.sensorOn : t.sensor;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.33, cy - s * 0.33, s * 0.66, s * 0.66, s * 0.18);
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.fillStyle = o.pressed ? '#fff8c4' : '#c9ffd6';
      ctx.beginPath();
      ctx.arc(cx + s * 0.22, cy - s * 0.22, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'switch': {
      const open = activeArm(part, o.state ?? 'A');
      // 막다른 갈래: 흐린 토막
      ctx.globalAlpha = 0.35;
      for (const a of sidesOf(o.link)) if (a !== part.common && a !== open) tubeArm(ctx, t, cx, cy, s, a);
      ctx.globalAlpha = 1;
      // 돌림판
      drawGear(ctx, cx, cy, s * 0.46, o.angle, red ? t.locked : t.plate, red ? '#5a1416' : t.plateEdge, 12);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(o.turn);
      tubeCell(ctx, t, 0, 0, s, [{ side: part.common! }, { side: open }]);
      ctx.restore();
      const [vx, vy] = vec(part.common!);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx + vx * s * 0.4, cy + vy * s * 0.4, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(s * 0.24)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(switchArms(part.arms!, part.common!).length ? (o.state ?? 'A') : '?', px + s * 0.84, py + s * 0.84);
      break;
    }
    case 'plug':
      break; // 마개는 튜브 끝 그림에서 그린다
  }
}

/** 목도리 두른 햄스터 */
export function drawHamster(ctx: CanvasRenderingContext2D, t: Theme, hx: number, hy: number, s: number, color: number, squash = 0) {
  const r = s * 0.36;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(1 + squash, 1 - squash);
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.9, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // 귀
  for (const dx of [-1, 1]) {
    ctx.fillStyle = t.furDark;
    ctx.beginPath();
    ctx.arc(dx * r * 0.6, -r * 0.75, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7a7b5';
    ctx.beginPath();
    ctx.arc(dx * r * 0.6, -r * 0.75, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  // 몸
  ctx.fillStyle = t.fur;
  ctx.strokeStyle = t.furDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 배·볼
  ctx.fillStyle = t.belly;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.3, r * 0.65, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // 목도리
  const sc = t.scarf[color] ?? t.scarf[0];
  ctx.fillStyle = sc;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-r * 0.85, -r * 0.08, r * 1.7, r * 0.32, r * 0.14);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(r * 0.35, r * 0.1, r * 0.28, r * 0.55, r * 0.1);
  ctx.fill();
  ctx.stroke();
  // 눈·코
  ctx.fillStyle = '#1b1208';
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(dx * r * 0.36, -r * 0.35, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(dx * r * 0.36 + r * 0.04, -r * 0.39, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f08aa0';
  ctx.beginPath();
  ctx.arc(0, -r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------

export interface ArtView {
  board: Board;
  links: Links;
  switchState: (x: number, y: number) => SwitchState | undefined;
  locked: (x: number, y: number) => boolean;
  gearAngle: (x: number, y: number) => number;
  switchTurn: (x: number, y: number) => number;
  pressed: Set<string>;
  floating: { cells: ShapeCell[]; x: number; y: number; ok: boolean } | null;
  ghost: { cells: ShapeCell[]; x: number; y: number } | null;
  cursor: { x: number; y: number } | null;
  hamster: { x: number; y: number; color: number; shake: number; squash?: number } | null;
  nextInject: 'left' | 'right' | null;
  bins: number[][];
  goals: number[][] | null;
  /** 통별 통통 튐 (0~1) */
  binBounce?: number[];
  fixedUids?: Set<number>;
  blink: boolean;
}

export const CELL = 40;
export const TOP = 1;
export const BIN_ROWS = 2;

export function artSize(board: Board): [number, number] {
  return [board.w * CELL, (board.h + TOP + BIN_ROWS) * CELL];
}

export function renderArt(ctx: CanvasRenderingContext2D, t: Theme, v: ArtView) {
  const { board, links } = v;
  const s = CELL;
  const OY = TOP * s;
  const [W_, H_] = artSize(board);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W_, H_);
  // 점 격자
  ctx.fillStyle = t.dot;
  for (let y = 0; y <= board.h; y++) for (let x = 0; x <= board.w; x++) {
    ctx.beginPath();
    ctx.arc(x * s, OY + y * s, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 투입구
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 0 : board.w - 1;
    const on = v.nextInject === side;
    ctx.fillStyle = on ? '#3b6e3f' : '#262a36';
    ctx.beginPath();
    ctx.roundRect(x * s + 3, 3, s - 6, s - 6, 8);
    ctx.fill();
    ctx.fillStyle = on ? '#e9ffe6' : '#9aa3b8';
    ctx.fillText('▼', x * s + s / 2, s / 2);
  }

  // 통
  const by = OY + board.h * s;
  for (let i = 0; i < binCount(board.w); i++) {
    const bx = i * BIN_WIDTH * s;
    const w = Math.min(BIN_WIDTH, board.w - i * BIN_WIDTH) * s;
    const bounce = (v.binBounce?.[i] ?? 0) * 6;
    const goal = v.goals?.[i];
    const counts = v.bins[i] ?? [0, 0];
    const met = goal && counts[0] === goal[0] && counts[1] === goal[1];
    ctx.fillStyle = t.bin;
    ctx.strokeStyle = goal && v.bins.length ? (met ? '#53c26b' : '#e5484d') : t.binEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx + 4, by + 6 - bounce, w - 8, BIN_ROWS * s - 10, [4, 4, 14, 14]);
    ctx.fill();
    ctx.stroke();
    const narrow = w < BIN_WIDTH * s;
    ctx.fillStyle = t.text;
    ctx.font = '11px system-ui, sans-serif';
    if (!narrow) ctx.fillText(goal ? `목표` : `통 ${i}`, bx + w / 2, by + 18 - bounce);
    // 색별: 목도리 점 + 지금/목표 (한 칸짜리 통은 숫자만 작게)
    [0, 1].forEach((col) => {
      const yy = by + (narrow ? 22 : 38) + col * (narrow ? 22 : 18) - bounce;
      ctx.fillStyle = t.scarf[col]!;
      ctx.beginPath();
      ctx.arc(narrow ? bx + w / 2 : bx + w / 2 - 22, narrow ? yy - 8 : yy, narrow ? 4 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.text;
      ctx.font = narrow ? 'bold 10px system-ui, sans-serif' : 'bold 13px system-ui, sans-serif';
      const txt = goal ? `${counts[col]}/${goal[col]}` : String(counts[col]);
      ctx.fillText(txt, narrow ? bx + w / 2 : bx + w / 2 + 6, narrow ? yy + 3 : yy + 1);
    });
  }

  // 나무 블록
  const tone = woodIndex(board, t.woods.length);
  for (const p of board.placed) {
    const wood = t.woods[tone.get(p.uid) ?? 0]!;
    for (const c of p.cells) {
      const gx = p.x + c.x;
      const gy = p.y + c.y;
      drawWoodCell(ctx, t, wood, gx * s, OY + gy * s, s, p.uid * 31 + gx * 7 + gy, c.cell.kind === 'empty');
    }
    if (v.fixedUids?.has(p.uid)) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (const c of p.cells) ctx.fillRect((p.x + c.x) * s, OY + (p.y + c.y) * s, s, s);
    }
  }
  for (const p of board.placed)
    drawMinoOutline(
      ctx,
      t,
      board,
      p.uid,
      p.cells.map((c) => ({ x: p.x + c.x, y: p.y + c.y })),
      0,
      OY,
      s,
    );
  // 고정 미노: 모서리 못
  for (const p of board.placed) {
    if (!v.fixedUids?.has(p.uid)) continue;
    ctx.fillStyle = '#c9ccd6';
    for (const c of p.cells) {
      ctx.beginPath();
      ctx.arc((p.x + c.x) * s + 6, OY + (p.y + c.y) * s + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 튜브
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const i = board.idx(x, y);
      const c = board.cells[i];
      if (!c || c.kind !== 'tube') continue;
      const part = board.parts.get(i);
      if (part?.type === 'switch') continue;
      const cx = x * s + s / 2;
      const cy = OY + y * s + s / 2;
      const sides = (links.link[i]! | links.exit[i]!) || c.inner;
      const arms = sidesOf(sides).map((side) => ({ side, len: 0.5 }));
      if (part?.type === 'plug') arms.push({ side: opposite(c.inner), len: 0.3 });
      tubeCell(ctx, t, cx, cy, s, arms);
    }

  // 끝 상태: 이음 고리 / 열린 끝 / 마개
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const i = board.idx(x, y);
      const c = board.cells[i];
      if (!c || c.kind !== 'tube' || !c.end) continue;
      const cx = x * s + s / 2;
      const cy = OY + y * s + s / 2;
      const outSide = opposite(c.inner);
      if (board.parts.get(i)?.type === 'plug') {
        // 마개: 빨간 뚜껑
        const [vx, vy] = vec(outSide);
        const mx = cx + vx * s * 0.32;
        const my = cy + vy * s * 0.32;
        ctx.fillStyle = t.plug;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mx - (vx ? s * 0.1 : s * 0.33), my - (vy ? s * 0.1 : s * 0.33), vx ? s * 0.2 : s * 0.66, vy ? s * 0.2 : s * 0.66, s * 0.06);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const ext = links.link[i]! & ~c.inner;
      for (const sd of sidesOf(ext)) {
        const [vx, vy] = vec(sd);
        // 짝 칸 쪽에서 한 번만
        if (sd === E || sd === S) collar(ctx, cx, cy, s, sd, t.coupler);
        else if (!board.inBounds(x + vx, y + vy)) collar(ctx, cx, cy, s, sd, t.coupler);
      }
      if (links.exit[i]) {
        collar(ctx, cx, cy, s, links.exit[i]!, t.openEnd, 0.44);
        chevron(ctx, cx, cy, s, links.exit[i]!, t.openEnd);
      }
    }

  // 분기점(스위치 없음) 경고
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const i = board.idx(x, y);
      if (popcount(links.link[i]!) < 3 || board.parts.get(i)?.type === 'switch') continue;
      ctx.strokeStyle = v.blink ? t.warn : 'rgba(255,138,61,0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(x * s + s / 2, OY + y * s + s / 2, s * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  // 부품
  for (const [i, part] of board.parts) {
    const x = i % board.w;
    const y = Math.floor(i / board.w);
    drawPart(ctx, t, part, x * s, OY + y * s, s, {
      angle: v.gearAngle(x, y),
      locked: v.locked(x, y),
      state: v.switchState(x, y),
      pressed: v.pressed.has(`${x},${y}`),
      turn: v.switchTurn(x, y),
      link: links.link[i]!,
    });
  }

  // 착지 미리보기
  if (v.ghost) {
    ctx.strokeStyle = 'rgba(143,193,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    for (const c of v.ghost.cells) {
      const gy = v.ghost.y + c.y;
      if (gy >= 0) ctx.strokeRect((v.ghost.x + c.x) * s + 3, OY + gy * s + 3, s - 6, s - 6);
    }
    ctx.setLineDash([]);
  }
  // 들고 있는 미노
  if (v.floating) {
    ctx.globalAlpha = 0.85;
    for (const c of v.floating.cells) {
      const gy = v.floating.y + c.y;
      if (gy < 0) continue;
      const px = (v.floating.x + c.x) * s;
      const py = OY + gy * s;
      drawWoodCell(ctx, t, t.woods[0]!, px, py, s, 7 + c.x * 3 + c.y, c.cell.kind === 'empty');
      if (c.cell.kind === 'tube') {
        const arms = sidesOf(c.cell.inner).map((side) => ({ side, len: 0.5 }));
        if (c.cell.end) arms.push({ side: opposite(c.cell.inner), len: 0.45 });
        tubeCell(ctx, t, px + s / 2, py + s / 2, s, arms);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = v.floating.ok ? '#8fc1ff' : t.locked;
    ctx.lineWidth = 2.5;
    for (const c of v.floating.cells) {
      const gy = v.floating.y + c.y;
      if (gy >= 0) ctx.strokeRect((v.floating.x + c.x) * s + 1.5, OY + gy * s + 1.5, s - 3, s - 3);
    }
  }
  // 부품 커서
  if (v.cursor) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(v.cursor.x * s + 2, OY + v.cursor.y * s + 2, s - 4, s - 4);
    ctx.setLineDash([]);
  }
  // 햄스터
  if (v.hamster) drawHamster(ctx, t, (v.hamster.x + 0.5) * s + v.hamster.shake, OY + (v.hamster.y + 0.5) * s, s, v.hamster.color, v.hamster.squash ?? 0);
}



/** 패널용 작은 햄스터 그림 (목도리 색으로 빨강/파랑) */
export function hamsterIcon(color: number, px = 28): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = px * dpr;
  c.height = px * dpr;
  c.style.width = `${px}px`;
  c.style.height = `${px}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawHamster(ctx, THEME, px / 2, px * 0.56, px * 1.15, color);
  return c;
}
