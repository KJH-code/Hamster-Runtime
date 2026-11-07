/**
 * 부품 배치 규칙. 순수 로직.
 *  센서 = 아무 미노 칸, 기어 = 아무 미노 칸, 모터 = 빈칸만,
 *  스위치 = 3·4갈래 분기점만, 마개 = 튜브 경로 끝 칸만. 한 칸에 부품 하나.
 */
import type { Board } from './board';
import { computeLinks, degree, type Links } from './links';
import { rotateSides, SWITCH_STATES, type Part, type PartType, type Sides, type SwitchState } from './types';

export const PART_NAMES: Record<PartType, string> = {
  sensor: '센서',
  gear: '기어',
  motor: '모터',
  switch: '스위치',
  plug: '마개',
};

/** 놓을 수 없으면 이유, 놓을 수 있으면 null */
export function partRuleError(board: Board, x: number, y: number, type: PartType, links: Links = computeLinks(board)): string | null {
  if (!board.inBounds(x, y)) return '판 밖';
  const c = board.at(x, y);
  if (!c) return '부품은 미노 칸 위에만 놓을 수 있다';
  if (board.partAt(x, y)) return '이 칸에는 이미 부품이 있다';
  const i = board.idx(x, y);
  switch (type) {
    case 'sensor':
    case 'gear':
      return null;
    case 'motor':
      return c.kind === 'empty' ? null : '모터는 튜브가 아닌 빈칸에만 놓을 수 있다';
    case 'plug':
      return c.kind === 'tube' && c.end ? null : '마개는 튜브 경로의 끝 칸에만 놓을 수 있다';
    case 'switch':
      return c.kind === 'tube' && degree(links, i) >= 3 ? null : '스위치는 3·4갈래 분기점에만 놓을 수 있다';
  }
}

/** 공통 갈래에서 시계 방향 순서로 나머지 갈래 = [A, B, (C)] */
export function switchArms(arms: Sides, common: Sides): Sides[] {
  const out: Sides[] = [];
  let s = rotateSides(common);
  for (let k = 0; k < 3; k++, s = rotateSides(s)) if (arms & s) out.push(s);
  return out;
}

/** 스위치 상태 → 열린 갈래 */
export function activeArm(part: Part, state: SwitchState): Sides {
  return switchArms(part.arms!, part.common!)[SWITCH_STATES.indexOf(state)] ?? 0;
}

/** 다음 공통 갈래 후보 (회전 키): 갈래 중 시계/반시계로 다음 것 */
export function cycleCommon(arms: Sides, common: Sides, dir: 1 | -1): Sides {
  let s = common;
  for (let k = 0; k < 4; k++) {
    s = dir === 1 ? rotateSides(s) : rotateSides(rotateSides(rotateSides(s)));
    if (arms & s) return s;
  }
  return common;
}
