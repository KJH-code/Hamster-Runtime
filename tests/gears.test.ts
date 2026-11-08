import { describe, expect, it } from 'vitest';
import { analyze, drive, gridAdjacency, isLocked } from '../src/core/gears';
import type { Dir, SwitchState } from '../src/core/types';

// 가로 일렬 n칸 기어 줄: 노드 i 는 (i,0)
const line = (n: number) => analyze(gridAdjacency(Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }))));
const D = (...e: [number, Dir][]) => new Map<number, Dir>(e);
const noSw = new Map<number, SwitchState>();
const none = new Set<number>();
const dirsArr = (m: Map<number, Dir>, n: number) => Array.from({ length: n }, (_, i) => m.get(i) ?? 0);

describe('기어 패리티 (1/2/3개 줄)', () => {
  it('1개: 모터 혼자 자기 방향', () => {
    expect(dirsArr(drive(line(1), D([0, 1]), noSw, none).dirs, 1)).toEqual([1]);
  });
  it('2개: 끝 모터 시계 → [시계, 반시계]', () => {
    expect(dirsArr(drive(line(2), D([0, 1]), noSw, none).dirs, 2)).toEqual([1, -1]);
  });
  it('3개: 끝 모터 시계 → [시계, 반시계, 시계]', () => {
    expect(dirsArr(drive(line(3), D([0, 1]), noSw, none).dirs, 3)).toEqual([1, -1, 1]);
  });
  it('3개: 가운데 모터 반시계 → [시계, 반시계, 시계]', () => {
    expect(dirsArr(drive(line(3), D([1, -1]), noSw, none).dirs, 3)).toEqual([1, -1, 1]);
  });
  it('떨어진 두 줄은 서로 영향 없음', () => {
    const sys = analyze(gridAdjacency([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }]));
    expect(dirsArr(drive(sys, D([0, 1]), noSw, none).dirs, 4)).toEqual([1, -1, 0, 0]);
  });
});

describe('스위치 A/B 전환', () => {
  // 노드: 0 모터 - 1 기어 - 2 스위치 (0과 2는 같은 방향)
  const sys = line(3);
  it('시계 → A에서 B', () => {
    const r = drive(sys, D([0, 1]), new Map([[2, 'A' as SwitchState]]), none);
    expect(r.switches.get(2)).toBe('B');
    expect(r.flipped).toEqual([2]);
    expect(r.newlyLocked).toEqual([]);
  });
  it('반시계 → B에서 A', () => {
    const r = drive(sys, D([0, -1]), new Map([[2, 'B' as SwitchState]]), none);
    expect(r.switches.get(2)).toBe('A');
  });
  it('모터가 반대 쪽 기어를 돌려 스위치 방향이 뒤집히면 반대로 전환', () => {
    // 스위치가 1번(모터와 이웃)이면 방향이 반대
    const r = drive(sys, D([0, 1]), new Map([[1, 'B' as SwitchState]]), none);
    expect(r.switches.get(1)).toBe('A'); // 스위치는 반시계로 돎 → B→A
  });
});

describe('회전 거부와 잠김', () => {
  const sys = line(3);
  it('이미 B인데 시계 → 거부, 연결 요소 전체 잠김, 스위치는 그대로', () => {
    const r = drive(sys, D([0, 1]), new Map([[2, 'B' as SwitchState]]), none);
    expect(r.switches.get(2)).toBe('B');
    expect(r.newlyLocked).toEqual([0]);
    for (let i = 0; i < 3; i++) expect(isLocked(sys, r.locked, i)).toBe(true);
    expect(r.dirs.size).toBe(0);
  });
  it('잠긴 뒤에는 반대 방향으로 돌려도 아무 일 없음', () => {
    const first = drive(sys, D([0, 1]), new Map([[2, 'B' as SwitchState]]), none);
    const second = drive(sys, D([0, -1]), first.switches, first.locked);
    expect(second.switches.get(2)).toBe('B');
    expect(second.dirs.size).toBe(0);
  });
  it('다른 연결 요소는 잠기지 않는다', () => {
    const two = analyze(gridAdjacency([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }]));
    const r = drive(two, D([0, 1]), new Map([[1, 'A' as SwitchState]]), none);
    // 노드1은 반시계로 돎 → A에서 반시계 = 거부
    expect(isLocked(two, r.locked, 0)).toBe(true);
    expect(isLocked(two, r.locked, 2)).toBe(false);
    expect(isLocked(two, r.locked, 3)).toBe(false);
  });
  it('한 요소의 스위치 하나가 거부되면 다른 스위치도 바뀌지 않는다', () => {
    // 노드 0 모터(시계), 노드 2 스위치(시계 → A→B 가능), 노드 4 스위치(시계, 이미 B → 거부)
    const s5 = line(5);
    const r = drive(s5, D([0, 1]), new Map<number, SwitchState>([[2, 'A'], [4, 'B']]), none);
    expect(r.switches.get(2)).toBe('A');
    expect(r.switches.get(4)).toBe('B');
    expect(isLocked(s5, r.locked, 1)).toBe(true);
  });
});

describe('두 모터 동시 구동', () => {
  it('같은 요소를 모순되게 구동하면 잠김', () => {
    const sys = line(3); // 0과 2는 같은 패리티 → 시계/반시계는 모순
    const r = drive(sys, D([0, 1], [2, -1]), noSw, none);
    expect(r.newlyLocked).toEqual([0]);
    expect(r.dirs.size).toBe(0);
  });
  it('모순 없이 같은 방향이면 허용', () => {
    const sys = line(3);
    const r = drive(sys, D([0, 1], [2, 1]), noSw, none);
    expect(dirsArr(r.dirs, 3)).toEqual([1, -1, 1]);
    expect(r.newlyLocked).toEqual([]);
  });
  it('이웃한 두 모터가 맞물림과 일치하는 방향(시계/반시계)이면 허용', () => {
    const r = drive(line(2), D([0, 1], [1, -1]), noSw, none);
    expect(dirsArr(r.dirs, 2)).toEqual([1, -1]);
  });
  it('이웃한 두 모터가 둘 다 시계면 맞물림과 모순이라 잠김', () => {
    expect(drive(line(2), D([0, 1], [1, 1]), noSw, none).newlyLocked).toEqual([0]);
  });
});

describe('홀수 고리', () => {
  // 인접 리스트로 직접 만든 삼각형 (격자에서는 만들 수 없다)
  const tri = analyze([[1, 2], [0, 2], [0, 1]]);
  it('삼각형은 영구 잠김으로 판정', () => {
    expect(tri.odd[0]).toBe(true);
    for (let i = 0; i < 3; i++) expect(isLocked(tri, none, i)).toBe(true);
  });
  it('구동해도 아무것도 돌지 않고 스위치도 안 바뀐다', () => {
    const r = drive(tri, D([0, 1]), new Map<number, SwitchState>([[1, 'A']]), none);
    expect(r.dirs.size).toBe(0);
    expect(r.switches.get(1)).toBe('A');
  });
  it('짝수 고리(사각형)는 잠기지 않는다', () => {
    const sq = analyze([[1, 3], [0, 2], [1, 3], [0, 2]]);
    expect(sq.odd[0]).toBe(false);
    expect(dirsArr(drive(sq, D([0, 1]), noSw, none).dirs, 4)).toEqual([1, -1, 1, -1]);
  });
  it('격자 4방향 인접으로는 2×2 O-기어도 잠기지 않는다', () => {
    const o = analyze(gridAdjacency([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]));
    expect(o.odd[0]).toBe(false);
  });
});
