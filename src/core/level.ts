/**
 * 레벨 형식과 채점. 순수 로직.
 *
 * 케이스 = 시작 스위치 상태 + 햄스터 순서열.
 *  - 같은 케이스 안에서는 스위치·잠김 상태가 다음 햄스터로 이어진다
 *  - 케이스가 바뀌면 판의 시작 상태로 초기화
 *  - 햄스터마다 기대값: 통 번호 또는 실패 종류
 * 모든 케이스의 모든 햄스터가 기대대로면 클리어.
 */
import { Board } from './board';
import { Simulation, type Inject, type Status } from './hamster';
import { srsPiece } from './srs';
import { findDef } from './board';
import type { SwitchState } from './types';
import { MINOS, type MinoDef } from '../data/minos';

export type FailKind = 'dead' | 'crashed' | 'out' | 'loop' | 'any';
export type Expect = { bin: number } | { fail: FailKind };

export interface LevelHamster {
  inject: Inject;
  expect: Expect;
}

export interface LevelCase {
  /** 결과표에 보일 이름 */
  name: string;
  /** 레벨 고정 스위치의 시작 상태. 좌표 = 판 칸 */
  switches?: { x: number; y: number; state: SwitchState }[];
  hamsters: LevelHamster[];
}

export interface FixedPiece {
  defId: string;
  /** SRS 상태(0~3)와 상자 좌상단 좌표 — 중력과 무관하게 그 자리에 놓인다 */
  r: number;
  x: number;
  y: number;
}

export interface Level {
  id: string;
  title: string;
  /** 플레이어에게 보이는 설명. 필요한 수치는 숨기지 말고 적는다 */
  description: string;
  width: number;
  height: number;
  /** 미노 id → 개수. 순서는 플레이어가 고른다 */
  supply: Record<string, number>;
  fixed: FixedPiece[];
  cases: LevelCase[];
}

/** 레벨의 빈 판(고정 미노만 놓인 상태)을 만든다 */
export function buildLevelBoard(level: Level, defs: MinoDef[] = MINOS): Board {
  const b = new Board(level.width, level.height);
  for (const f of level.fixed) {
    const cells = srsPiece(findDef(f.defId, defs)).states[f.r]!;
    if (!b.placeCells(f.defId, f.r, cells, f.x, f.y)) throw new Error(`레벨 ${level.id}: 고정 미노 ${f.defId} 를 놓을 수 없다`);
  }
  return b;
}

export interface HamsterResult {
  status: Status;
  bin: number | null;
  ok: boolean;
  expect: Expect;
  inject: Inject;
}
export interface CaseResult {
  name: string;
  ok: boolean;
  hamsters: HamsterResult[];
}

export function matches(e: Expect, status: Status, bin: number | null): boolean {
  if ('bin' in e) return status === 'binned' && bin === e.bin;
  if (status === 'binned') return false;
  return e.fail === 'any' || e.fail === status;
}

/**
 * playerSwitches: 플레이어가 정한 자기 스위치 시작 상태 (키 = 칸 인덱스). 케이스의 switches 가 덮어쓴다.
 */
export function gradeCase(board: Board, c: LevelCase, playerSwitches: Map<number, SwitchState> = new Map()): CaseResult {
  let switches = new Map(playerSwitches);
  for (const s of c.switches ?? []) switches.set(board.idx(s.x, s.y), s.state);
  let locked = new Set<number>();
  const hamsters: HamsterResult[] = [];
  for (const h of c.hamsters) {
    const sim = new Simulation(board, { inject: h.inject, switches, locked });
    const status = sim.run();
    hamsters.push({ status, bin: sim.bin, ok: matches(h.expect, status, sim.bin), expect: h.expect, inject: h.inject });
    // 다음 햄스터로 상태 이어받기
    switches = new Map();
    for (const [node, st] of sim.switches) {
      const p = sim.nodeCells[node]!;
      switches.set(board.idx(p.x, p.y), st);
    }
    locked = new Set(sim.locked);
  }
  return { name: c.name, ok: hamsters.every((h) => h.ok), hamsters };
}

export function gradeLevel(level: Level, board: Board, playerSwitches?: Map<number, SwitchState>): { ok: boolean; cases: CaseResult[] } {
  const cases = level.cases.map((c) => gradeCase(board, c, playerSwitches));
  return { ok: cases.every((c) => c.ok), cases };
}
