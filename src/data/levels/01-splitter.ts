import type { Level } from '../../core/level';

/** 1. 분기기 — 중력 쌓기와 스위치 읽기를 익히는 튜토리얼 */
export const splitter: Level = {
  id: '01-splitter',
  title: '1. 분기기',
  description:
    '왼쪽 투입구로 떨어지는 햄스터를 가운데 스위치(고정)의 윗입구로 보내세요. ' +
    '스위치가 A 면 통 2, B 면 통 1 에 들어가야 합니다. 미노는 공중에 뜰 수 없으니 받침도 생각하세요.',
  width: 6,
  height: 8,
  supply: { 'L-tube': 2, 'J-tube': 1, 'I-tube': 1 },
  fixed: [{ defId: 'T-switch', r: 0, x: 2, y: 3 }],
  cases: [
    { name: '스위치 A', switches: [{ x: 3, y: 4, state: 'A' }], hamsters: [{ inject: 'left', expect: { bin: 2 } }] },
    { name: '스위치 B', switches: [{ x: 3, y: 4, state: 'B' }], hamsters: [{ inject: 'left', expect: { bin: 1 } }] },
  ],
};
