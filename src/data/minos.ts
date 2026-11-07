/**
 * 미노 목록 (데이터). 재혁이 여기서 직접 고친다.
 *
 * rows 는 행 단위 격자. 각 항목은 칸 토큰이다.
 *   ''                 이 자리는 미노가 아님
 *   'empty'            미노 칸이지만 요소 없음 (낙하 햄스터가 통과)
 *   'tube:NS'          튜브. 콜론 뒤는 열린 변 (N 위, E 오른쪽, S 아래, W 왼쪽). 정확히 2개 권장
 *   'sensor:NS'        센서(압력판) 튜브 칸. 튜브처럼 열린 변을 가진다
 *   'gear'             기어
 *   'motor:cw' / 'motor:ccw'   모터 (시계 / 반시계)
 *   'switch:S,W,E'     스위치 칸(기어 겸 튜브 분기점). 공통 변, 상태 A 갈래, 상태 B 갈래
 *                      상태 A = 공통↔A갈래, 상태 B = 공통↔B갈래, 닫힌 갈래로 들어오면 막다른 길
 * 모양은 테트로미노 7종(I, O, T, S, Z, L, J)이어야 한다. 회전은 게임이 처리한다(거울 없음).
 * piece 는 테트로미노 글자. 중력 모드의 SRS 회전(회전 중심·월킥)이 이 글자를 따른다.
 * rows 의 모양이 piece 글자와 다르면 테스트가 실패한다.
 */
export type PieceLetter = 'I' | 'O' | 'T' | 'S' | 'Z' | 'L' | 'J';

export interface MinoDef {
  id: string;
  name: string;
  piece: PieceLetter;
  rows: string[][];
}

export const MINOS: MinoDef[] = [
  {
    id: 'I-tube',
    piece: 'I',
    name: 'I-튜브',
    rows: [['tube:NS'], ['tube:NS'], ['tube:NS'], ['tube:NS']],
  },
  {
    id: 'I-sensor',
    piece: 'I',
    name: 'I-센서',
    rows: [['tube:NS'], ['sensor:NS'], ['tube:NS'], ['tube:NS']],
  },
  {
    id: 'T-switch',
    piece: 'T',
    name: 'T-스위치',
    rows: [
      ['tube:EW', 'switch:S,W,E', 'tube:EW'],
      ['', 'tube:NS', ''],
    ],
  },
  {
    id: 'L-tube',
    piece: 'L',
    name: 'L-튜브',
    rows: [['tube:NS', ''], ['tube:NS', ''], ['tube:NE', 'tube:EW']],
  },
  {
    id: 'J-tube',
    piece: 'J',
    name: 'J-튜브',
    rows: [['', 'tube:NS'], ['', 'tube:NS'], ['tube:EW', 'tube:NW']],
  },
  {
    id: 'S-motor',
    piece: 'S',
    name: 'S-모터(시계)',
    rows: [
      ['', 'gear', 'gear'],
      ['gear', 'motor:cw', ''],
    ],
  },
  {
    id: 'Z-motor',
    piece: 'Z',
    name: 'Z-모터(반시계)',
    rows: [
      ['gear', 'motor:ccw', ''],
      ['', 'gear', 'gear'],
    ],
  },
  {
    id: 'O-gear',
    piece: 'O',
    name: 'O-기어',
    rows: [
      ['gear', 'gear'],
      ['gear', 'gear'],
    ],
  },
];
