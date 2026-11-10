/**
 * 로그라이크 (무한 층). 순수 로직: 런 상태와 층 생성, 보상, 돈·목숨 계산. 화면은 ui/rogue.ts.
 * - 덱: 가진 미노 종류·부품 종류만 쓸 수 있다 (개수 제한 없음). 시작 = I·L·J 튜브 + O 빈
 * - 층: 덱으로 풀리게 자동 생성 (core/daily.ts 의 생성기). 층이 오를수록 판·미노·햄스터가 늘고 6층부터 양쪽 투입구.
 *   스위치·센서·모터·기어를 다 가지면 3층마다 기계 층 (길·받침은 고정, 부품만 놓는다)
 * - 돈: 층 예산 = 참조 가격 × 배율 (올림) + 지갑. 배율은 1층 1.5 → 11층 1.1 → 이후 층마다 -0.02, 최저 0.85
 *   (뒤로 갈수록 모아 둔 돈을 써야 한다 — 모의 런: 보통 15층, 고수 40~50층에서 끝). 깨면 남은 돈이 지갑으로 (유물: 용돈·이자)
 * - 기계 층의 절반은 색 나누기 (통마다 한 색만)
 * - 목숨 3: 층 포기 = 목숨 -1, 다음 층으로. 0 이면 끝
 * - 보상: 층을 깨면 3개(미노 / 부품 / 유물) 중 하나
 * 같은 씨앗 + 같은 선택이면 같은 런 (친구와 씨앗 공유, 주간 런).
 */
import type { PriceTable } from '../data/prices';
import { MINOS } from '../data/minos';
import { RELICS } from '../data/relics';
import { machineOnce, rngFrom, stackOnce } from './daily';
import type { Level } from './level';
import type { PartType } from './types';

export const START_MINOS = ['I-tube', 'L-tube', 'J-tube', 'O-empty'];
export const START_LIVES = 3;
const MACHINE_PARTS: PartType[] = ['switch', 'sensor', 'motor', 'gear'];
const ALL_PART_TYPES: PartType[] = ['plug', 'switch', 'sensor', 'motor', 'gear'];

export type Reward = { kind: 'mino'; id: string } | { kind: 'part'; type: PartType } | { kind: 'relic'; id: string };

export interface RunState {
  v: 1;
  seed: string;
  /** 1층부터 */
  floor: number;
  lives: number;
  wallet: number;
  minos: string[];
  parts: PartType[];
  relics: string[];
  /** play = 층 풀기 전, reward = 보상 고르기, over = 끝 */
  phase: 'play' | 'reward' | 'over';
  offer: Reward[];
  /** 깬 층 수 */
  cleared: number;
}

export function newRun(seed: string): RunState {
  return { v: 1, seed, floor: 1, lives: START_LIVES, wallet: 0, minos: [...START_MINOS], parts: [], relics: [], phase: 'play', offer: [], cleared: 0 };
}

/** 주간 런 씨앗: ISO 주 (월요일 시작) */
export function weeklySeed(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 월=0
  d.setUTCDate(d.getUTCDate() - day + 3); // 그 주 목요일
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `week-${year}-W${String(week).padStart(2, '0')}`;
}

const relic = (id: string) => RELICS.find((r) => r.id === id);

/** 층 예산 배율 */
export function budgetMul(floor: number): number {
  const m = floor <= 11 ? 1.5 - 0.04 * (floor - 1) : Math.max(0.85, 1.1 - 0.02 * (floor - 11));
  return Math.round(m * 100) / 100;
}

/** 유물로 바뀐 가격표 */
export function runPrices(st: RunState, base: PriceTable): PriceTable {
  const p: PriceTable = { minos: { ...base.minos }, parts: { ...base.parts } };
  for (const id of st.relics) {
    const e = relic(id)?.price;
    if (!e) continue;
    if (e.minos === 'empty') for (const m of Object.keys(p.minos)) if (m.endsWith('empty')) p.minos[m] = Math.max(0, p.minos[m]! + e.delta);
    if (e.parts) p.parts[e.parts] = Math.max(0, p.parts[e.parts] + e.delta);
  }
  return p;
}

/** 이번 층 레벨. budget 에는 지갑이 이미 더해져 있다 (base = 층 예산만) */
export function floorLevel(st: RunState, base: PriceTable): { level: Level; floorBudget: number; machine: boolean } {
  const prices = runPrices(st, base);
  const f = st.floor;
  const id = `rogue-${st.seed}-${f}`;
  const rand = rngFrom(`${id}-${st.minos.join(',')}-${st.parts.join(',')}`);
  const machine = MACHINE_PARTS.every((t) => st.parts.includes(t)) && f % 3 === 0;
  const allowed = { minos: [...st.minos], parts: [...st.parts] };
  const tubes = st.minos.filter((m) => m.includes('tube'));
  const empties = st.minos.filter((m) => m.endsWith('empty'));
  const step = (k: number, cap: number) => Math.min(cap, Math.floor(f / k));
  // 6층부터 절반은 양쪽 투입구 (층마다 한 번 정한다)
  const two = f >= 6 && rand() < 0.5;
  const sortColors = machine && rand() < 0.5;
  let lv: Level | null = null;
  for (let k = 0; k < 6000 && !lv; k++) {
    // 오래 못 찾으면 한 단계씩 쉽게
    const ease = Math.floor(k / 1500);
    if (machine)
      lv = machineOnce(rand, id, prices, { name: sortColors ? `${f}층 · 색 나누기` : `${f}층 · 기계`, name2: sortColors ? `${f}층 · 두 단 색 나누기` : `${f}층 · 두 단 기계`, fixAll: true, twoProb: f >= 9 ? 0.5 : 0.2, q: [4 + step(6, 2), 3], allowed, budgetMul: budgetMul(f), colorSort: sortColors });
    else
      lv = stackOnce(rand, id, prices, {
        name: `${f}층`,
        mechanic: '가진 미노로 투입구에서 목표 통까지 길을 잇는다. 남긴 돈은 다음 층으로.',
        tubes,
        empties,
        // 양쪽 투입구 층은 길이 둘이라 길마다 미노를 적게
        w: two && ease < 2 ? [8, 2] : [7 + Math.max(0, step(3, 3) - ease), 2],
        h: two && ease < 2 ? [9, 2] : [8 + Math.max(0, step(4, 2) - ease), 2],
        n: two && ease < 2 ? [2, 2] : [2 + Math.max(0, step(3, 3) - ease), 2],
        q: [2 + step(4, 3), 2],
        inlets: two && ease < 2 ? 2 : 1,
        allowed,
        budgetMul: budgetMul(f),
        smart: true,
      });
  }
  if (!lv) throw new Error(`${f}층을 만들지 못했다`);
  const floorBudget = lv.budget;
  lv.budget = floorBudget + st.wallet;
  return { level: lv, floorBudget, machine };
}

/** 보상 세 개: 미노 / 부품 / 유물 (없으면 다른 종류로 채움). 층마다 정해진 씨앗 */
export function drawRewards(st: RunState): Reward[] {
  const rand = rngFrom(`rogue-${st.seed}-reward-${st.floor}`);
  const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs.splice(Math.floor(rand() * xs.length), 1)[0] : undefined);
  const minos = MINOS.map((d) => d.id).filter((id) => !st.minos.includes(id));
  const parts = ALL_PART_TYPES.filter((t) => !st.parts.includes(t));
  const relics = RELICS.map((r) => r.id).filter((id) => !st.relics.includes(id));
  const out: Reward[] = [];
  const m = pick(minos);
  if (m) out.push({ kind: 'mino', id: m });
  const p = pick(parts);
  if (p) out.push({ kind: 'part', type: p });
  const r = pick(relics);
  if (r) out.push({ kind: 'relic', id: r });
  while (out.length < 3) {
    const more = pick(minos);
    if (more) out.push({ kind: 'mino', id: more });
    else {
      const rr = pick(relics);
      if (!rr) break;
      out.push({ kind: 'relic', id: rr });
    }
  }
  return out;
}

/** 층을 깼다: 남은 돈 → 지갑 (+ 이자, 용돈), 다음 층, 보상 고르기 */
export function clearFloor(st: RunState, price: number, levelBudget: number): RunState {
  let wallet = Math.max(0, levelBudget - price);
  for (const id of st.relics) {
    const r = relic(id);
    if (r?.interest) wallet += Math.ceil((wallet * r.interest) / 100);
  }
  for (const id of st.relics) wallet += relic(id)?.stipend ?? 0;
  const next: RunState = { ...st, wallet, floor: st.floor + 1, cleared: st.cleared + 1, phase: 'reward', offer: [] };
  next.offer = drawRewards(st);
  return next;
}

/** 층 포기: 목숨 -1, 다음 층 (지갑은 그대로) */
export function skipFloor(st: RunState): RunState {
  const lives = st.lives - 1;
  return { ...st, lives, floor: st.floor + 1, phase: lives <= 0 ? 'over' : 'play', offer: [] };
}

export function pickReward(st: RunState, i: number): RunState {
  const r = st.offer[i];
  const next: RunState = { ...st, minos: [...st.minos], parts: [...st.parts], relics: [...st.relics], phase: 'play', offer: [] };
  if (!r) return next;
  if (r.kind === 'mino') next.minos.push(r.id);
  if (r.kind === 'part') next.parts.push(r.type);
  if (r.kind === 'relic') {
    next.relics.push(r.id);
    const rl = relic(r.id);
    next.lives += rl?.life ?? 0;
    next.wallet += rl?.cash ?? 0;
  }
  return next;
}

/** 저장된 런 읽기 (깨졌으면 null) */
export function parseRun(raw: unknown): RunState | null {
  const r = raw as Partial<RunState> | null;
  if (!r || r.v !== 1 || typeof r.seed !== 'string' || typeof r.floor !== 'number' || typeof r.lives !== 'number' || typeof r.wallet !== 'number') return null;
  if (!Array.isArray(r.minos) || !Array.isArray(r.parts) || !Array.isArray(r.relics) || !Array.isArray(r.offer)) return null;
  if (r.phase !== 'play' && r.phase !== 'reward' && r.phase !== 'over') return null;
  return r as RunState;
}
