import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { computeLinks, degree, isJunction } from '../src/core/links';
import { E, N, S, W } from '../src/core/types';
import { part, put } from './helpers';

const at = (b: Board, l: ReturnType<typeof computeLinks>, x: number, y: number) => ({
  link: l.link[b.idx(x, y)],
  exit: l.exit[b.idx(x, y)],
});

describe('튜브 끝 자동 연결', () => {
  it('세로 I 하나: 윗끝은 위로, 아랫끝은 아래로 직진 출구, 중간은 위아래만', () => {
    const b = new Board(10, 8);
    put(b, 'I-tube', 0, 0, 0);
    const l = computeLinks(b);
    expect(at(b, l, 0, 0)).toEqual({ link: S, exit: N });
    expect(at(b, l, 0, 1)).toEqual({ link: N | S, exit: 0 });
    expect(at(b, l, 0, 3)).toEqual({ link: N, exit: S });
  });
  it('위아래로 이어 놓은 두 I: 맞닿은 끝끼리 연결되고 직진 출구는 사라진다', () => {
    const b = new Board(10, 8);
    put(b, 'I-tube', 0, 0, 0);
    put(b, 'I-tube', 0, 0, 4);
    const l = computeLinks(b);
    expect(at(b, l, 0, 3)).toEqual({ link: N | S, exit: 0 });
    expect(at(b, l, 0, 4)).toEqual({ link: N | S, exit: 0 });
  });
  it('경로 중간 칸 옆에 다른 끝이 붙어도 연결되지 않는다', () => {
    const b = new Board(10, 8);
    put(b, 'I-tube', 0, 0, 0); // 세로 (0,0)~(0,3)
    put(b, 'I-tube', 1, 1, 1); // 가로 (1,1)~(4,1), 왼쪽 끝 (1,1) 은 (0,1) 중간 칸 옆
    const l = computeLinks(b);
    expect(at(b, l, 0, 1)).toEqual({ link: N | S, exit: 0 });
    expect(at(b, l, 1, 1)).toEqual({ link: E, exit: W }); // 직진 출구는 중간 칸 쪽으로
  });
  it('끝끼리는 방향과 상관없이 옆에만 있으면 연결 (L 끝 옆에 세로 I 끝)', () => {
    const b = new Board(10, 8);
    put(b, 'L-tube', 0, 0, 0); // (0,0)(0,1)(0,2)(1,2), 끝 (1,2) 은 경로가 왼쪽에서 옴
    put(b, 'I-tube', 0, 1, 3); // 세로 (1,3)~(1,6), 윗끝 (1,3)
    const l = computeLinks(b);
    expect(at(b, l, 1, 2)).toEqual({ link: W | S, exit: 0 });
    expect(at(b, l, 1, 3)).toEqual({ link: N | S, exit: 0 });
  });
  it('같은 미노의 두 끝은 서로 연결되지 않는다 (O U자)', () => {
    const b = new Board(10, 8);
    put(b, 'O-tube', 0, 0, 0); // 1(0,0) 2(0,1) 3(1,1) 4(1,0)
    const l = computeLinks(b);
    expect(at(b, l, 0, 0)).toEqual({ link: S, exit: N });
    expect(at(b, l, 1, 0)).toEqual({ link: S, exit: N });
  });
});

describe('분기점', () => {
  // 세로 I (5,0)~(5,3) 의 아랫끝 (5,3) 양옆에 가로 I 의 끝
  const three = () => {
    const b = new Board(12, 8);
    put(b, 'I-tube', 0, 5, 0);
    put(b, 'I-tube', 1, 1, 3); // (1,3)~(4,3)
    put(b, 'I-tube', 1, 6, 3); // (6,3)~(9,3)
    return b;
  };
  it('3갈래: 위(경로) + 좌우(자동 연결)', () => {
    const b = three();
    const l = computeLinks(b);
    expect(at(b, l, 5, 3)).toEqual({ link: N | E | W, exit: 0 });
    expect(isJunction(l, b.idx(5, 3))).toBe(true);
    expect(isJunction(l, b.idx(4, 3))).toBe(false);
    expect(degree(l, b.idx(4, 3))).toBe(2);
  });
  it('4갈래: 아래에도 끝을 붙이면', () => {
    const b = three();
    put(b, 'I-tube', 0, 5, 4); // (5,4)~(5,7)
    const l = computeLinks(b);
    expect(at(b, l, 5, 3)).toEqual({ link: N | E | S | W, exit: 0 });
    expect(degree(l, b.idx(5, 3))).toBe(4);
  });
  it('마개: 막은 끝은 연결도 출구도 없고, 상대 분기점은 갈래가 줄어든다', () => {
    const b = three();
    part(b, 6, 3, { type: 'plug' });
    const l = computeLinks(b);
    expect(at(b, l, 6, 3)).toEqual({ link: E, exit: 0 });
    expect(at(b, l, 5, 3)).toEqual({ link: N | W, exit: 0 });
    expect(isJunction(l, b.idx(5, 3))).toBe(false);
  });
  it('마개 단 외톨이 끝: 직진 출구가 사라진다', () => {
    const b = new Board(10, 8);
    put(b, 'I-tube', 0, 0, 0);
    part(b, 0, 3, { type: 'plug' });
    expect(at(b, computeLinks(b), 0, 3)).toEqual({ link: N, exit: 0 });
  });
});
