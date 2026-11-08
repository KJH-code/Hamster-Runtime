/**
 * 샌드박스 안의 레벨 에디터 (키보드 전용).
 *  - 레벨 설정 모드(L): ↑↓ 항목, ←→ 숫자 바꾸기, Space 켜고 끄기, Enter 글자 입력
 *  - F (미노/부품 모드): 고정 미노·부품 지정
 *  - P: 현재 배치를 참조 풀이로 저장 → 엔진 검증 → 예산 = 참조 가격 + 25% → JSON 내려받기
 *  - T: 마지막으로 저장한 레벨 시험 플레이
 */
import type { Placed } from '../core/board';
import { Editor } from '../core/editor';
import { PART_TYPES, serializeLevel, type Level } from '../core/level';
import { PART_NAMES } from '../core/parts';
import { levelFromBoard, type LevelMeta } from '../core/solution';
import { binCount } from '../core/types';
import { MINOS } from '../data/minos';
import { PRICES } from '../data/prices';
import { el } from './runner';

export interface SandboxState {
  ed: Editor;
  meta: LevelMeta;
  /** 고정 미노: "defId,rot,x,y" (되돌리기로 uid 가 바뀌어도 유지되게) */
  fixedMinos: Set<string>;
  fixedParts: Set<number>;
  saved: Level | null;
  json: string;
  result: string;
  fieldSel: number;
  /** 디버그용: 마지막 실패 */
  lastFail?: unknown;
}

export function newSandboxState(): SandboxState {
  const ed = new Editor();
  return {
    ed,
    meta: {
      id: 'new-level',
      name: '새 레벨',
      mechanic: '',
      bins: Array.from({ length: binCount(ed.board.w) }, () => ({ red: 0, blue: 0 })),
      allowed: { minos: MINOS.map((d) => d.id), parts: [...PART_TYPES] },
    },
    fixedMinos: new Set(),
    fixedParts: new Set(),
    saved: null,
    json: '',
    result: '',
    fieldSel: 0,
  };
}

export const minoKey = (p: Placed) => `${p.defId},${p.rot},${p.x},${p.y}`;

export function fixedUids(st: SandboxState): Set<number> {
  return new Set(st.ed.board.placed.filter((p) => st.fixedMinos.has(minoKey(p))).map((p) => p.uid));
}

/** 통 개수를 판 가로에 맞춘다 */
function syncBins(st: SandboxState) {
  const n = binCount(st.ed.board.w);
  while (st.meta.bins.length < n) st.meta.bins.push({ red: 0, blue: 0 });
  st.meta.bins.length = n;
}

interface Field {
  label: string;
  value: () => string;
  /** ←→ */
  adjust?: (d: number) => string | void;
  /** Space */
  toggle?: () => void;
  /** Enter */
  text?: (v: string) => void;
}

function fields(st: SandboxState): Field[] {
  syncBins(st);
  const m = st.meta;
  const ed = st.ed;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  /** 판 크기를 바꾸고 고정 부품 칸 번호를 새 가로에 맞춘다 */
  const resize = (w: number, h: number) => {
    const oldW = ed.board.w;
    const r = ed.resize(w, h);
    if (!r.ok) return r.reason;
    const moved = [...st.fixedParts].map((i) => [i % oldW, Math.floor(i / oldW)] as const);
    st.fixedParts = new Set(moved.filter(([x, y]) => ed.board.inBounds(x, y)).map(([x, y]) => ed.board.idx(x, y)));
  };
  const out: Field[] = [
    { label: 'id (파일 이름)', value: () => m.id, text: (v) => (m.id = v.trim().replace(/[^\w-]/g, '-') || m.id) },
    { label: '이름', value: () => m.name, text: (v) => (m.name = v.trim() || m.name) },
    { label: '핵심 메커니즘', value: () => m.mechanic || '(비어 있음)', text: (v) => (m.mechanic = v.trim().replace(/\s*\n\s*/g, ' ')) },
    {
      label: '가로',
      value: () => String(ed.board.w),
      adjust: (d) => resize(clamp(ed.board.w + d, 4, 16), ed.board.h),
    },
    {
      label: '세로',
      value: () => String(ed.board.h),
      adjust: (d) => resize(ed.board.w, clamp(ed.board.h + d, 4, 20)),
    },
  ];
  m.bins.forEach((b, i) => {
    out.push({ label: `통 ${i} 빨강`, value: () => String(b.red), adjust: (d) => void (b.red = clamp(b.red + d, 0, 99)) });
    out.push({ label: `통 ${i} 파랑`, value: () => String(b.blue), adjust: (d) => void (b.blue = clamp(b.blue + d, 0, 99)) });
  });
  const toggleIn = <T,>(list: T[], v: T) => {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
  };
  for (const d of MINOS)
    out.push({ label: `미노 ${d.name}`, value: () => (m.allowed.minos.includes(d.id) ? '사용 가능' : '—'), toggle: () => toggleIn(m.allowed.minos, d.id) });
  for (const t of PART_TYPES)
    out.push({ label: `부품 ${PART_NAMES[t]}`, value: () => (m.allowed.parts.includes(t) ? '사용 가능' : '—'), toggle: () => toggleIn(m.allowed.parts, t) });
  return out;
}

/** 현재 배치를 참조 풀이로 저장 (검증 → JSON) */
export function saveReference(st: SandboxState): boolean {
  syncBins(st);
  const ed = st.ed;
  const fixed = fixedUids(st);
  const queue = ed.queue.map((q) => ({ color: q.color === 0 ? ('red' as const) : ('blue' as const), inject: q.inject }));
  const r = levelFromBoard(
    ed.board,
    queue,
    structuredClone(st.meta),
    (uid) => fixed.has(uid),
    (i) => st.fixedParts.has(i),
    PRICES,
  );
  if (!r.ok) {
    let t = `✗ 저장 안 됨: ${r.reason}`;
    if (r.judgement) {
      const wrong = r.judgement.binsOk.map((ok, i) => (ok ? null : i)).filter((i) => i !== null);
      if (wrong.length) t += ` (통 ${wrong.join(', ')})`;
    }
    st.result = t;
    st.lastFail = r;
    return false;
  }
  st.saved = r.level;
  st.json = serializeLevel(r.level);
  st.result = `✓ 검증 통과 — 참조 가격 ${r.judgement.price}, 예산 ${r.level.budget}. ${r.level.id}.json 을 src/data/levels/ 에 넣으면 목록에 들어간다`;
  download(`${r.level.id}.json`, st.json);
  return true;
}

function download(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* 내려받기가 막혀도 아래 JSON 칸에서 복사할 수 있다 */
  }
}

/** 레벨 설정 모드의 키. 처리했으면 메시지(또는 '') */
export function levelModeKey(st: SandboxState, e: KeyboardEvent): string | null {
  const fs = fields(st);
  st.fieldSel = Math.max(0, Math.min(st.fieldSel, fs.length - 1));
  const f = fs[st.fieldSel]!;
  switch (e.key) {
    case 'ArrowUp':
      st.fieldSel = (st.fieldSel - 1 + fs.length) % fs.length;
      return '';
    case 'ArrowDown':
      st.fieldSel = (st.fieldSel + 1) % fs.length;
      return '';
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (!f.adjust) return '이 항목은 ←→ 로 바꾸지 않는다';
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      return f.adjust(step) ?? '';
    }
    case ' ':
      if (!f.toggle) return '이 항목은 Space 로 바꾸지 않는다';
      f.toggle();
      return '';
    case 'Enter': {
      if (!f.text) return '이 항목은 글자를 넣지 않는다';
      const v = window.prompt(f.label, f.value() === '(비어 있음)' ? '' : f.value());
      if (v !== null) f.text(v);
      return '';
    }
  }
  return null;
}

export function renderLevelPanel(st: SandboxState, box: HTMLElement) {
  box.innerHTML = '';
  const fs = fields(st);
  const list = el('div', 'editor');
  fs.forEach((f, i) => {
    const row = el('div', 'frow' + (i === st.fieldSel ? ' pick' : ''));
    row.append(el('span', 'fk', f.label), el('span', '', f.value()));
    list.append(row);
  });
  box.append(list);
  if (st.result) box.append(el('div', st.result.startsWith('✓') ? 'ok' : 'bad', st.result));
  if (st.json) {
    const ta = document.createElement('textarea');
    ta.className = 'json';
    ta.readOnly = true;
    ta.value = st.json;
    box.append(ta);
  }
  setTimeout(() => list.querySelector('.pick')?.scrollIntoView({ block: 'nearest' }), 0);
}
