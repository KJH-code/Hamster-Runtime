/**
 * 규칙 테스트 전용 미노 목록 — 2026-11-07 시점 src/data/minos.ts 의 복사본.
 * 규칙(기어·햄스터·SRS·쌓기) 테스트는 이 목록을 쓴다. 그래서 재혁이 src/data/minos.ts 를
 * 바꿔도 규칙 테스트는 깨지지 않는다. 규칙 자체를 바꿀 때만 이 파일을 고친다.
 */
import type { MinoDef } from '../../src/data/minos';

export const RULE_MINOS: MinoDef[] = [
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
