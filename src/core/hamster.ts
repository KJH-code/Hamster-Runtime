/**
 * 햄스터 시뮬레이션. 순수 로직 (렌더링 무관). step() 한 번 = 한 칸 이동.
 *
 * 규칙 요약
 *  - 튜브 안: 스스로 굴러 열린 변 쪽으로 이동 (수평·위·아래 모두)
 *  - 튜브 밖(빈 칸)으로 나가면 수직 낙하. 바로 아래가 위로 열린 튜브 칸이면 받아서 계속 간다
 *  - 낙하 중 빈칸(판의 빈 자리, 미노의 빈칸 요소)은 통과, 그 밖의 칸에 닿으면 튕김 → 실패
 *  - 막다른 길이면 멈춤 = 실패. 판 맨 아래를 넘으면 해당 통에 기록
 *  - 센서 칸에 들어가면 인접(상하좌우) 모터가 자기 방향으로 구동
 *  - (위치, 모드·진행 방향, 모든 스위치 상태[, 잠금])가 반복되면 루프
 */
import { Board } from './board';
import { analyze, drive, gridAdjacency, isLocked, type DriveResult, type GearSystem } from './gears';
import {
  BIN_COUNT,
  BIN_WIDTH,
  Cell,
  Dir,
  E,
  isGearLike,
  isTubeLike,
  N,
  opposite,
  S,
  Sides,
  sideDelta,
  SwitchState,
  W,
} from './types';

export type Status = 'running' | 'binned' | 'dead' | 'crashed' | 'out' | 'loop';
export type Inject = 'left' | 'right';

export interface SimOptions {
  inject: Inject;
  /** 스위치 시작 상태. 키 = 보드 칸 인덱스(y*w+x). 없으면 A */
  switches?: Map<number, SwitchState>;
  /** 이미 잠긴 연결 요소 번호 (같은 보드에서 다음 햄스터를 넣을 때 상태를 이어받는 용도) */
  locked?: Set<number>;
}

export class Simulation {
  readonly board: Board;
  readonly sys: GearSystem;
  /** 노드 번호 ↔ 보드 칸 */
  readonly nodeCells: { x: number; y: number }[];
  readonly nodeOfCell = new Map<number, number>();
  switches = new Map<number, SwitchState>(); // 키 = 노드 번호
  locked = new Set<number>(); // 잠긴 연결 요소 번호

  x: number;
  y: number;
  mode: 'fall' | 'roll' = 'fall';
  entry: Sides = N; // roll 모드에서 들어온 변
  status: Status = 'running';
  bin: number | null = null;
  steps = 0;
  /** 마지막 step 에서 일어난 일 (UI 표시용) */
  lastDrive: DriveResult | null = null;
  lastTriggered: { x: number; y: number }[] = [];
  bounce: { x: number; y: number } | null = null;
  private seen = new Set<string>();

  constructor(board: Board, opts: SimOptions) {
    this.board = board;
    this.nodeCells = [];
    for (let y = 0; y < board.h; y++)
      for (let x = 0; x < board.w; x++) {
        const c = board.at(x, y);
        if (c && isGearLike(c)) {
          this.nodeOfCell.set(board.idx(x, y), this.nodeCells.length);
          this.nodeCells.push({ x, y });
        }
      }
    this.sys = analyze(gridAdjacency(this.nodeCells));
    this.nodeCells.forEach((p, node) => {
      if (board.at(p.x, p.y)!.kind === 'switch')
        this.switches.set(node, opts.switches?.get(board.idx(p.x, p.y)) ?? 'A');
    });
    if (opts.locked) this.locked = new Set(opts.locked);
    this.x = opts.inject === 'left' ? 0 : board.w - 1;
    this.y = -1; // 판 위에서 수직 낙하 시작
    this.seen.add(this.key());
  }

  private key(): string {
    const sw = Array.from(this.switches.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .join('');
    const lk = Array.from(this.locked).sort((a, b) => a - b).join(',');
    return `${this.x},${this.y},${this.mode},${this.mode === 'roll' ? this.entry : 0},${sw},${lk}`;
  }

  switchStateAt(x: number, y: number): SwitchState | undefined {
    const n = this.nodeOfCell.get(this.board.idx(x, y));
    return n === undefined ? undefined : this.switches.get(n);
  }
  isCellLocked(x: number, y: number): boolean {
    const n = this.nodeOfCell.get(this.board.idx(x, y));
    return n !== undefined && isLocked(this.sys, this.locked, n);
  }

  /** 칸 c 에 side 변으로 들어왔을 때 나가는 변. 없으면 null (막다른 길) */
  private exitFor(c: Cell, entry: Sides, state: SwitchState | undefined): Sides | null {
    if (c.kind === 'switch') {
      const armOpen = state === 'B' ? c.armB! : c.armA!;
      if (entry === c.common) return armOpen;
      if (entry === armOpen) return c.common!;
      return null; // 닫힌 갈래로 들어옴
    }
    for (const s of [N, E, S, W]) if (s !== entry && c.open & s) return s;
    return null;
  }

  private finish(status: Status): void {
    this.status = status;
  }

  private binAt(x: number): void {
    this.bin = Math.min(BIN_COUNT - 1, Math.floor(x / BIN_WIDTH));
    this.finish('binned');
  }

  /** 칸에 들어간 직후 처리: 센서면 인접 모터 구동 */
  private onEnter(x: number, y: number): void {
    const c = this.board.at(x, y)!;
    if (c.kind !== 'sensor') return;
    this.lastTriggered.push({ x, y });
    const drives = new Map<number, Dir>();
    for (const s of [N, E, S, W]) {
      const [dx, dy] = sideDelta(s);
      const m = this.board.at(x + dx, y + dy);
      if (m && m.kind === 'motor') drives.set(this.nodeOfCell.get(this.board.idx(x + dx, y + dy))!, m.dir!);
    }
    if (drives.size === 0) return;
    const r = drive(this.sys, drives, this.switches, this.locked);
    this.switches = r.switches;
    this.locked = r.locked;
    this.lastDrive = r;
  }

  private enterTube(x: number, y: number, entry: Sides): void {
    this.x = x;
    this.y = y;
    this.mode = 'roll';
    this.entry = entry;
    this.onEnter(x, y);
  }

  /** 한 칸 진행 */
  step(): void {
    if (this.status !== 'running') return;
    this.steps++;
    this.lastDrive = null;
    this.lastTriggered = [];
    this.bounce = null;
    const b = this.board;

    if (this.mode === 'fall') {
      const ny = this.y + 1;
      if (ny >= b.h) return this.binAt(this.x);
      const c = b.at(this.x, ny);
      if (!c || c.kind === 'empty') {
        this.y = ny;
      } else if (isTubeLike(c) && c.open & N) {
        this.enterTube(this.x, ny, N);
      } else {
        this.bounce = { x: this.x, y: ny };
        return this.finish('crashed');
      }
    } else {
      const cur = b.at(this.x, this.y)!;
      const exit = this.exitFor(cur, this.entry, this.switchStateAt(this.x, this.y));
      if (exit === null) return this.finish('dead');
      const [dx, dy] = sideDelta(exit);
      const nx = this.x + dx;
      const ny = this.y + dy;
      if (!b.inBounds(nx, ny)) {
        if (exit === S) return this.binAt(this.x);
        return this.finish('out');
      }
      const nc = b.at(nx, ny);
      if (!nc || nc.kind === 'empty') {
        this.x = nx;
        this.y = ny;
        this.mode = 'fall';
      } else if (isTubeLike(nc) && nc.open & opposite(exit)) {
        this.enterTube(nx, ny, opposite(exit));
      } else {
        this.bounce = { x: nx, y: ny };
        return this.finish('crashed');
      }
    }

    const k = this.key();
    if (this.seen.has(k)) return this.finish('loop');
    this.seen.add(k);
  }

  /** 끝날 때까지 실행. 반환: 최종 상태 */
  run(): Status {
    while (this.status === 'running') this.step();
    return this.status;
  }
}
