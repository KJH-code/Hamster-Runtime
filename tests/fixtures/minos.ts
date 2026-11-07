/**
 * 규칙 테스트 전용 미노 목록 — 1차 재설계(2026-11-07) 시점 src/data/minos.ts 의 복사본.
 * 규칙 테스트는 이 목록을 쓴다. 재혁이 src/data/minos.ts 를 바꿔도 규칙 테스트는 깨지지 않는다.
 */
import type { MinoDef } from '../../src/data/minos';

export const RULE_MINOS: MinoDef[] = [
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
