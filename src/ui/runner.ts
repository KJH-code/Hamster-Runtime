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
  private anim: { from: { x: number; y: number }; t0: number; dur: number };
  /** 빨리가기 배율 (F): 1, 2, 4 */
  speed = 1;
  /** 연속 낙하 칸 수 (떨어질수록 빨라짐) */
  private fallStreak = 0;
  private finished: { sim: Simulation; color: number; until: number } | null = null;
  private gearAngle = new Map<number, number>();
  private gearTarget = new Map<number, number>();
  private pressedUntil = new Map<string, number>();
  private last: number;
  private binHits = new Map<number, number>();
  private landAt = -1e9;
  private lastMode: 'fall' | 'roll' = 'fall';

  constructor(board: Board, queue: QueueItem[], now: number) {
    this.run = new QueueRun(board, queue.map((q) => ({ ...q })));
    this.nextStepAt = now;
    this.last = now;
    this.anim = { from: { x: this.run.sim?.x ?? 0, y: this.run.sim?.y ?? -1 }, t0: now, dur: STEP_MS };
  }

  /** 한 칸 걸리는 시간: 빨리가기 배율, 낙하 가속 */
  private stepMs(sim: Simulation | null): number {
    const base = STEP_MS / this.speed;
    return sim && sim.mode === 'fall' ? base * Math.max(0.35, 1 - 0.16 * this.fallStreak) : base;
  }

  /** 지금 그려지는 위치 (애니메이션 중간 포함) */
  private shownPos(t: number): { x: number; y: number } {
    const shown = this.finished?.sim ?? this.run.sim;
    if (!shown) return this.anim.from;
    const e = Math.min(1, (t - this.anim.t0) / this.anim.dur);
    return { x: this.anim.from.x + (shown.x - this.anim.from.x) * e, y: this.anim.from.y + (shown.y - this.anim.from.y) * e };
  }

  /** 프레임마다. 한 마리가 끝났으면 그 결과(순번 포함)를 돌려준다 */
  frame(t: number): { n: number; status: Status; bin: number | null } | null {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    let out: { n: number; status: Status; bin: number | null } | null = null;
    const r = this.run;
    if (this.running && !r.done && t >= this.nextStepAt) {
      const before = r.sim!;
      // 이어서 움직이도록: 지금 그려진 위치에서 출발 (칸 단위로 뚝뚝 끊기지 않게)
      const from = this.finished ? { x: before.x, y: before.y } : this.shownPos(t);
      this.fallStreak = before.mode === 'fall' ? this.fallStreak + 1 : 0;
      const dur = this.stepMs(before);
      this.nextStepAt = t + dur;
      const res = r.step();
      for (const s of before.lastTriggered) this.pressedUntil.set(`${s.x},${s.y}`, t + 400);
      if (before.lastDrive)
        for (const [node, dir] of before.lastDrive.dirs) this.gearTarget.set(node, (this.gearTarget.get(node) ?? 0) + dir * (Math.PI / 4));
      this.anim = { from, t0: t, dur };
      // 튜브에 막 들어간 순간 = 착지 (찌그러짐)
      if (r.sim === before && before.mode === 'roll' && this.lastMode === 'fall') this.landAt = t;
      this.lastMode = r.sim === before ? before.mode : 'fall';
      if (res) {
        if (res.status === 'binned' && res.bin !== null) this.binHits.set(res.bin, t);
        const pause = 700 / this.speed;
        this.finished = { sim: before, color: r.queue[r.results.length - 1]!.color, until: t + pause };
        this.nextStepAt = t + pause;
        this.fallStreak = 0;
        out = { n: r.results.length, ...res };
      }
      if (r.done) this.running = false;
    }
    if (this.finished && t >= this.finished.until && !r.done) {
      this.finished = null;
      if (r.sim) this.anim = { from: { x: r.sim.x, y: r.sim.y }, t0: t, dur: this.stepMs(r.sim) };
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
    const e = Math.min(1, (t - this.anim.t0) / this.anim.dur);
    const color = this.finished ? this.finished.color : r.queue[Math.min(r.index, r.queue.length - 1)]!.color;
    const visible = shown.status === 'running' || this.finished !== null || r.loop;
    if (!visible) return null;
    const stuck = shown.status === 'crashed' || shown.status === 'dead' || shown.status === 'junction' || shown.status === 'out';
    // 떨어질 때는 길쭉, 착지 직후엔 납작
    const land = (t - this.landAt) / 220;
    const falling = shown.status === 'running' && shown.mode === 'fall';
    const squash = falling ? -0.06 - 0.03 * Math.min(4, this.fallStreak) : land < 1 ? 0.18 * (1 - land) : 0;
    // 굴러가는 느낌: 가는 쪽으로 살짝 기울고, 구르는 동안 몸이 흔들림
    const dx = shown.x - this.anim.from.x;
    const moving = e < 1 && !stuck && !falling;
    const tilt = moving ? Math.sign(dx) * 0.22 + Math.sin(t / 55) * 0.12 : 0;
    const endY = shown.status === 'binned' ? boardH + 0.3 : shown.y;
    return {
      x: this.anim.from.x + (shown.x - this.anim.from.x) * e,
      y: this.anim.from.y + (endY - this.anim.from.y) * e,
      color,
      shake: stuck ? Math.sin(t / 25) * 3 : 0,
      squash,
      tilt,
      question: stuck,
    };
  }

  /** 통마다 통통 튀는 정도 (0~1) */
  binBounce(t: number, n: number): number[] {
    return Array.from({ length: n }, (_, i) => {
      const d = (t - (this.binHits.get(i) ?? -1e9)) / 450;
      return d >= 0 && d < 1 ? Math.sin(d * Math.PI) * (1 - d) : 0;
    });
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
  keyUp?(e: KeyboardEvent): void;
  dispose(): void;
}

/** 판 아래 '지금 쓸 키' 줄 */
export function renderHints(box: HTMLElement, pairs: [string, string][]) {
  box.innerHTML = '';
  for (const [k, what] of pairs) {
    const chip = el('span', 'hint');
    chip.append(el('kbd', '', k), el('span', '', what));
    box.append(chip);
  }
}

/** 풀이 공유 링크 */
export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}#s=${code}`;
}

/** 클립보드에 복사. 막혀 있으면 링크가 선택된 입력 창을 띄워 Ctrl+C 로 복사하게 한다 */
export async function copyLink(url: string): Promise<'copied' | 'prompt'> {
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    window.prompt('이 링크를 복사하세요 (Ctrl+C)', url);
    return 'prompt';
  }
}

/**
 * 판 캔버스를 창 크기에 맞춰 키운다. 그림은 논리 좌표(칸 40) 그대로, 배율만 바꾼다.
 * 세로는 창 높이에서 위아래 안내 줄 자리를 빼고, 가로는 오른쪽 패널 자리를 뺀다.
 */
export function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, column?: HTMLElement): CanvasRenderingContext2D {
  const reserveH = 200; // 모드 줄 + 키 안내 + 상태 줄 + 여백
  const reserveW = 420; // 오른쪽 패널 + 간격
  const k = Math.max(0.75, Math.min(1.8, (window.innerHeight - reserveH) / h, (window.innerWidth - reserveW) / w));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * k * dpr);
  canvas.height = Math.round(h * k * dpr);
  canvas.style.width = `${w * k}px`;
  canvas.style.height = `${h * k}px`;
  canvas.style.maxWidth = 'none';
  canvas.style.aspectRatio = '';
  if (column) column.style.width = `${Math.max(w * k, 360)}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  return ctx;
}
