/**
 * 로그라이크 유물 (패시브). 재혁이 직접 고친다 — 초안.
 * 물리 규칙(햄스터·튜브·부품 동작)은 건드리지 않고 가격·돈·목숨에만 닿는다.
 * 효과 종류는 core/rogue.ts 가 읽는다: price(가격표 바꾸기), stipend(층마다 돈), interest(이월 이자), life(목숨), cash(즉시 돈).
 */
import type { PartType } from '../core/types';

export interface Relic {
  id: string;
  name: string;
  desc: string;
  /** 가격표: 미노 id 또는 'empty'(빈 미노 전부) / 부품 → 새 가격 계산 */
  price?: { minos?: 'empty'; parts?: PartType; delta: number };
  /** 층을 깰 때마다 받는 돈 */
  stipend?: number;
  /** 층을 깨고 남은 돈에 붙는 이자 (%, 올림) */
  interest?: number;
  /** 얻을 때 목숨 */
  life?: number;
  /** 얻을 때 돈 */
  cash?: number;
}

export const RELICS: Relic[] = [
  { id: 'hollow', name: '속 빈 나무', desc: '빈 미노 가격 -1 (최소 0)', price: { minos: 'empty', delta: -1 } },
  { id: 'cork', name: '코르크 마개', desc: '마개 0원', price: { parts: 'plug', delta: -99 } },
  { id: 'oil', name: '기름칠', desc: '기어 0원', price: { parts: 'gear', delta: -99 } },
  { id: 'cheap-eye', name: '싸구려 센서', desc: '센서 가격 -1', price: { parts: 'sensor', delta: -1 } },
  { id: 'allowance', name: '용돈', desc: '층을 깰 때마다 +2원', stipend: 2 },
  { id: 'piggy', name: '돼지 저금통', desc: '층을 깨고 남은 돈에 이자 20%', interest: 20 },
  { id: 'spare-wheel', name: '여분 쳇바퀴', desc: '목숨 +1', life: 1 },
  { id: 'sunflower', name: '해바라기씨 주머니', desc: '바로 +6원', cash: 6 },
];
