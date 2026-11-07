import { RULE_MINOS as M } from './fixtures/minos';
import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { LOCK_MS, LOCK_RESETS, Stack } from '../src/core/stack';

/** 칸 하나짜리 벽돌로 판을 채운다 (테스트 지형용) */
function fill(b: Board, cells: [number, number][]) {
  for (const [x, y] of cells) b.placeCells('X', 0, [{ x: 0, y: 0, cell: { kind: 'empty', open: 0 } }], x, y);
}

describe('스폰', () => {
  it('가로 10 판: T 는 상자 x=3, 맨 윗줄에 닿게', () => {
    const s = new Stack(new Board(10, 8), { 'T-switch': 1 }, M);
    expect(s.spawn('T-switch')).toBe(true);
    expect(s.active).toMatchObject({ r: 0, x: 3, y: 0 });
    expect(s.supply.get('T-switch')).toBe(0);
  });
  it('I 는 상자 y=-1 (가로줄이 0번 줄)', () => {
    const s = new Stack(new Board(10, 8), { 'I-tube': 1 }, M);
    s.spawn('I-tube');
    expect(s.active).toMatchObject({ r: 0, x: 3, y: -1 });
  });
  it('공급이 없거나 자리가 막히면 스폰 실패', () => {
    const b = new Board(10, 8);
    const s = new Stack(b, { 'T-switch': 1, 'O-gear': 0 }, M);
    expect(s.spawn('O-gear')).toBe(false);
    fill(b, [[4, 0]]);
    expect(s.spawn('T-switch')).toBe(false);
    expect(s.supply.get('T-switch')).toBe(1);
  });
});

describe('이동과 드롭', () => {
  it('벽 너머로는 못 간다', () => {
    const s = new Stack(new Board(10, 8), { 'O-gear': 1 }, M);
    s.spawn('O-gear'); // x=4
    for (let i = 0; i < 4; i++) expect(s.move(-1)).toBe(true);
    expect(s.move(-1)).toBe(false);
    expect(s.active!.x).toBe(0);
  });
  it('소프트 드롭은 한 칸씩, 바닥에서 멈춤', () => {
    const s = new Stack(new Board(10, 8), { 'O-gear': 1 }, M);
    s.spawn('O-gear');
    let n = 0;
    while (s.softDrop()) n++;
    expect(n).toBe(6); // 높이 8, O 높이 2
    expect(s.active!.y).toBe(6);
  });
  it('하드 드롭은 즉시 고정', () => {
    const b = new Board(10, 8);
    const s = new Stack(b, { 'O-gear': 1 }, M);
    s.spawn('O-gear');
    expect(s.hardDrop()).toBe(true);
    expect(s.active).toBeNull();
    expect(b.at(4, 7)?.kind).toBe('gear');
    expect(b.at(5, 6)?.kind).toBe('gear');
  });
  it('처마: 아래에 빈 공간이 있어도 걸리면 멈추고 공간은 남는다', () => {
    const b = new Board(10, 8);
    fill(b, [[4, 5]]);
    const s = new Stack(b, { 'O-gear': 1 }, M);
    s.spawn('O-gear'); // x=4..5
    s.hardDrop();
    expect(b.at(4, 4)?.kind).toBe('gear');
    expect(b.at(5, 5)).toBeNull(); // 처마 밑 빈칸
    expect(b.at(5, 7)).toBeNull();
  });
});

describe('락 딜레이', () => {
  const grounded = () => {
    const s = new Stack(new Board(10, 8), { 'O-gear': 1 }, M);
    s.spawn('O-gear', 0);
    while (s.softDrop(0));
    return s;
  };
  it('바닥에 닿은 뒤 1초가 지나야 고정', () => {
    const s = grounded();
    expect(s.groundedAt).toBe(0);
    expect(s.tick(LOCK_MS - 1)).toBe(false);
    expect(s.tick(LOCK_MS)).toBe(true);
    expect(s.active).toBeNull();
  });
  it('바닥에서 움직이면 타이머 리셋, 15번까지', () => {
    const s = grounded();
    let t = 0;
    for (let i = 0; i < LOCK_RESETS; i++) {
      t += 900;
      expect(s.move(i % 2 ? 1 : -1, t)).toBe(true);
      expect(s.tick(t + 999)).toBe(false);
    }
    t += 900;
    s.move(1, t); // 16번째: 리셋 안 됨
    expect(s.tick(t + 100)).toBe(true);
  });
  it('공중이면 타이머 없음, 공중에서 lock() 거부', () => {
    const s = new Stack(new Board(10, 8), { 'O-gear': 1 }, M);
    s.spawn('O-gear', 0);
    expect(s.groundedAt).toBeNull();
    expect(s.tick(10_000)).toBe(false);
    expect(s.lock()).toBe(false);
  });
  it('처마 끝에서 옆으로 밀어 떨어질 수 있게 되면 타이머 해제', () => {
    const b = new Board(10, 8);
    fill(b, [[4, 7], [5, 7]]);
    const s = new Stack(b, { 'O-gear': 1 }, M);
    s.spawn('O-gear', 0);
    while (s.softDrop(0));
    expect(s.groundedAt).toBe(0);
    expect(s.move(2, 100)).toBe(true); // x=6..7: 아래(7번 줄)가 비어 있음 → 공중
    expect(s.groundedAt).toBeNull();
    expect(s.softDrop(200)).toBe(true);
    expect(s.groundedAt).toBe(200); // 다시 바닥에 닿으면 새로 시작
  });
});

describe('SRS 회전', () => {
  it('왼쪽 벽에 붙은 T 를 R→0 으로 돌리면 오른쪽으로 1칸 킥', () => {
    const s = new Stack(new Board(10, 8), { 'T-switch': 1 }, M);
    s.spawn('T-switch');
    s.rotate(1); // R
    while (s.move(-1));
    expect(s.active).toMatchObject({ r: 1, x: -1 }); // 상자는 벽 밖, 칸은 0~1열
    expect(s.rotate(-1)).toBe(true);
    expect(s.active).toMatchObject({ r: 0, x: 0 });
  });
  it('T-스핀 더블 자리: 막힌 처마 아래 T 슬롯에 도달 가능', () => {
    // 높이 6. 처마 (3,3), 4번 줄은 3~5열 비움, 5번 줄은 4열만 비움
    const b = new Board(10, 6);
    const cells: [number, number][] = [[3, 3]];
    for (let x = 0; x < 10; x++) {
      if (x < 3 || x > 5) cells.push([x, 4]);
      if (x !== 4) cells.push([x, 5]);
    }
    fill(b, cells);
    const s = new Stack(b, { 'T-switch': 1 }, M);
    const poses = s.reachableLocks('T-switch');
    expect(poses).toContainEqual({ r: 2, x: 3, y: 3 }); // (3,4)(4,4)(5,4)(4,5)
    // 같은 슬롯에 T 를 아래 방향(2)으로 그냥 떨어뜨리면 처마에 걸린다
    expect(s.fits('T-switch', { r: 2, x: 3, y: 2 })).toBe(false);
  });
});

describe('무르기와 공급', () => {
  it('마지막에 놓은 것부터 되돌리고 공급으로', () => {
    const b = new Board(10, 8);
    const s = new Stack(b, { 'O-gear': 2 }, M);
    s.spawn('O-gear');
    s.hardDrop();
    s.spawn('O-gear');
    s.hardDrop();
    expect(b.placed.length).toBe(2);
    expect(s.supply.get('O-gear')).toBe(0);
    expect(s.undo()).toBe(true);
    expect(b.placed.length).toBe(1);
    expect(b.at(4, 5)).toBeNull(); // 위에 쌓인 것이 사라짐
    expect(b.at(4, 7)?.kind).toBe('gear');
    expect(s.supply.get('O-gear')).toBe(1);
  });
  it('떨어지는 중이면 그 미노부터 취소', () => {
    const s = new Stack(new Board(10, 8), { 'O-gear': 1 }, M);
    s.spawn('O-gear');
    expect(s.undo()).toBe(true);
    expect(s.active).toBeNull();
    expect(s.supply.get('O-gear')).toBe(1);
  });
  it('레벨 고정 미노(history 밖)는 무를 수 없다', () => {
    const b = new Board(10, 8);
    b.place('O-gear', 0, 0, 6, M);
    const s = new Stack(b, {}, M);
    expect(s.undo()).toBe(false);
    expect(b.placed.length).toBe(1);
  });
});

describe('판 위 보이지 않는 줄', () => {
  it('맨 위에서 I 를 돌려도 밀려나지 않는다 (상자 x 그대로, 칸이 판 위로 삐져나감)', () => {
    const s = new Stack(new Board(8, 8), { 'I-tube': 1 }, M);
    s.spawn('I-tube'); // x=2, y=-1
    expect(s.rotate(1)).toBe(true);
    expect(s.active).toMatchObject({ r: 1, x: 2, y: -1 });
  });
  it('판 위로 삐져나온 채로는 고정되지 않는다', () => {
    const b = new Board(4, 3);
    const s = new Stack(b, { 'I-tube': 1 }, M);
    s.spawn('I-tube'); // 가로, 0번 줄
    s.rotate(1); // 세로 4칸: 높이 3 판에서는 한 칸이 위로 삐져나옴
    while (s.softDrop());
    expect(s.isGrounded()).toBe(true);
    expect(s.lock()).toBe(false);
    expect(s.tick(5000)).toBe(false);
  });
});
