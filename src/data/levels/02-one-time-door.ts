import type { Level } from '../../core/level';

/** 2. 일회용 문 — 지나간 햄스터가 스스로 문을 닫게 만들기 */
export const oneTimeDoor: Level = {
  id: '02-one-time-door',
  title: '2. 일회용 문',
  description:
    '고정된 스위치는 A 상태로 시작하고, 왼쪽(1번 칸)으로 들어오면 아래로 통합니다. ' +
    '햄스터 3마리를 연달아 왼쪽으로 넣습니다. 첫 마리는 통 1 에 들어가고, ' +
    '둘째·셋째는 막다른 길에서 멈춰야 합니다. 스위치·잠김 상태는 다음 햄스터로 이어집니다.',
  width: 8,
  height: 10,
  supply: { 'L-tube': 2, 'J-tube': 1, 'I-tube': 1, 'I-sensor': 1, 'S-motor': 1, 'Z-motor': 1, 'O-gear': 3 },
  fixed: [{ defId: 'T-switch', r: 2, x: 2, y: 3 }],
  cases: [
    {
      name: '3마리 연속',
      hamsters: [
        { inject: 'left', expect: { bin: 1 } },
        { inject: 'left', expect: { fail: 'dead' } },
        { inject: 'left', expect: { fail: 'dead' } },
      ],
    },
  ],
};
