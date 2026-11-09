/**
 * 부품 동작 미리보기. 순수 로직 (판만 보고 계산, 햄스터는 굴리지 않는다).
 * - 센서마다 번호, 붙은 모터
 * - 맞물린 기어 계열 칸 쌍 (기어·모터·스위치)
 * - 센서를 지나갈 때: 도는 칸과 방향, 스위치를 어느 쪽(A/B)으로 미는지 (시계 = B 쪽, 반시계 = A 쪽).
 *   이미 그쪽이면 실제로는 회전이 거부되고 잠긴다 (그건 그때 스위치 상태에 달려서 여기서는 방향만)
 * - 한 센서가 같은 기어 줄을 서로 반대로 돌리면 잠김 (locks)
 * 방향 규칙은 hamster.ts 와 같은 drive() 를 쓴다.
 */
import type { Board } from './board';
import { analyze, drive, gridAdjacency } from './gears';
import { SIDE_LIST, sideDelta, type Dir, type SwitchState } from './types';

const GEARISH = new Set(['gear', 'motor', 'switch']);

export interface SensorPreview {
  x: number;
  y: number;
  /** 화면에 붙일 번호 (1부터, 위→아래, 왼→오른 순) */
  n: number;
  motors: { x: number; y: number }[];
  /** 이 센서로 도는 칸과 방향 (1 = 시계) */
  turns: { x: number; y: number; dir: Dir }[];
  /** 스위치를 미는 쪽 (시작 상태 start 와 같으면 그 상태에서는 잠긴다) */
  switches: { x: number; y: number; start: SwitchState; push: SwitchState }[];
  /** 모터끼리 같은 줄을 반대로 돌려 잠기는가 */
  locks: boolean;
}

export interface MachinePreview {
  sensors: SensorPreview[];
  /** 맞물린 칸 쌍 */
  meshes: [{ x: number; y: number }, { x: number; y: number }][];
}

export function machinePreview(board: Board): MachinePreview {
  const cells: { x: number; y: number }[] = [];
  const nodeOf = new Map<string, number>();
  const sensors: { x: number; y: number }[] = [];
  for (let y = 0; y < board.h; y++)
    for (let x = 0; x < board.w; x++) {
      const p = board.partAt(x, y);
      if (!p) continue;
      if (GEARISH.has(p.type)) {
        nodeOf.set(`${x},${y}`, cells.length);
        cells.push({ x, y });
      }
      if (p.type === 'sensor') sensors.push({ x, y });
    }
  const sys = analyze(gridAdjacency(cells));
  const meshes: MachinePreview['meshes'] = [];
  sys.adj.forEach((ns, i) => ns.forEach((j) => i < j && meshes.push([cells[i]!, cells[j]!])));
  const start = new Map<number, SwitchState>();
  const noSwitches = new Map<number, SwitchState>();
  cells.forEach((c, i) => {
    const p = board.partAt(c.x, c.y)!;
    if (p.type === 'switch') start.set(i, p.start ?? 'A');
  });

  const out: SensorPreview[] = sensors.map((s, k) => {
    const motors: { x: number; y: number }[] = [];
    const drives = new Map<number, Dir>();
    for (const side of SIDE_LIST) {
      const [dx, dy] = sideDelta(side);
      const p = board.partAt(s.x + dx, s.y + dy);
      if (p?.type !== 'motor') continue;
      motors.push({ x: s.x + dx, y: s.y + dy });
      drives.set(nodeOf.get(`${s.x + dx},${s.y + dy}`)!, p.dir!);
    }
    // 스위치 상태와 상관없는 회전 방향만 본다 (스위치 없이 구동)
    const r = drive(sys, drives, noSwitches, new Set());
    const turns = [...r.dirs].map(([node, dir]) => ({ ...cells[node]!, dir }));
    const switches: SensorPreview['switches'] = [];
    for (const [node, st] of start) {
      const d = r.dirs.get(node);
      if (d !== undefined) switches.push({ ...cells[node]!, start: st, push: d === 1 ? 'B' : 'A' });
    }
    return { ...s, n: k + 1, motors, turns, switches, locks: r.newlyLocked.length > 0 };
  });
  return { sensors: out, meshes };
}
