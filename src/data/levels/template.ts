import type { Level } from '../../core/level';

/**
 * 레벨 템플릿 — 복사해서 새 레벨을 만든다. 만든 레벨은 index.ts 의 LEVELS 에 추가.
 *
 * 좌표: x 는 왼쪽부터, y 는 위부터 0. 통은 판 맨 아래, 폭 2칸 (통 개수 = width / 2).
 * 투입구: 맨 위 줄의 왼쪽 끝 열('left') / 오른쪽 끝 열('right').
 *
 * 설계 체크리스트 (볼트 「퍼즐 레벨 설계 규칙」)
 *  - 오답 케이스를 넣는다: 아무것도 안 놓은 판이 통과하면 안 된다 (tests/levels.test.ts 가 검사)
 *  - 필요한 수치(몇 마리, 어느 통)는 설명에 적는다
 *  - 해법이 하나만 되게 막지 않는다. 다른 배치로도 통과하는지 시험해 본다
 */
export const template: Level = {
  id: '00-template',
  title: '0. 템플릿',
  description: '플레이어에게 보이는 설명. 목표를 숨기지 말고 적는다.',
  width: 8, // 짝수
  height: 10,
  // 미노 id → 개수 (src/data/minos.ts 의 id). 순서는 플레이어가 고른다
  supply: { 'I-tube': 2, 'L-tube': 1 },
  // 미리 놓인 미노. r = SRS 방향(0 스폰, 1 시계, 2, 3 반시계), (x,y) = SRS 상자 좌상단. 무를 수 없다
  fixed: [{ defId: 'T-switch', r: 0, x: 2, y: 4 }],
  cases: [
    {
      name: '케이스 이름',
      // 고정 스위치의 시작 상태 (스위치 칸 좌표). 플레이어 스위치는 플레이어가 정한다
      switches: [{ x: 3, y: 5, state: 'A' }],
      // 순서대로 넣는다. 케이스 안에서는 스위치·잠김 상태가 이어진다
      hamsters: [
        { inject: 'left', expect: { bin: 2 } },
        // 실패를 기대할 때: 'dead'(막다른 길) | 'crashed'(튕김) | 'out'(판 밖) | 'loop' | 'any'
        { inject: 'right', expect: { fail: 'dead' } },
      ],
    },
  ],
};
