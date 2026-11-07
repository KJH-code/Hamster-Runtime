/**
 * 대기열 실행 + 애니메이션 상태 (샌드박스·레벨 공용). 실행 로직은 core/hamster.ts 의 QueueRun.
 */
import type { Board } from '../core/board';
import { QueueRun, type QueueItem, type Simulation, type Status } from '../core/hamster';

export const STEP_MS = 150;
export const STATUS_TEXT: Record<Status, string> = {
  running: '이동 중',
  binned: '통',
  dead: '막다른 길 — 멈춤',
  junction: '스위치 없는 분기점 — 멈춤',
  crashed: '튕김 — 멈춤',
  out: '판 밖 — 멈춤',
  loop: '무한 루프',
};

export class Runner {
  readonly run: QueueRun;
  running = true;
  private nextStepAt: number;
  private anim: { from: { x: number; y: number }; t0: number };
  private finished: { sim: Simulation; color: number; until: number } | null = null;
  private gearAngle = new Map<number, number>();
  private gearTarget = new Map<number, number>();
  private pressedUntil = new Map<string, number>();
  private last: number;

  constructor(board: Board, queue: QueueItem[], now: number) {
    this.run = new QueueRun(board, queue.map((q) => ({ ...q })));
    this.nextStepAt = now;
    this.last = now;
    this.anim = { from: { x: this.run.sim?.x ?? 0, y: this.run.sim?.y ?? -1 }, t0: now };
  }

  /** 프레임마다. 한 마리가 끝났으면 그 결과(순번 포함)를 돌려준다 */
  frame(t: number): { n: number; status: Status; bin: number | null } | null {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    let out: { n: number; status: Status; bin: number | null } | null = null;
    const r = this.run;
    if (this.running && !r.done && t >= this.nextStepAt) {
      this.nextStepAt = t + STEP_MS;
      const before = r.sim!;
      const from = { x: before.x, y: before.y };
      const res = r.step();
      for (const s of before.lastTriggered) this.pressedUntil.set(`${s.x},${s.y}`, t + 400);
      if (before.lastDrive)
        for (const [node, dir] of before.lastDrive.dirs) this.gearTarget.set(node, (this.gearTarget.get(node) ?? 0) + dir * (Math.PI / 4));
      this.anim = { from, t0: t };
      if (res) {
        this.finished = { sim: before, color: r.queue[r.results.length - 1]!.color, until: t + 700 };
        this.nextStepAt = t + 700;
        out = { n: r.results.length, ...res };
      }
      if (r.done) this.running = false;
    }
    if (this.finished && t >= this.finished.until && !r.done) {
      this.finished = null;
      if (r.sim) this.anim = { from: { x: r.sim.x, y: r.sim.y }, t0: t };
    }
    for (const [node, target] of this.gearTarget) {
      const cur = this.gearAngle.get(node) ?? 0;
      this.gearAngle.set(node, cur + (target - cur) * (1 - Math.exp(-dt * 14)));
    }
    return out;
  }

  get sim(): Simulation | null {
    return this.run.sim;
  }

  hamster(t: number, boardH: number) {
    const r = this.run;
    const shown = this.finished?.sim ?? r.sim;
    if (!shown) return null;
    const e = Math.min(1, (t - this.anim.t0) / STEP_MS);
    const color = this.finished ? this.finished.color : r.queue[Math.min(r.index, r.queue.length - 1)]!.color;
    const visible = shown.status === 'running' || this.finished !== null || r.loop;
    if (!visible) return null;
    return {
      x: this.anim.from.x + (shown.x - this.anim.from.x) * e,
      y: this.anim.from.y + ((shown.status === 'binned' ? boardH + 0.3 : shown.y) - this.anim.from.y) * e,
      color,
      shake: shown.status === 'crashed' || shown.status === 'dead' || shown.status === 'junction' ? Math.sin(t / 25) * 3 : 0,
    };
  }

  gearAngleAt(board: Board, x: number, y: number): number {
    const n = this.run.sim?.nodeOfCell.get(board.idx(x, y));
    return n === undefined ? 0 : (this.gearAngle.get(n) ?? 0);
  }

  /** 스위치 관이 아직 덜 돈 각도: 기어 한 칸(π/4)마다 관은 90°(π/2) */
  switchTurnAt(board: Board, x: number, y: number): number {
    const n = this.run.sim?.nodeOfCell.get(board.idx(x, y));
    if (n === undefined) return 0;
    return ((this.gearAngle.get(n) ?? 0) - (this.gearTarget.get(n) ?? 0)) * 2;
  }

  pressed(t: number): Set<string> {
    const s = new Set<string>();
    for (const [k, until] of this.pressedUntil) if (until > t) s.add(k);
    return s;
  }
}

export function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 캔버스를 판 크기에 맞춘다 */
export function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.aspectRatio = `${w} / ${h}`;
  canvas.style.maxWidth = `${w}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** 화면 하나: 키 처리기와 정리 함수 */
export interface Screen {
  key(e: KeyboardEvent): void;
  dispose(): void;
}
