import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { Simulation } from '../src/core/hamster';
import type { MinoDef } from '../src/data/minos';
import type { SwitchState } from '../src/core/types';

function makeSim(b: Board, inject: 'left' | 'right' = 'left', startX?: number, sw?: [number, number, SwitchState][]) {
  const m = new Map<number, SwitchState>();
  for (const [x, y, s] of sw ?? []) m.set(b.idx(x, y), s);
  const sim = new Simulation(b, { inject, switches: m });
  if (startX !== undefined) sim.x = startX; // 테스트 편의: 투입구는 좌/우 끝이지만 임의 열에서 떨어뜨려 본다
  return sim;
}

describe('낙하와 통', () => {
  it('빈 판: 왼쪽 투입은 통 0, 오른쪽 투입은 통 4', () => {
    const l = makeSim(new Board(), 'left');
    expect(l.run()).toBe('binned');
    expect(l.bin).toBe(0);
    const r = makeSim(new Board(), 'right');
    expect(r.run()).toBe('binned');
    expect(r.bin).toBe(4);
  });
  it('열 x 에서 떨어지면 통 = floor(x/2)', () => {
    for (const [x, bin] of [[1, 0], [2, 1], [5, 2], [6, 3], [8, 4]] as const) {
      const s = makeSim(new Board(), 'left', x);
      s.run();
      expect(s.bin, `x=${x}`).toBe(bin);
    }
  });
  it('위로 열린 튜브 입구에 떨어지면 받아서 끝까지 간다', () => {
    const b = new Board();
    b.place('I-tube', 0, 4, 6);
    const s = makeSim(b, 'left', 4);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(2);
    expect(s.steps).toBeGreaterThan(14); // 튜브를 통과해 판 바닥까지
  });
  it('미노의 빈칸 요소는 통과', () => {
    const defs: MinoDef[] = [{ id: 'E', name: 'E', piece: 'O', rows: [['empty', 'empty'], ['empty', 'empty']] }];
    const b = new Board();
    b.place('E', 0, 4, 6, defs);
    const s = makeSim(b, 'left', 4);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(2);
  });
  it('비튜브 부품 칸에 닿으면 튕김 → 실패', () => {
    const b = new Board();
    b.place('O-gear', 0, 4, 6);
    const s = makeSim(b, 'left', 4);
    expect(s.run()).toBe('crashed');
    expect(s.bounce).toEqual({ x: 4, y: 6 });
    expect(s.bin).toBeNull();
  });
  it('위가 닫힌 튜브 칸(가로 튜브)에 닿으면 튕김 → 실패', () => {
    const b = new Board();
    b.place('I-tube', 1, 3, 6);
    const s = makeSim(b, 'left', 4);
    expect(s.run()).toBe('crashed');
    expect(s.bounce).toEqual({ x: 4, y: 6 });
  });
});

describe('튜브 이동', () => {
  it('L 튜브: 아래로 내려가 꺾여 오른쪽으로 나가 낙하', () => {
    const b = new Board();
    b.place('L-tube', 0, 0, 0); // (0,0)(0,1)(0,2) 세로, (1,2) 가로
    const s = makeSim(b, 'left');
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(1); // (1,2) 에서 E 로 나가 (2,2) 낙하 → 열 2 → 통 1
  });
  it('판 옆으로 나가면 실패', () => {
    const b = new Board();
    b.place('L-tube', 0, 8, 0); // 끝 (9,2) 가 오른쪽으로 열림
    const s = makeSim(b, 'left', 8);
    expect(s.run()).toBe('out');
  });
});

describe('막다른 길', () => {
  // T-스위치 정방향을 (2,2) 에 놓고 왼쪽에서 L 튜브로 들어간다
  // 1=(2,2) 2=(3,2) 3=(4,2) 4=(3,3)
  const build = () => {
    const b = new Board();
    b.place('L-tube', 0, 0, 0); // 경로 끝 (1,2) → 오른쪽 (2,2)
    b.place('T-switch', 0, 2, 2);
    return b;
  };
  it('상태 A: 1→2→4 로 빠져 낙하해 통 1', () => {
    const s = makeSim(build(), 'left', undefined, [[3, 2, 'A']]);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(1); // 4 번 칸 (3,3) 아래 → 열 3 → 통 1
  });
  it('상태 B: 1쪽에서 들어오면 닫힌 갈래 → 스위치 칸에서 멈춤 = 실패', () => {
    const s = makeSim(build(), 'left', undefined, [[3, 2, 'B']]);
    expect(s.run()).toBe('dead');
    expect([s.x, s.y]).toEqual([3, 2]);
  });
});

describe('T를 180° 돌린 분기기', () => {
  // 4=(4,4) 위 입구, 스위치 (4,5), 갈래 (3,5) 와 (5,5)
  const build = () => {
    const b = new Board();
    b.place('T-switch', 2, 3, 4);
    return b;
  };
  it('상태 A: 오른쪽 갈래 → (6,5) 낙하 → 통 3', () => {
    const s = makeSim(build(), 'left', 4, [[4, 5, 'A']]);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(3);
  });
  it('상태 B: 왼쪽 갈래 → (2,5) 낙하 → 통 1', () => {
    const s = makeSim(build(), 'left', 4, [[4, 5, 'B']]);
    expect(s.run()).toBe('binned');
    expect(s.bin).toBe(1);
  });
});

describe('루프 감지', () => {
  it('U 자 튜브: 위로 올라가 나갔다 다시 같은 입구로 떨어지면 loop', () => {
    const b = new Board();
    b.place('L-tube', 0, 0, 1);
    b.place('J-tube', 0, 2, 1);
    const s = makeSim(b, 'left');
    expect(s.run()).toBe('loop');
    expect(s.bin).toBeNull();
  });
});

describe('센서 → 모터 → 기어 → 스위치', () => {
  /*
   * 스위치 분기기(T 180°) 양쪽 갈래에 센서 경로, 각 센서 옆 모터(S 시계 / Z 반시계)를 기어로 스위치에 연결.
   * 상태 A 경로 = 동쪽(센서 시계 모터) → 스위치 B 로, 상태 B 경로 = 서쪽(반시계) → A 로.
   * 그림 (T=스위치 칸 포함):
   *   ....T.....
   *   .JJTTTLL..
   *   .J.SSSSL..
   *   .JSSSS.L..
   *   .I.Z.S.I..
   *   .IZZ.SSI..
   *   .IZ...SI..
   */
  const build = () => {
    const b = new Board();
    const steps: [string, number, number, number][] = [
      ['T-switch', 2, 3, 0], ['L-tube', 2, 6, 1], ['J-tube', 2, 1, 1],
      ['I-sensor', 0, 7, 4], ['I-sensor', 0, 1, 4],
      ['S-motor', 3, 5, 4], ['Z-motor', 3, 2, 4], ['S-motor', 0, 4, 2], ['S-motor', 0, 2, 2],
    ];
    for (const [id, r, x, y] of steps) expect(b.place(id, r, x, y), id).not.toBeNull();
    return b;
  };
  it('토글: 시작 A 로 한 번 지나면 B, 시작 B 로 지나면 A (잠김 없음)', () => {
    const a = makeSim(build(), 'left', 4, [[4, 1, 'A']]);
    expect(a.run()).toBe('binned');
    expect(a.bin).toBe(3); // 동쪽 경로
    expect(a.switchStateAt(4, 1)).toBe('B');
    expect(a.locked.size).toBe(0);

    const bb = makeSim(build(), 'left', 4, [[4, 1, 'B']]);
    expect(bb.run()).toBe('binned');
    expect(bb.bin).toBe(0); // 서쪽 경로
    expect(bb.switchStateAt(4, 1)).toBe('A');
    expect(bb.locked.size).toBe(0);
  });
  it('센서를 지난 시점에 기어가 돌고, 센서 칸이 trigger 로 보고된다', () => {
    const s = makeSim(build(), 'left', 4, [[4, 1, 'A']]);
    let triggered = false;
    while (s.status === 'running') {
      s.step();
      if (s.lastTriggered.length) {
        triggered = true;
        expect(s.lastTriggered[0]).toEqual({ x: 7, y: 5 });
        expect(s.lastDrive!.flipped.length).toBe(1);
      }
    }
    expect(triggered).toBe(true);
  });
  it('모터가 하나도 인접하지 않은 센서는 아무 일도 일으키지 않는다', () => {
    const b = new Board();
    b.place('I-sensor', 0, 4, 2);
    const s = makeSim(b, 'left', 4);
    s.run();
    expect(s.lastDrive).toBeNull();
    expect(s.locked.size).toBe(0);
  });
  it('센서가 스위치 앞에 있는 회로: 시계 구동이 이미 B 인 스위치에 오면 거부되어 연결 요소 전체가 잠긴다', () => {
    /*
     *   ...ZI.....   센서 (4,1) 옆 모터 Z(반시계) (3,1) → 기어 줄 → 스위치 칸 (4,5) 아래 기어 (4,6)
     *   ..ZZI.....   방향 패리티상 스위치는 시계로 돈다 (A→B 가능, B 에서는 거부)
     *   ..Z.I.....
     *   .SS.I.....
     *   SS..T.....
     *   S..TTT....
     *   SS.SS.....
     *   .SSS......
     */
    const build = () => {
      const b = new Board();
      const steps: [string, number, number, number][] = [
        ['I-sensor', 0, 4, 0], ['T-switch', 2, 3, 4],
        ['Z-motor', 1, 2, 0], ['S-motor', 0, 0, 3], ['S-motor', 1, 0, 5], ['S-motor', 0, 2, 6],
      ];
      for (const [id, r, x, y] of steps) expect(b.place(id, r, x, y), id).not.toBeNull();
      return b;
    };
    // 스위치가 B 로 바뀐 뒤 서쪽 갈래로 빠져 (2,6) 의 기어에 닿아 실패한다 — 이 테스트의 관심사는 기어 쪽
    const a = makeSim(build(), 'left', 4, [[4, 5, 'A']]);
    expect(a.run()).toBe('crashed');
    expect(a.switchStateAt(4, 5)).toBe('B');
    expect(a.locked.size).toBe(0);

    const bb = makeSim(build(), 'left', 4, [[4, 5, 'B']]);
    expect(bb.run()).toBe('crashed');
    expect(bb.switchStateAt(4, 5)).toBe('B'); // 그대로
    expect(bb.locked.size).toBe(1);
    expect(bb.isCellLocked(4, 5)).toBe(true);
    expect(bb.isCellLocked(0, 4)).toBe(true); // 같은 연결 요소의 먼 기어도 잠김
  });
});
