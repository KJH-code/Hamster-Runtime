/**
 * 미노 목록 (데이터). 재혁이 여기서 직접 고친다.
 *
 * 미노는 "튜브 경로"만 맡는다. 기능(센서·기어·모터·스위치·마개)은 미노 칸 위에 놓는 부품이 맡는다.
 *
 * rows: 한 줄 = 한 행, 한 글자 = 한 칸
 *   ' '   이 자리는 미노가 아님
 *   'e'   빈칸 (튜브 없음. 모터는 여기에만 놓을 수 있다)
 *   '1'~'9'  튜브. 숫자 순서대로 이어지는 하나의 경로. 이웃한 번호끼리 상하좌우로 붙어 있어야 한다
 * 경로의 양 끝(가장 작은 번호와 가장 큰 번호) 칸만 밖으로 이어진다(자동 연결).
 * piece: 테트로미노 글자. 같은 글자 = 같은 숫자 키, 변형은 Q/E 로 순환.
 * 뒤집기(거울)는 없다. 모양은 테트로미노 7종이어야 한다 (테스트가 검사).
 */
export type PieceLetter = 'I' | 'O' | 'T' | 'S' | 'Z' | 'L' | 'J';

export interface MinoDef {
  id: string;
  name: string;
  piece: PieceLetter;
  rows: string[];
}

/** 숫자 키 1~7 순서 */
export const PIECE_ORDER: PieceLetter[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

export const MINOS: MinoDef[] = [
  { id: 'I-tube', name: 'I 튜브', piece: 'I', rows: ['1', '2', '3', '4'] },
  { id: 'I-empty', name: 'I 빈', piece: 'I', rows: ['e', 'e', 'e', 'e'] },

  { id: 'O-tube', name: 'O U자', piece: 'O', rows: ['14', '23'] },
  { id: 'O-empty', name: 'O 빈', piece: 'O', rows: ['ee', 'ee'] },

  { id: 'T-tube-a', name: 'T ㄱ', piece: 'T', rows: ['12e', ' 3 '] },
  { id: 'T-tube-b', name: 'T ㄴ', piece: 'T', rows: ['e21', ' 3 '] },
  { id: 'T-empty', name: 'T 빈', piece: 'T', rows: ['eee', ' e '] },

  { id: 'S-tube', name: 'S 튜브', piece: 'S', rows: [' 34', '12 '] },
  { id: 'S-empty', name: 'S 빈', piece: 'S', rows: [' ee', 'ee '] },

  { id: 'Z-tube', name: 'Z 튜브', piece: 'Z', rows: ['12 ', ' 34'] },
  { id: 'Z-empty', name: 'Z 빈', piece: 'Z', rows: ['ee ', ' ee'] },

  { id: 'L-tube', name: 'L 튜브', piece: 'L', rows: ['1 ', '2 ', '34'] },
  { id: 'L-empty', name: 'L 빈', piece: 'L', rows: ['e ', 'e ', 'ee'] },

  { id: 'J-tube', name: 'J 튜브', piece: 'J', rows: [' 1', ' 2', '43'] },
  { id: 'J-empty', name: 'J 빈', piece: 'J', rows: [' e', ' e', 'ee'] },
];
