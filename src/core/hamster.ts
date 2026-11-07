/**
 * 햄스터 시뮬레이션. 순수 로직 (렌더링 무관). step() 한 번 = 한 칸 이동.
 *
 *  - 튜브 연결(links.ts)을 따라 스스로 굴러감 (수평·위·아래)
 *  - 직진 출구로 튜브 밖에 나가면 수직 낙하. 바로 아래 칸이 위로 열린 입구(직진 출구가 위)면 받아짐
 *  - 낙하 중 판의 빈 자리·부품 없는 빈칸은 통과, 그 밖의 칸에 닿으면 튕김
 *  - 막다른 길, 스위치 없는 분기점 = 멈춤. 판 맨 아래를 넘으면 그 자리 통
 *  - 스위치: 공통 ↔ 열린 갈래만 통함 (양방향). 다른 갈래로 들어오면 막다른 길
 *  - 센서 칸에 들어가면 상하좌우 인접 모터가 자기 방향으로 구동 → 기어 시뮬레이션
 *  - (위치, 모드·진행 방향, 모든 스위치 상태, 잠금)이 반복되면 루프
 */
import { Board } from './board';
import { analyze, drive, gridAdjacency, isLocked, type DriveResult, type GearSystem } from './gears';
import { computeLinks, degree, type Links } from './links';
import { activeArm } from './parts';
import { BIN_WIDTH, binCount, Dir, N, opposite, S, Sides, sideDelta, SIDE_LIST, SwitchState } from './types';

export type Status = 'running' | 'binned' | 'dead' | 'junction' | 'crashed' | 'out' | 'loop';
export type Inject = 'left' | 'right';

export interface SimOptions {
  inject: Inject;
  /** 스위치 상태 (키 = 칸 인덱스). 없으면 부품의 시작 상태 */
  switches?: Map<number, SwitchState>;
  /** 이미 잠긴 연결 요소 (앞 햄스터에게서 이어받기) */
  locked?: Set<number>;
}

const GEARISH = new Set(['gear', 'motor', 'switch']);

export class Simulation {
  readonly board: Board;
  readonly links: Links;
  readonly sys: GearSystem;
  readonly nodeCells: { x: number; y: number }[] = [];
  readonly nodeOfCell = new Map<number, number>();
  switches = new Map<number, SwitchState>(); // 키 = 노드 번호
  locked = new Set<number>();

  x: number;
  y: number;
  mode: 'fall' | 'roll' = 'fall';
  entry: Sides = N;
  status: Status = 'running';
  bin: number | null = null;
  steps = 0;
  lastDrive: DriveResult | null = null;
  lastTriggered: { x: number; y: number }[] = [];
  bounce: { x: number; y: number } | null = null;
  private seen = new Set<string>();

  constructor(board: Board, opts: SimOptions) {
    this.board = board;
    this.links = computeLinks(board);
    for (let y = 0; y < board.h; y++)
      for (let x = 0; x < board.w; x++) {
        const p = board.partAt(x, y);
        if (p && GEARISH.has(p.type)) {
          this.nodeOfCell.set(board.idx(x, y), this.nodeCells.length);
          this.nodeCells.push({ x, y });
        }
      }
    this.sys = analyze(gridAdjacency(this.nodeCells));
    this.nodeCells.forEach((p, node) => {
      const part = board.partAt(p.x, p.y)!;
      if (part.type !== 'switch') return;
      const i = board.idx(p.x, p.y);
      this.switches.set(node, opts.switches?.get(i) ?? part.start ?? 'A');
    });
    if (opts.locked) this.locked = new Set(opts.locked);
    this.x = opts.inject === 'left' ? 0 : board.w - 1;
    this.y = -1;
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
  /** 칸 인덱스 → 스위치 상태 (다음 햄스터에게 넘길 때) */
  switchesByCell(): Map<number, SwitchState> {
    const m = new Map<number, SwitchState>();
    for (const [node, st] of this.switches) {
      const p = this.nodeCells[node]!;
      m.set(this.board.idx(p.x, p.y), st);
    }
    return m;
  }

  private finish(s: Status): void {
    this.status = s;
  }
  private binAt(x: number): void {
    this.bin = Math.min(binCount(this.board.w) - 1, Math.floor(x / BIN_WIDTH));
    this.finish('binned');
  }

  /** 낙하 중 그 칸을 지나갈 수 있는가: 판의 빈 자리, 또는 부품 없는 빈칸 */
  private passable(x: number, y: number): boolean {
    const c = this.board.at(x, y);
    if (!c) return true;
    return c.kind === 'empty' && !this.board.partAt(x, y);
  }

  private onEnter(x: number, y: number): void {
    if (this.board.partAt(x, y)?.type !== 'sensor') return;
    this.lastTriggered.push({ x, y });
    const drives = new Map<number, Dir>();
    for (const s of SIDE_LIST) {
      const [dx, dy] = sideDelta(s);
      const p = this.board.partAt(x + dx, y + dy);
      if (p?.type === 'motor') drives.set(this.nodeOfCell.get(this.board.idx(x + dx, y + dy))!, p.dir!);
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

  /** 지금 칸에서 나갈 변. 멈춰야 하면 Status */
  private exitFor(): Sides | 'dead' | 'junction' {
    const i = this.board.idx(this.x, this.y);
    const part = this.board.parts.get(i);
    if (part?.type === 'switch') {
      const open = activeArm(part, this.switchStateAt(this.x, this.y)!);
      if (this.entry === part.common) return open;
      if (this.entry === open) return part.common!;
      return 'dead';
    }
    if (degree(this.links, i) >= 3) return 'junction';
    const avail = (this.links.link[i]! | this.links.exit[i]!) & ~this.entry;
    for (const s of SIDE_LIST) if (avail & s) return s;
    return 'dead';
  }

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
      if (this.passable(this.x, ny)) {
        this.y = ny;
      } else if (this.links.exit[b.idx(this.x, ny)] === N) {
        this.enterTube(this.x, ny, N);
      } else {
        this.bounce = { x: this.x, y: ny };
        return this.finish('crashed');
      }
    } else {
      const out = this.exitFor();
      if (out === 'dead' || out === 'junction') return this.finish(out);
      const i = b.idx(this.x, this.y);
      const [dx, dy] = sideDelta(out);
      const nx = this.x + dx;
      const ny = this.y + dy;
      if (this.links.link[i]! & out) {
        this.enterTube(nx, ny, opposite(out)); // 연결된 튜브로
      } else if (!b.inBounds(nx, ny)) {
        if (out === S) return this.binAt(this.x);
        return this.finish('out');
      } else if (this.passable(nx, ny)) {
        this.x = nx;
        this.y = ny;
        this.mode = 'fall';
      } else {
        this.bounce = { x: nx, y: ny };
        return this.finish('crashed');
      }
    }
    const k = this.key();
    if (this.seen.has(k)) return this.finish('loop');
    this.seen.add(k);
  }

  run(): Status {
    while (this.status === 'running') this.step();
    return this.status;
  }
}

// ---------------- 대기열 실행 ----------------

export type HamsterColor = 0 | 1;
export interface QueueItem {
  color: HamsterColor;
  inject: Inject;
}
export interface Tally {
  /** bins[통][색] = 마릿수 */
  bins: number[][];
  /** 멈춘(통에 못 들어간) 마릿수 [색] */
  stopped: number[];
}

/**
 * 대기열을 순서대로 한 마리씩. 통에 들어가거나 멈추면 다음 마리.
 * 스위치·잠김 상태는 다음 마리로 이어진다. 루프가 나오면 실행 중단(loop = true).
 */
export class QueueRun {
  readonly board: Board;
  readonly queue: QueueItem[];
  index = 0;
  sim: Simulation | null = null;
  tally: Tally;
  done = false;
  loop = false;
  /** 마리별 결과 */
  results: { status: Status; bin: number | null }[] = [];

  constructor(board: Board, queue: QueueItem[], startSwitches?: Map<number, SwitchState>) {
    this.board = board;
    this.queue = queue;
    this.tally = { bins: Array.from({ length: binCount(board.w) }, () => [0, 0]), stopped: [0, 0] };
    if (queue.length === 0) this.done = true;
    else this.sim = new Simulation(board, { inject: queue[0]!.inject, switches: startSwitches });
  }

  /** 한 칸 진행. 이번 step 에서 한 마리가 끝났으면 그 결과를 돌려준다 */
  step(): { status: Status; bin: number | null } | null {
    if (this.done || !this.sim) return null;
    const sim = this.sim;
    sim.step();
    if (sim.status === 'running') return null;
    const item = this.queue[this.index]!;
    const r = { status: sim.status, bin: sim.bin };
    this.results.push(r);
    if (sim.status === 'loop') {
      this.loop = true;
      this.done = true;
      return r;
    }
    if (sim.status === 'binned') this.tally.bins[sim.bin!]![item.color]!++;
    else this.tally.stopped[item.color]!++;
    this.index++;
    if (this.index >= this.queue.length) {
      this.done = true;
      return r;
    }
    this.sim = new Simulation(this.board, {
      inject: this.queue[this.index]!.inject,
      switches: sim.switchesByCell(),
      locked: sim.locked,
    });
    return r;
  }

  runAll(): void {
    while (!this.done) this.step();
  }
}
