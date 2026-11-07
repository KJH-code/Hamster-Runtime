import { describe, expect, it } from 'vitest';
import { Editor } from '../src/core/editor';
import { RULE_MINOS as M } from './fixtures/minos';

/** 3갈래 분기점 (5,3) 을 만든 편집기 (12×8) */
function junction() {
  const ed = new Editor(12, 8, M);
  expect(ed.placeMino('I-tube', 0, 5, 0).ok).toBe(true);
  expect(ed.placeMino('I-tube', 1, 1, 3).ok).toBe(true);
  expect(ed.placeMino('I-tube', 1, 6, 3).ok).toBe(true);
  return ed;
}

describe('미노 편집', () => {
  it('겹치면 거부', () => {
    const ed = new Editor(10, 8, M);
    ed.placeMino('O-empty', 0, 0, 0);
    const r = ed.placeMino('O-empty', 0, 1, 1);
    expect(r.ok).toBe(false);
    expect(ed.board.placed.length).toBe(1);
  });
  it('떠 있는 미노와 겹치는 미노 제거 (위 부품도 같이 사라짐)', () => {
    const ed = new Editor(10, 8, M);
    ed.placeMino('O-empty', 0, 0, 0);
    ed.placePart(0, 0, 'gear');
    expect(ed.removeMinosOverlapping(ed.shapeOf('I-tube', 0), 1, 0).ok).toBe(true);
    expect(ed.board.placed.length).toBe(0);
    expect(ed.board.parts.size).toBe(0);
  });
});

describe('부품 편집', () => {
  it('규칙 위반은 거부되고 이유를 돌려준다: 모터를 튜브 위에', () => {
    const ed = junction();
    const r = ed.placePart(5, 1, 'motor', 1);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/빈칸/) });
    expect(ed.board.parts.size).toBe(0);
  });
  it('스위치: 기본 공통 = 경로가 들어오는 변, 시작 A. 회전 키로 공통 순환, 갈래 없는 상태는 거부', () => {
    const ed = junction();
    expect(ed.placePart(5, 3, 'switch').ok).toBe(true);
    const p = ed.board.partAt(5, 3)!;
    expect(p.common).toBe(1); // N
    expect(p.start).toBe('A');
    expect(ed.setSwitchStart(5, 3, 'B').ok).toBe(true);
    expect(ed.setSwitchStart(5, 3, 'C').ok).toBe(false); // 3갈래 스위치에는 C 없음
    expect(ed.rotateSwitch(5, 3, 1).ok).toBe(true);
    expect(ed.board.partAt(5, 3)!.common).toBe(2); // E
  });
  it('스위치가 놓인 분기점의 갈래를 바꾸는 편집은 거부: 아래에 끝 붙이기, 옆 미노 지우기, 옆 끝에 마개', () => {
    const ed = junction();
    ed.placePart(5, 3, 'switch');
    const before = ed.board.placed.length;
    expect(ed.placeMino('I-tube', 0, 5, 4).ok).toBe(false);
    expect(ed.removeAt(7, 3).ok).toBe(false);
    expect(ed.placePart(6, 3, 'plug').ok).toBe(false);
    expect(ed.board.placed.length).toBe(before);
    expect(ed.board.partAt(6, 3)).toBeUndefined();
  });
  it('Delete: 부품이 있으면 부품만, 없으면 미노', () => {
    const ed = junction();
    ed.placePart(5, 1, 'gear');
    ed.removeAt(5, 1);
    expect(ed.board.partAt(5, 1)).toBeUndefined();
    expect(ed.board.placed.length).toBe(3);
    ed.removeAt(5, 1);
    expect(ed.board.placed.length).toBe(2);
  });
});

describe('되돌리기 / 다시 하기', () => {
  it('모든 편집을 순서대로 되돌리고 다시 한다', () => {
    const ed = junction();
    ed.placePart(5, 3, 'switch');
    ed.queueAdd(1, { color: 1, inject: 'right' });
    expect(ed.queue.length).toBe(3);
    expect(ed.undo()).toBe(true);
    expect(ed.queue.length).toBe(2);
    expect(ed.undo()).toBe(true);
    expect(ed.board.parts.size).toBe(0);
    expect(ed.redo()).toBe(true);
    expect(ed.board.partAt(5, 3)?.type).toBe('switch');
    expect(ed.board.placed.length).toBe(3);
  });
  it('거부된 편집은 기록되지 않는다', () => {
    const ed = new Editor(10, 8, M);
    ed.placeMino('O-empty', 0, 0, 0);
    ed.placeMino('O-empty', 0, 0, 0); // 거부
    expect(ed.undo()).toBe(true);
    expect(ed.board.placed.length).toBe(0);
    expect(ed.undo()).toBe(false);
  });
  it('새 편집을 하면 다시 하기 기록은 사라진다', () => {
    const ed = new Editor(10, 8, M);
    ed.placeMino('O-empty', 0, 0, 0);
    ed.undo();
    ed.placeMino('I-empty', 0, 5, 0);
    expect(ed.redo()).toBe(false);
  });
});

describe('대기열 편집', () => {
  it('추가·색·투입구·삭제', () => {
    const ed = new Editor(10, 8, M);
    ed.queueSet(0, { inject: 'right', color: 1 });
    expect(ed.queue[0]).toEqual({ color: 1, inject: 'right' });
    ed.queueRemove(0);
    expect(ed.queue.length).toBe(1);
    expect(ed.queueRemove(5).ok).toBe(false);
  });
});

describe('판 크기', () => {
  it('들어가는 미노만 남고, 되돌리면 원래 크기', () => {
    const ed = new Editor(10, 14, M);
    ed.placeMino('O-empty', 0, 0, 0);
    ed.placeMino('O-empty', 0, 8, 12); // (8..9, 12..13)
    ed.placePart(0, 0, 'gear');
    expect(ed.resize(6, 8).ok).toBe(true);
    expect([ed.board.w, ed.board.h]).toEqual([6, 8]);
    expect(ed.board.placed.length).toBe(1);
    expect(ed.board.partAt(0, 0)?.type).toBe('gear');
    expect(ed.undo()).toBe(true);
    expect([ed.board.w, ed.board.h]).toEqual([10, 14]);
    expect(ed.board.placed.length).toBe(2);
  });
});
