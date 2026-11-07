import { Board } from '../src/core/board';
import { RULE_MINOS as M } from './fixtures/minos';
import type { Part } from '../src/core/types';
import { computeLinks } from '../src/core/links';

/** 미노 놓기 (실패하면 테스트 실패) */
export function put(b: Board, id: string, rot: number, x: number, y: number) {
  const p = b.place(id, rot, x, y, M);
  if (!p) throw new Error(`배치 실패: ${id} r${rot} (${x},${y})`);
  return p;
}
/** 부품 직접 놓기 (규칙 검사 없이 — 규칙 검사는 parts/editor 테스트에서) */
export function part(b: Board, x: number, y: number, p: Part) {
  b.parts.set(b.idx(x, y), p);
}
/** 스위치 놓기: 갈래는 현재 연결로, 공통은 지정 */
export function sw(b: Board, x: number, y: number, common: number, start: Part['start'] = 'A') {
  const arms = computeLinks(b).link[b.idx(x, y)]!;
  b.parts.set(b.idx(x, y), { type: 'switch', arms, common, start });
}
