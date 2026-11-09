/**
 * 판 그림 (나무 블록 + 투명 햄스터 튜브 + 목도리 햄스터). 색은 테마로 바꿔 끼운다.
 * - 미노마다 다른 나무 결/색 (이웃한 미노끼리는 겹치지 않게 고른다) + 미노 테두리 아웃라인
 * - 튜브 끝 상태가 한눈에: 이어진 이음매 = 연결 고리, 열린 끝 = 주황 고리와 화살표, 마개 = 빨간 마개
 */
import type { Board } from '../core/board';
import type { MachinePreview } from '../core/machine';
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
/** mood: roll(보통) · fall(놀람: 동그란 눈, 오 입) · happy(^^ 눈, 웃는 입) · dizzy(× 눈, 물결 입) */
export function drawHamster(ctx: CanvasRenderingContext2D, t: Theme, hx: number, hy: number, s: number, color: number, squash = 0, tilt = 0, mood: 'roll' | 'fall' | 'happy' | 'dizzy' = 'roll') {
  const r = s * 0.36;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
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
  // 눈·코·입 (표정)
  ctx.fillStyle = '#1b1208';
  ctx.strokeStyle = '#1b1208';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  for (const dx of [-1, 1]) {
    const ex = dx * r * 0.36;
    const ey = -r * 0.35;
    ctx.beginPath();
    if (mood === 'happy') {
      ctx.arc(ex, ey + r * 0.05, r * 0.11, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else if (mood === 'dizzy') {
      const k = r * 0.09;
      ctx.moveTo(ex - k, ey - k);
      ctx.lineTo(ex + k, ey + k);
      ctx.moveTo(ex + k, ey - k);
      ctx.lineTo(ex - k, ey + k);
      ctx.stroke();
    } else {
      ctx.arc(ex, ey, r * (mood === 'fall' ? 0.15 : 0.11), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (mood === 'roll' || mood === 'fall') {
    ctx.fillStyle = '#fff';
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(dx * r * 0.36 + r * 0.04, -r * 0.39, r * (mood === 'fall' ? 0.06 : 0.04), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#f08aa0';
  ctx.beginPath();
  ctx.arc(0, -r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  if (mood !== 'roll') {
    ctx.strokeStyle = '#7a3b2a';
    ctx.fillStyle = '#7a3b2a';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    if (mood === 'fall') {
      ctx.ellipse(0, -r * 0.13, r * 0.05, r * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'happy') {
      ctx.arc(0, -r * 0.22, r * 0.11, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else {
      ctx.moveTo(-r * 0.14, -r * 0.12);
      ctx.quadraticCurveTo(-r * 0.07, -r * 0.18, 0, -r * 0.12);
      ctx.quadraticCurveTo(r * 0.07, -r * 0.06, r * 0.14, -r * 0.12);
      ctx.stroke();
    }
  }
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
  hamster: { x: number; y: number; color: number; shake: number; squash?: number; tilt?: number; question?: boolean; mood?: 'roll' | 'fall' | 'happy' | 'dizzy' } | null;
  nextInject: 'left' | 'right' | null;
  bins: number[][];
  goals: number[][] | null;
  /** 통별 통통 튐 (0~1) */
  binBounce?: number[];
  /** 실패 직후: 안 맞는 통을 빨갛게 깜빡 */
  failFlash?: boolean;
  fixedUids?: Set<number>;
  blink: boolean;
  /** 판 위 안내: 빛나는 칸 + 말풍선 (칸 좌표) */
  overlay?: Overlay | null;
  /** 부품 동작 미리보기 (부품 모드). focus = 회전 방향까지 보여 줄 센서 번호 */
  machine?: (MachinePreview & { focus: number[] }) | null;
  /** 밀리초 (반짝임용) */
  time?: number;
}

export interface Overlay {
  glow: { x: number; y: number }[];
  /** 방해되는 칸 (힌트): 빨간 테두리 */
  bad?: { x: number; y: number }[];
  /** side: 빛나는 자리를 가리지 않게 말풍선을 판 한쪽 가장자리로 비켜 세운다 */
  bubble: { text: string; keys: [string, string][]; ax: number; ay: number; below?: boolean; side?: 'left' | 'right'; warn?: boolean } | null;
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
    // 목표가 없는(비워 둘) 통은 흐리게, 목표 통만 또렷하게
    const target = !goal || goal[0]! + goal[1]! > 0;
    ctx.save();
    if (!target) ctx.globalAlpha = 0.38;
    ctx.fillStyle = goal && v.failFlash && !met ? 'rgba(229,72,77,0.45)' : t.bin;
    ctx.strokeStyle = goal && v.bins.length ? (met ? '#53c26b' : '#e5484d') : t.binEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx + 4, by + 6 - bounce, w - 8, BIN_ROWS * s - 10, [4, 4, 14, 14]);
    ctx.fill();
    ctx.stroke();
    const narrow = w < BIN_WIDTH * s;
    ctx.fillStyle = t.text;
    ctx.font = '11px system-ui, sans-serif';
    if (!narrow) ctx.fillText(goal ? (target ? '목표' : '비워 둠') : `통 ${i}`, bx + w / 2, by + 18 - bounce);
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
    ctx.restore();
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
  if (v.machine) drawMachine(ctx, v.machine);
  if (v.overlay) drawOverlay(ctx, t, v.overlay, board, v.time ?? 0);

  // 햄스터
  if (v.hamster) {
    const hx = (v.hamster.x + 0.5) * s + v.hamster.shake;
    const hy = OY + (v.hamster.y + 0.5) * s;
    drawHamster(ctx, t, hx, hy, s, v.hamster.color, v.hamster.squash ?? 0, v.hamster.tilt ?? 0, v.hamster.mood ?? 'roll');
    if (v.hamster.question) {
      // 갸웃: 물음표 말풍선
      ctx.fillStyle = '#fff7e2';
      ctx.strokeStyle = '#e0b84a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx + s * 0.42, hy - s * 0.55, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a2116';
      ctx.font = `bold ${Math.round(s * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', hx + s * 0.42, hy - s * 0.53);
    }
  }
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * 부품 동작 미리보기: 맞물린 칸은 노란 선, 센서→모터는 하늘색 점선, 센서 번호 동그라미,
 * 스위치 옆에 "센서 번호 → 미는 쪽". focus 센서는 도는 칸마다 ↻ / ↺.
 */
export function drawMachine(ctx: CanvasRenderingContext2D, m: MachinePreview & { focus: number[] }) {
  const s = CELL;
  const OY = TOP * s;
  const cx = (x: number) => x * s + s / 2;
  const cy = (y: number) => OY + y * s + s / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,210,90,0.75)';
  ctx.lineWidth = 4;
  for (const [a, b] of m.meshes) {
    ctx.beginPath();
    ctx.moveTo(cx(a.x), cy(a.y));
    ctx.lineTo(cx(b.x), cy(b.y));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,210,255,0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  for (const sn of m.sensors)
    for (const mo of sn.motors) {
      ctx.beginPath();
      ctx.moveTo(cx(sn.x), cy(sn.y));
      ctx.lineTo(cx(mo.x), cy(mo.y));
      ctx.stroke();
    }
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 회전 방향 (focus 센서)
  ctx.font = 'bold 18px system-ui, sans-serif';
  for (const sn of m.sensors) {
    if (!m.focus.includes(sn.n)) continue;
    for (const tn of sn.turns) {
      ctx.fillStyle = 'rgba(20,24,32,0.75)';
      ctx.beginPath();
      ctx.arc(cx(tn.x) + s * 0.28, cy(tn.y) - s * 0.28, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tn.dir === 1 ? '#ffe14a' : '#9be7ff';
      ctx.fillText(tn.dir === 1 ? '↻' : '↺', cx(tn.x) + s * 0.28, cy(tn.y) - s * 0.28);
    }
  }
  // 센서 번호
  ctx.font = 'bold 11px system-ui, sans-serif';
  for (const sn of m.sensors) {
    const x = sn.x * s + 9;
    const y = OY + sn.y * s + 9;
    ctx.fillStyle = m.focus.includes(sn.n) ? '#ffe14a' : '#78d2ff';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10131a';
    ctx.fillText(String(sn.n), x, y + 0.5);
  }
  // 스위치 옆: 센서 번호 → 미는 쪽
  const chips = new Map<string, string[]>();
  for (const sn of m.sensors)
    for (const sw of sn.switches) {
      const k = `${sw.x},${sw.y}`;
      if (!chips.has(k)) chips.set(k, []);
      chips.get(k)!.push(`${sn.n}→${sw.push}`);
    }
  ctx.font = 'bold 11px system-ui, sans-serif';
  for (const [k, list] of chips) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    list.forEach((txt, i) => {
      const w = ctx.measureText(txt).width + 8;
      const bx = x * s + s - w - 1;
      const by = OY + y * s + s - 15 - i * 15;
      ctx.fillStyle = 'rgba(16,19,26,0.85)';
      ctx.beginPath();
      ctx.roundRect(bx, by, w, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, bx + w / 2, by + 7.5);
    });
  }
  ctx.restore();
}

/** 글자를 투명 튜브처럼 (타이틀 로고): 유리 벽 + 어두운 속 + 안을 흐르는 노란 빛 + 하이라이트 */
export function tubeText(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, size: number, time: number) {
  ctx.save();
  ctx.font = `${size}px 'Jua', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = size * 0.26;
  ctx.strokeText(txt, x + 3, y + 5);
  ctx.strokeStyle = 'rgba(220,240,255,0.55)';
  ctx.lineWidth = size * 0.24;
  ctx.strokeText(txt, x, y);
  ctx.strokeStyle = '#1a2230';
  ctx.lineWidth = size * 0.16;
  ctx.strokeText(txt, x, y);
  ctx.strokeStyle = 'rgba(160,210,240,0.30)';
  ctx.strokeText(txt, x, y);
  const w = ctx.measureText(txt).width;
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  const p = (time / 2600) % 1;
  g.addColorStop(Math.max(0, p - 0.08), 'rgba(255,225,74,0)');
  g.addColorStop(p, 'rgba(255,225,74,0.9)');
  g.addColorStop(Math.min(1, p + 0.08), 'rgba(255,225,74,0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = size * 0.07;
  ctx.strokeText(txt, x, y);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.6;
  ctx.strokeText(txt, x - 1.5, y - 2.5);
  ctx.restore();
}

/** 판 위 안내: 빛나는 목표 칸과 말풍선 */
export function drawOverlay(ctx: CanvasRenderingContext2D, t: Theme, o: Overlay, board: Board, time: number) {
  const s = CELL;
  const OY = TOP * s;
  const pulse = 0.5 + 0.5 * Math.sin(time / 220);
  for (const c of o.glow) {
    if (c.y < 0) continue;
    ctx.fillStyle = `rgba(255,225,74,${0.12 + 0.18 * pulse})`;
    ctx.fillRect(c.x * s + 2, OY + c.y * s + 2, s - 4, s - 4);
    ctx.strokeStyle = `rgba(255,225,74,${0.55 + 0.45 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -time / 60;
    ctx.strokeRect(c.x * s + 2, OY + c.y * s + 2, s - 4, s - 4);
    ctx.setLineDash([]);
  }
  for (const c of o.bad ?? []) {
    if (c.y < 0) continue;
    ctx.strokeStyle = `rgba(229,72,77,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x * s + 3, OY + c.y * s + 3, s - 6, s - 6);
  }
  const b = o.bubble;
  if (!b) return;
  const W = board.w * s;
  const H = (board.h + TOP + BIN_ROWS) * s;
  const maxW = b.side ? Math.min(W * 0.6, 300) : Math.min(W - 24, 300);
  ctx.font = 'bold 14px system-ui, sans-serif';
  const lines = wrapText(ctx, b.text, maxW - 20);
  // 키 칩: 크게, 누를 때까지 깜빡. 한 줄에 안 들어가면 줄을 바꾼다
  ctx.font = 'bold 16px system-ui, sans-serif';
  const chips = b.keys.map(([k, what]) => {
    const kw = Math.max(30, ctx.measureText(k).width + 16);
    ctx.font = '13px system-ui, sans-serif';
    const ww = ctx.measureText(what).width;
    ctx.font = 'bold 16px system-ui, sans-serif';
    return { k, what, kw, w: kw + 6 + ww };
  });
  const chipLines: (typeof chips)[] = [];
  for (const c of chips) {
    const cur = chipLines[chipLines.length - 1];
    if (cur && cur.reduce((a, d) => a + d.w + 12, 0) + c.w <= maxW - 20) cur.push(c);
    else chipLines.push([c]);
  }
  const chipRow = Math.max(0, ...chipLines.map((l) => l.reduce((a, c) => a + c.w + 12, 0) - 12));
  ctx.font = 'bold 14px system-ui, sans-serif';
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bw = Math.min(maxW, Math.max(textW, chipRow) + 20);
  const bh = lines.length * 19 + chipLines.length * 34 + (chips.length ? 4 : 0) + 16;
  const ax = b.ax * s;
  const ay = OY + b.ay * s;
  // 기준점 위에 두되, 자리가 없으면 아래
  let by = ay - bh - 16;
  let up = true;
  if (by < 4 || b.below) {
    by = ay + 16;
    up = false;
  }
  by = Math.min(by, H - bh - 4);
  const bx = b.side === 'right' ? W - bw - 6 : b.side === 'left' ? 6 : Math.max(6, Math.min(W - bw - 6, ax - bw / 2));
  // 그림자 + 몸통 + 꼬리
  const bob = Math.sin(time / 300) * 2;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(bx + 2, by + 3, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = b.warn ? '#ffe4e0' : '#fff7e2';
  ctx.strokeStyle = b.warn ? '#e5484d' : '#e0b84a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 12);
  ctx.fill();
  ctx.stroke();
  const tx = Math.max(bx + 14, Math.min(bx + bw - 14, ax));
  ctx.beginPath();
  if (up) {
    ctx.moveTo(tx - 8, by + bh - 1);
    ctx.lineTo(ax, ay - 4);
    ctx.lineTo(tx + 8, by + bh - 1);
  } else {
    ctx.moveTo(tx - 8, by + 1);
    ctx.lineTo(ax, ay + 4);
    ctx.lineTo(tx + 8, by + 1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = b.warn ? '#ffe4e0' : '#fff7e2';
  ctx.fillRect(tx - 7, up ? by + bh - 3 : by + 1, 14, 3);
  // 글
  ctx.fillStyle = '#2a2116';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 14px system-ui, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, bx + 10, by + 9 + i * 19));
  // 키 칩
  const glowK = 0.5 + 0.5 * Math.sin(time / 180);
  chipLines.forEach((row, li) => {
    let cx = bx + 10;
    const cy = by + 9 + lines.length * 19 + 4 + li * 34;
    for (const c of row) {
      // 키보드 키 모양: 아래 두께 + 깜빡이는 노란 테두리
      ctx.fillStyle = '#151820';
      ctx.beginPath();
      ctx.roundRect(cx, cy + 3, c.kw, 26, 6);
      ctx.fill();
      ctx.fillStyle = '#2a2f3c';
      ctx.beginPath();
      ctx.roundRect(cx, cy, c.kw, 26, 6);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,200,40,${0.35 + 0.65 * glowK})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(c.k, cx + c.kw / 2, cy + 13);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#5a4a33';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(c.what, cx + c.kw + 6, cy + 13);
      cx += c.w + 12;
    }
  });
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

// ---------------- 클리어 연출 ----------------

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  kind: 'star' | 'heart';
  color: string;
}

export function burst(cx: number, cy: number, t: number, n = 26): Particle[] {
  const colors = ['#ffe14a', '#ff8fa3', '#9fd8c1', '#a9cdf0', '#f4b9a0'];
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = 2.5 + Math.random() * 4;
    return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: t + i * 12, kind: i % 3 === 0 ? 'heart' : 'star', color: colors[i % colors.length]! };
  });
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
function heart(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.7);
  ctx.bezierCurveTo(-r * 1.2, -r * 0.1, -r * 0.5, -r * 0.9, 0, -r * 0.35);
  ctx.bezierCurveTo(r * 0.5, -r * 0.9, r * 1.2, -r * 0.1, 0, r * 0.7);
  ctx.closePath();
}

/** 별·하트 + '클리어!' 배지. 다 끝났으면 false */
export function drawCelebration(ctx: CanvasRenderingContext2D, ps: Particle[], t0: number, t: number, w: number, h: number): boolean {
  const life = 1600;
  let alive = false;
  for (const p of ps) {
    const age = t - p.born;
    if (age < 0 || age > life) continue;
    alive = true;
    const k = age / 16;
    const x = p.x + p.vx * k;
    const y = p.y + p.vy * k + 0.06 * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(age / 300);
    ctx.globalAlpha = 1 - age / life;
    ctx.fillStyle = p.color;
    p.kind === 'star' ? star(ctx, 7) : heart(ctx, 7);
    ctx.fill();
    ctx.restore();
  }
  const age = t - t0;
  if (age < 2600) {
    alive = true;
    const pop = age < 250 ? 0.6 + 0.4 * Math.sin((age / 250) * Math.PI * 0.5) * 1.15 : 1;
    ctx.save();
    ctx.translate(w / 2, h * 0.32);
    ctx.scale(pop, pop);
    ctx.globalAlpha = age > 2200 ? 1 - (age - 2200) / 400 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.roundRect(-92, -26, 188, 56, 18);
    ctx.fill();
    ctx.fillStyle = '#ffe14a';
    ctx.strokeStyle = '#7a5a10';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-94, -30, 188, 56, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2a08';
    ctx.font = `30px 'Jua', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('클리어!', 0, 0);
    ctx.restore();
  }
  return alive;
}
