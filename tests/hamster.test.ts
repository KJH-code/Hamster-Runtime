import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { QueueRun, Simulation } from '../src/core/hamster';
import { E, N, type SwitchState } from '../src/core/types';
import { part, put, sw } from './helpers';

/** 열 x 에서 떨어뜨린다 (투입구는 좌/우 끝이지만 테스트 편의로 아무 열) */
function drop(b: Board, x: number, switches?: Map<number, SwitchState>, locked?: Set<number>) {
  const s = new Simulation(b, { inject: 'left', switches, locked });
  s.x = x;
  return s;
}

describe('낙하와 통', () => {
  it('빈 판: 왼쪽 → 통 0, 오른쪽 → 통 4', () => {
    const l = new Simulation(new Board(), { inject: 'left' });
    expect(l.run()).toBe('binned');
    expect(l.bin).toBe(0);
    const r = new Simulation(new Board(), { inject: 'right' });
    r.run();
    expect(r.bin).toBe(4);
  });
  it('세로 I 윗끝(위로 열린 입구)에 떨어지면 받아져 아랫끝으로 나와 낙하', () => {
    const b = new Board();
    put(b, 'I-tube', 0, 4, 5);
    const s = drop(b, 4);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(2);
  });
  it('위가 막힌 튜브(가로 I 중간)에 떨어지면 튕김', () => {
    const b = new Board();
    put(b, 'I-tube', 1, 3, 5); // (3,5)~(6,5)
    const s = drop(b, 4);
    expect(s.run()).toBe('crashed');
    expect(s.bounce).toEqual({ x: 4, y: 5 });
  });
  it('부품 없는 빈칸은 통과, 부품 있는 빈칸은 튕김', () => {
    const b = new Board();
    put(b, 'O-empty', 0, 4, 5);
    expect(drop(b, 4).run()).toBe('binned');
    part(b, 4, 6, { type: 'gear' });
    expect(drop(b, 4).run()).toBe('crashed');
  });
});

describe('튜브 이동', () => {
  it('L: 내려가다 꺾여 오른쪽 끝의 직진 출구로 나가 낙하', () => {
    const b = new Board();
    put(b, 'L-tube', 0, 0, 0); // (0,0)(0,1)(0,2)(1,2), 끝 (1,2) 출구 E
    const s = new Simulation(b, { inject: 'left' });
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(1); // (2,2) 에서 낙하 → 열 2
  });
  it('자동 연결로 미노 두 개를 이어 지나간다 (L 끝 → 세로 I 윗끝)', () => {
    const b = new Board();
    put(b, 'L-tube', 0, 0, 0);
    put(b, 'I-tube', 0, 1, 3); // (1,3)~(1,6) — (1,2) 아래 붙음
    const s = new Simulation(b, { inject: 'left' });
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(0); // (1,7) 낙하 → 열 1 → 통 0
  });
  it('U자: 위로 다시 올라가 출구로 나간다 (위로 굴러감)', () => {
    const b = new Board();
    put(b, 'O-tube', 0, 0, 5); // 1(0,5) 2(0,6) 3(1,6) 4(1,5)
    const s = new Simulation(b, { inject: 'left' });
    // (1,5) 위로 나가 (1,4) 에서 떨어지면 다시 (1,5) 입구로 → 루프
    expect(s.run()).toBe('loop');
  });
  it('마개로 막힌 끝 = 막다른 길 멈춤', () => {
    const b = new Board();
    put(b, 'I-tube', 0, 0, 0);
    part(b, 0, 3, { type: 'plug' });
    const s = new Simulation(b, { inject: 'left' });
    expect(s.run()).toBe('dead');
    expect([s.x, s.y]).toEqual([0, 3]);
  });
});

describe('분기점과 스위치', () => {
  // 세로 I (5,0)~(5,3), 왼쪽 가로 (1..4,3), 오른쪽 가로 (6..9,3). (5,3) = 3갈래. 판 12×8
  // 왼쪽 끝 (1,3) 출구 W → 열 0 낙하 = 통 0, 오른쪽 끝 (9,3) 출구 E → 열 10 낙하 = 통 5
  const three = () => {
    const b = new Board(12, 8);
    put(b, 'I-tube', 0, 5, 0);
    put(b, 'I-tube', 1, 1, 3);
    put(b, 'I-tube', 1, 6, 3);
    return b;
  };
  it('스위치 없는 분기점에 오면 멈춤', () => {
    const s = drop(three(), 5);
    expect(s.run()).toBe('junction');
    expect([s.x, s.y]).toEqual([5, 3]);
  });
  it('공통 = 위: A(시계 첫 갈래 = 오른쪽) → 통 5, B(왼쪽) → 통 0', () => {
    const b = three();
    sw(b, 5, 3, N, 'A');
    const a = drop(b, 5);
    expect(a.run()).toBe('binned');
    expect(a.bin).toBe(5);
    sw(b, 5, 3, N, 'B');
    const bb = drop(b, 5);
    bb.run();
    expect(bb.bin).toBe(0);
  });
  it('공통 = 오른쪽: 위에서 오면 위는 갈래 B. 상태 A(왼쪽 열림)면 막다른 길, B 면 공통(오른쪽)으로', () => {
    const b = three();
    sw(b, 5, 3, E, 'A');
    expect(drop(b, 5).run()).toBe('dead');
    sw(b, 5, 3, E, 'B');
    const s = drop(b, 5);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(5);
  });
  it('4갈래: 공통 위, A 오른쪽 / B 아래 / C 왼쪽', () => {
    const b = three();
    put(b, 'I-tube', 0, 5, 4); // (5,4)~(5,7) 아랫끝 출구 S → 판 밖 아래 = 통 2
    const res: (number | null)[] = [];
    for (const st of ['A', 'B', 'C'] as const) {
      sw(b, 5, 3, N, st);
      const s = drop(b, 5);
      s.run();
      res.push(s.bin);
    }
    expect(res).toEqual([5, 2, 0]);
  });
});

describe('센서 → 모터 → 기어 → 스위치', () => {
  /*
   * 토글: 분기점 (5,3) 공통 = 위. 오른쪽 갈래 (7,3)·왼쪽 갈래 (3,3) 에 센서.
   *   오른쪽: 모터 반시계 (7,2) — O빈 (6,1) 위 — 기어 (6,2), 기어 (5,2)(세로 튜브 위) → 스위치
   *   왼쪽: 모터 시계 (3,4) — I빈 가로 (2..5,4) 위 — 기어 (4,4), (5,4) → 스위치
   *   모터에서 스위치까지 거리 3(홀수) → 스위치는 모터 반대로 돈다
   *   A(오른쪽)로 가면 센서→반시계 모터→스위치 시계 A→B, B(왼쪽)로 가면 시계 모터→스위치 반시계 B→A
   */
  const toggle = () => {
    const b = new Board(12, 8);
    put(b, 'I-tube', 0, 5, 0);
    put(b, 'I-tube', 1, 1, 3);
    put(b, 'I-tube', 1, 6, 3);
    put(b, 'O-empty', 0, 6, 1);
    put(b, 'I-empty', 1, 2, 4);
    sw(b, 5, 3, N, 'A');
    part(b, 7, 3, { type: 'sensor' });
    part(b, 3, 3, { type: 'sensor' });
    part(b, 7, 2, { type: 'motor', dir: -1 });
    part(b, 6, 2, { type: 'gear' });
    part(b, 5, 2, { type: 'gear' });
    part(b, 3, 4, { type: 'motor', dir: 1 });
    part(b, 4, 4, { type: 'gear' });
    part(b, 5, 4, { type: 'gear' });
    return b;
  };
  it('햄스터가 지날 때마다 스위치가 번갈아 바뀌어 통 5, 0, 5, 0', () => {
    const b = toggle();
    let switches: Map<number, SwitchState> | undefined;
    let locked: Set<number> | undefined;
    const bins: (number | null)[] = [];
    for (let k = 0; k < 4; k++) {
      const s = drop(b, 5, switches, locked);
      expect(s.run()).toBe('binned');
      bins.push(s.bin);
      switches = s.switchesByCell();
      locked = s.locked;
      expect(locked.size).toBe(0);
    }
    expect(bins).toEqual([5, 0, 5, 0]);
  });
  it('모터 방향을 바꾸면 회전 거부 → 연결 요소 전체 잠김', () => {
    const b = toggle();
    part(b, 7, 2, { type: 'motor', dir: 1 }); // 이제 스위치를 반시계로 돌리려 함: A 에서 반시계 = 거부
    const s = drop(b, 5);
    s.run();
    expect(s.switchStateAt(5, 3)).toBe('A');
    expect(s.isCellLocked(5, 3)).toBe(true);
    expect(s.isCellLocked(4, 4)).toBe(true); // 같은 요소의 먼 기어
  });
  it('모터가 인접하지 않은 센서는 아무 일도 없다', () => {
    const b = new Board();
    put(b, 'I-tube', 0, 4, 2);
    part(b, 4, 3, { type: 'sensor' });
    const s = drop(b, 4);
    s.run();
    expect(s.locked.size).toBe(0);
  });
});

describe('대기열 실행', () => {
  it('순서대로 한 마리씩, 통마다 색별 마릿수', () => {
    const r = new QueueRun(new Board(), [
      { color: 0, inject: 'left' },
      { color: 1, inject: 'right' },
      { color: 1, inject: 'left' },
    ]);
    r.runAll();
    expect(r.tally.bins[0]).toEqual([1, 1]);
    expect(r.tally.bins[4]).toEqual([0, 1]);
    expect(r.loop).toBe(false);
  });
  it('멈춘 햄스터는 "멈춤"으로 세고 다음 마리로 넘어간다', () => {
    const b = new Board();
    put(b, 'I-tube', 0, 0, 0);
    part(b, 0, 3, { type: 'plug' });
    const r = new QueueRun(b, [
      { color: 0, inject: 'left' },
      { color: 1, inject: 'right' },
    ]);
    r.runAll();
    expect(r.tally.stopped).toEqual([1, 0]);
    expect(r.tally.bins[4]).toEqual([0, 1]);
  });
  it('루프가 나오면 알리고 실행 중단', () => {
    const b = new Board();
    put(b, 'O-tube', 0, 0, 5);
    const r = new QueueRun(b, [
      { color: 0, inject: 'left' },
      { color: 1, inject: 'right' },
    ]);
    r.runAll();
    expect(r.loop).toBe(true);
    expect(r.results.length).toBe(1);
  });
});
