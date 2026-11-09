/**
 * 풀이 공유 코드. 순수 로직.
 * 코드 = 레벨 id + 떨어뜨린 미노(순서) + 부품 (+ 힌트를 썼으면 표시) → 짧은 문자열 (base64url).
 * 받는 쪽은 코드를 믿지 않고 엔진(verifyLayout)으로 다시 돌려 클리어·가격을 확인한다.
 */
import type { MinoDef } from '../data/minos';
import { MINOS } from '../data/minos';
import type { PriceTable } from '../data/prices';
import { PART_TYPES, verifyLayout, type Judgement, type Layout, type Level, type LevelPart, type SideName } from './level';
import type { SwitchState } from './types';

const VERSION = 1;
const PART_CODE: Record<string, string> = { sensor: 's', gear: 'g', motor: 'm', switch: 'w', plug: 'p' };
const CODE_PART: Record<string, LevelPart['type']> = { s: 'sensor', g: 'gear', m: 'motor', w: 'switch', p: 'plug' };

/** UTF-8 문자열 ↔ base64url (브라우저·Node 둘 다) */
function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShare(levelId: string, layout: Layout, hinted = false): string {
  const minos = layout.minos.map((m) => [m.id, m.r, m.x, m.y]);
  const parts = layout.parts.map((p) => {
    let extra = '';
    if (p.type === 'motor') extra = p.dir === 'ccw' ? '-' : '+';
    if (p.type === 'switch') extra = `${p.common ?? 'N'}${p.start ?? 'A'}`;
    return [p.x, p.y, PART_CODE[p.type]! + extra];
  });
  // 힌트 표시는 끝에 1 을 붙인다 (없으면 예전 코드와 같은 모양)
  return toB64(JSON.stringify(hinted ? [VERSION, levelId, minos, parts, 1] : [VERSION, levelId, minos, parts]));
}

export interface Shared {
  levelId: string;
  layout: Layout;
  /** 이 풀이를 만들 때 힌트(미노·부품 자리)를 봤는가 */
  hinted: boolean;
}

/** 코드 → 레벨 id + 배치. 깨졌으면 이유와 함께 throw */
export function decodeShare(code: string): Shared {
  let raw: unknown;
  try {
    raw = JSON.parse(fromB64(code.trim()));
  } catch {
    throw new Error('풀이 코드를 읽을 수 없다');
  }
  const bad = (why: string): never => {
    throw new Error(`풀이 코드가 이상하다: ${why}`);
  };
  if (!Array.isArray(raw) || (raw.length !== 4 && raw.length !== 5)) bad('모양');
  const [v, levelId, minos, parts, hintFlag] = raw as unknown[];
  if (v !== VERSION) bad(`버전 ${String(v)}`);
  if (typeof levelId !== 'string') bad('레벨');
  if (!Array.isArray(minos) || !Array.isArray(parts)) bad('목록');
  const int = (n: unknown) => typeof n === 'number' && Number.isInteger(n);
  const layout: Layout = { minos: [], parts: [] };
  for (const m of minos as unknown[]) {
    if (!Array.isArray(m) || typeof m[0] !== 'string' || !int(m[1]) || !int(m[2]) || !int(m[3])) bad('미노');
    const [id, r, x, y] = m as [string, number, number, number];
    layout.minos.push({ id, r: ((r % 4) + 4) % 4, x, y });
  }
  for (const p of parts as unknown[]) {
    if (!Array.isArray(p) || !int(p[0]) || !int(p[1]) || typeof p[2] !== 'string') bad('부품');
    const [x, y, s] = p as [number, number, string];
    const type = CODE_PART[s[0] ?? ''];
    if (!type || !PART_TYPES.includes(type)) bad(`부품 종류 ${s}`);
    const lp: LevelPart = { x, y, type: type! };
    if (type === 'motor') lp.dir = s[1] === '-' ? 'ccw' : 'cw';
    if (type === 'switch') {
      const c = s[1] as SideName;
      const st = s[2] as SwitchState;
      if (!'NESW'.includes(c) || (st !== 'A' && st !== 'B')) bad('스위치');
      lp.common = c;
      lp.start = st;
    }
    layout.parts.push(lp);
  }
  return { levelId: levelId as string, layout, hinted: hintFlag === 1 };
}

export type ShareCheck =
  | { ok: true; level: Level; layout: Layout; judgement: Judgement; hinted: boolean }
  | { ok: false; reason: string; level?: Level; layout?: Layout; judgement?: Judgement };

/** 코드를 풀고 엔진으로 다시 돌려 확인 (가격은 코드가 아니라 판에서 다시 센다) */
export function checkShare(code: string, levels: Level[], prices: PriceTable, defs: MinoDef[] = MINOS): ShareCheck {
  let sh: Shared;
  try {
    sh = decodeShare(code);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const level = levels.find((l) => l.id === sh.levelId);
  if (!level) return { ok: false, reason: `없는 레벨: ${sh.levelId}` };
  for (const m of sh.layout.minos) if (!defs.some((d) => d.id === m.id)) return { ok: false, reason: `없는 미노: ${m.id}`, level };
  const r = verifyLayout(level, sh.layout, prices, defs);
  if (r.error) return { ok: false, reason: r.error, level, layout: sh.layout };
  const j = r.judgement!;
  if (!j.clear) {
    const why = j.loop ? '무한 루프' : !j.binsOk.every(Boolean) ? '통 조건이 맞지 않는다' : `예산 초과 (${j.price} > ${level.budget})`;
    return { ok: false, reason: why, level, layout: sh.layout, judgement: j };
  }
  return { ok: true, level, layout: sh.layout, judgement: j, hinted: sh.hinted };
}

/** 링크 해시(#s=...)에서 코드 꺼내기 */
export function shareFromHash(hash: string): string | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1]! : null;
}
