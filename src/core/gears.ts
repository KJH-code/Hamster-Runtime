/**
 * 기어 시뮬레이션. 순수 로직 (보드·Canvas 모름).
 * 노드 = 기어 계열 칸(기어, 모터, 스위치 칸). adj[i] = 맞물린 노드 목록.
 * 맞물린 기어는 반대 방향으로 돈다 → 연결 요소를 2색으로 칠한 패리티로 방향을 정한다.
 * 홀수 길이 고리가 있는 연결 요소는 영구 잠김 (일반 그래프에서만 발생 가능. 격자 4방향에서는 불가).
 */
import { SWITCH_STATES, type Dir, type SwitchState } from './types';

export interface GearSystem {
  n: number;
  adj: number[][];
  /** 노드 → 연결 요소 번호 */
  comp: number[];
  compCount: number;
  /** 노드 → 요소 안에서의 색(0/1). 이웃과 항상 다르다 (홀수 고리 요소는 무의미) */
  color: number[];
  /** 요소별: 홀수 고리 포함 → 영구 잠김 */
  odd: boolean[];
}

export function analyze(adj: number[][]): GearSystem {
  const n = adj.length;
  const comp = new Array<number>(n).fill(-1);
  const color = new Array<number>(n).fill(0);
  const odd: boolean[] = [];
  let compCount = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    let isOdd = false;
    comp[s] = compCount;
    color[s] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]!;
      for (const v of adj[u]!) {
        if (comp[v] === -1) {
          comp[v] = compCount;
          color[v] = 1 - color[u]!;
          queue.push(v);
        } else if (color[v] === color[u]) {
          isOdd = true;
        }
      }
    }
    odd.push(isOdd);
    compCount++;
  }
  return { n, adj, comp, compCount, color, odd };
}

export interface DriveResult {
  /** 이번 구동으로 실제로 도는 노드와 방향 */
  dirs: Map<number, Dir>;
  /** 갱신된 스위치 상태 (입력 복사본) */
  switches: Map<number, SwitchState>;
  /** 갱신된 잠긴 연결 요소 (입력 복사본, 홀수 고리 요소 포함하지 않음 — isLocked 로 같이 본다) */
  locked: Set<number>;
  /** 이번에 새로 잠긴 요소 */
  newlyLocked: number[];
  /** 이번에 상태가 바뀐 스위치 노드 */
  flipped: number[];
}

export function isLocked(sys: GearSystem, locked: Set<number>, node: number): boolean {
  const c = sys.comp[node]!;
  return sys.odd[c]! || locked.has(c);
}

/**
 * drives: 구동되는 노드(모터) → 그 모터의 방향.
 * switches: 스위치 노드 → 현재 상태.
 * 규칙:
 *  - 같은 연결 요소를 서로 반대 방향으로 동시에 구동하면 그 요소가 잠긴다 (같은 방향이면 허용)
 *  - 스위치(ㄱ자 관): 시계 = A→B, 반시계 = B→A. 끝 상태에서 같은 방향이면 회전 거부 → 요소 전체 잠김,
 *    그 구동으로 그 요소의 어떤 스위치도 바뀌지 않는다
 *  - 이미 잠긴 요소는 아무 일도 일어나지 않는다
 */
export function drive(
  sys: GearSystem,
  drives: Map<number, Dir>,
  switches: Map<number, SwitchState>,
  locked: Set<number>,
): DriveResult {
  const outSwitches = new Map(switches);
  const outLocked = new Set(locked);
  const dirs = new Map<number, Dir>();
  const newlyLocked: number[] = [];
  const flipped: number[] = [];

  const byComp = new Map<number, [number, Dir][]>();
  for (const [node, d] of drives) {
    const c = sys.comp[node]!;
    if (!byComp.has(c)) byComp.set(c, []);
    byComp.get(c)!.push([node, d]);
  }

  for (const [c, ds] of byComp) {
    if (sys.odd[c] || locked.has(c)) continue;
    // 첫 구동자를 기준으로 각 노드의 방향을 패리티로 정한다
    const [n0, d0] = ds[0]!;
    const dirOf = (node: number): Dir => (sys.color[node] === sys.color[n0] ? d0 : ((-d0) as Dir));
    // 다른 구동자가 기준과 모순되면 잠김
    const conflict = ds.some(([node, d]) => dirOf(node) !== d);
    if (conflict) {
      outLocked.add(c);
      newlyLocked.push(c);
      continue;
    }
    // 스위치 회전 시도
    const compSwitches: number[] = [];
    for (const node of switches.keys()) if (sys.comp[node] === c) compSwitches.push(node);
    let rejected = false;
    const nextState = (node: number): SwitchState | null => {
      const k = SWITCH_STATES.indexOf(switches.get(node)!) + dirOf(node);
      return k < 0 || k >= SWITCH_STATES.length ? null : SWITCH_STATES[k]!;
    };
    for (const node of compSwitches) if (nextState(node) === null) rejected = true;
    if (rejected) {
      outLocked.add(c);
      newlyLocked.push(c);
      continue;
    }
    for (const node of compSwitches) {
      outSwitches.set(node, nextState(node)!);
      flipped.push(node);
    }
    for (let node = 0; node < sys.n; node++) if (sys.comp[node] === c) dirs.set(node, dirOf(node));
  }
  return { dirs, switches: outSwitches, locked: outLocked, newlyLocked, flipped };
}

/** 격자 칸 목록(4방향 인접)으로 인접 리스트를 만든다 */
export function gridAdjacency(cells: { x: number; y: number }[]): number[][] {
  const index = new Map<string, number>();
  cells.forEach((c, i) => index.set(`${c.x},${c.y}`, i));
  return cells.map((c) => {
    const out: number[] = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const j = index.get(`${c.x + dx},${c.y + dy}`);
      if (j !== undefined) out.push(j);
    }
    return out;
  });
}
