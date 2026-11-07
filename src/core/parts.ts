/**
 * 부품 배치 규칙. 순수 로직.
 *  센서 = 아무 미노 칸, 기어 = 아무 미노 칸, 모터 = 빈칸만,
 *  스위치 = 3·4갈래 분기점만, 마개 = 튜브 경로 끝 칸만. 한 칸에 부품 하나.
 */
import type { Board } from './board';
import { computeLinks, degree, type Links } from './links';
import { rotateSides, SIDE_LIST, SWITCH_STATES, type Part, type PartType, type Sides, type SwitchState } from './types';

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

/** 반시계 방향 90° */
export function rotateSidesCcw(m: Sides): Sides {
  return rotateSides(rotateSides(rotateSides(m)));
}

/**
 * 스위치는 ㄱ자 관: 공통 갈래와 그 직각 갈래 하나를 잇는다 (일자 없음).
 * 공통 갈래는 양옆 직각 갈래가 둘 다 있어야 고를 수 있다 (T자 = 기둥만, 4갈래 = 아무 쪽).
 */
export function validCommon(arms: Sides, common: Sides): boolean {
  return (arms & common) !== 0 && (arms & rotateSides(common)) !== 0 && (arms & rotateSidesCcw(common)) !== 0;
}

/** [A, B] = [공통의 반시계 쪽 직각 갈래, 시계 쪽 직각 갈래]. 유효하지 않은 공통이면 [] */
export function switchArms(arms: Sides, common: Sides): Sides[] {
  return validCommon(arms, common) ? [rotateSidesCcw(common), rotateSides(common)] : [];
}

/** 스위치 상태 → 열린 갈래. 관이 시계로 90° 돌면 A → B */
export function activeArm(part: Part, state: SwitchState): Sides {
  return switchArms(part.arms!, part.common!)[SWITCH_STATES.indexOf(state)] ?? 0;
}

/** 다음 공통 갈래 후보 (회전 키): 유효한 공통 중 시계/반시계로 다음 것. 없으면 그대로 */
export function cycleCommon(arms: Sides, common: Sides, dir: 1 | -1): Sides {
  let s = common;
  for (let k = 0; k < 4; k++) {
    s = dir === 1 ? rotateSides(s) : rotateSidesCcw(s);
    if (validCommon(arms, s)) return s;
  }
  return common;
}

/** 스위치를 놓을 때 기본 공통 갈래: preferred 가 유효하면 그것, 아니면 N·E·S·W 순서로 첫 유효 */
export function defaultCommon(arms: Sides, preferred: Sides): Sides {
  if (validCommon(arms, preferred)) return preferred;
  for (const s of SIDE_LIST) if (validCommon(arms, s)) return s;
  return preferred;
}
