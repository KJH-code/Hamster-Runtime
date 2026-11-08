/**
 * 샌드박스 — 키보드 전용. 편집은 전부 core/editor.ts, 실행은 core/hamster.ts(QueueRun).
 */
import { Editor } from '../core/editor';
import { QueueRun, type Status } from '../core/hamster';
import { computeLinks } from '../core/links';
import { PART_NAMES } from '../core/parts';
import { binCount, type Dir, type PartType } from '../core/types';
import { MINOS, PIECE_ORDER } from '../data/minos';
import { artSize, renderArt, THEME } from './art';
import type { Level } from '../core/level';
import { fixedUids, levelModeKey, minoKey as placedKey, renderLevelPanel, saveReference, type SandboxState } from './levelEditor';
import { renderHints, sizeCanvas, type Screen } from './runner';
import { markTutorialSeen, tutorialSeen } from './storage';
import { SANDBOX_TUTORIAL, Tutorial } from './tutorial';

type Mode = 'mino' | 'part' | 'queue' | 'level';
const PARTS: { type: PartType; dir?: Dir; label: string }[] = [
  { type: 'sensor', label: '센서' },
  { type: 'gear', label: '기어' },
  { type: 'motor', dir: 1, label: '모터 ↻시계' },
  { type: 'motor', dir: -1, label: '모터 ↺반시계' },
  { type: 'switch', label: '스위치' },
  { type: 'plug', label: '마개' },
];
const STATUS_TEXT: Record<Status, string> = {
  running: '이동 중',
  binned: '통',
  dead: '막다른 길 — 멈춤',
  junction: '스위치 없는 분기점 — 멈춤',
  crashed: '튕김 — 멈춤',
  out: '판 밖 — 멈춤',
  loop: '무한 루프',
};
const STEP_MS = 150;

export function startSandbox(
  root: HTMLElement,
  st: SandboxState,
  onExit: () => void,
  onTest: (level: Level) => void,
): Screen {
  const ed = st.ed;
  if (st.tut === undefined) st.tut = tutorialSeen('sandbox') ? null : new Tutorial(SANDBOX_TUTORIAL, () => markTutorialSeen('sandbox'));
  const tev = (name: string) => st.tut?.event(name);
  let mode: Mode = 'mino';
  let lastEditMode: 'mino' | 'part' = 'mino';
  let shape = 0; // PIECE_ORDER 인덱스
  const variant: Record<string, number> = {};
  let rot = 0;
  const pos = { x: 3, y: 0 };
  let partIdx = 0;
  const cursor = { x: 4, y: 6 };
  let qSel = 0;
  let run: QueueRun | null = null;
  let running = false;
  let nextStepAt = 0;
  let message = '';
  let anim = { from: { x: 0, y: -1 }, t0: 0 };
  /** 방금 끝난 햄스터를 잠깐 보여주기 (다음 마리 시작 전) */
  let finished: { sim: NonNullable<QueueRun['sim']>; color: number; until: number } | null = null;
  const gearAngle = new Map<number, number>();
  const gearTarget = new Map<number, number>();
  const pressedUntil = new Map<string, number>();

  // ---------- DOM ----------
  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const panel = el('div', 'panel');
  root.append(left, panel);
  if (window.matchMedia('(pointer: coarse)').matches)
    left.append(el('div', 'notice', '이 샌드박스는 키보드가 필요합니다. 데스크톱에서 열어 주세요.'));
  const tutBox = el('div', 'tut');
  const modeBar = el('div', 'modebar');
  left.append(tutBox, modeBar);
  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  let dims = '';
  let ctx!: CanvasRenderingContext2D;
  const fitCanvas = () => {
    const d = `${ed.board.w}x${ed.board.h}`;
    if (d === dims) return;
    dims = d;
    const [cw, ch] = artSize(ed.board);
    ctx = sizeCanvas(canvas, cw, ch);
  };
  fitCanvas();
  left.append(canvas);
  const hints = el('div', 'hints');
  const msg = el('div', 'status');
  left.append(hints, msg);

  const selBox = el('div', 'sel');
  const keysBox = el('div', 'keys');
  const keysHead = el('h2', '', '전체 키 (? 로 닫기)');
  let helpOpen = false;
  let shiftAlone = false;
  const queueBox = el('div', 'queue');
  const tallyBox = el('div', 'tally');
  const levelBox = el('div', '');
  const levelHead = el('h2', '', '레벨 설정 (L)');
  panel.append(el('h1', '', 'Hamster Runtime · 샌드박스'), el('div', 'dim', 'Esc 레벨 목록 · L 레벨 에디터'), selBox, keysHead, keysBox, levelHead, levelBox, el('h2', '', '대기열 (Tab)'), queueBox, el('h2', '', '결과'), tallyBox);

  // ---------- 상태 헬퍼 ----------
  const variantsOf = (p: string) => MINOS.filter((d) => d.piece === p);
  const currentDef = () => {
    const p = PIECE_ORDER[shape]!;
    const vs = variantsOf(p);
    return vs[(variant[p] ?? 0) % vs.length]!;
  };
  const floatingCells = () => ed.shapeOf(currentDef().id, rot);
  const fitsInside = (r: number, x: number, y: number) =>
    ed.shapeOf(currentDef().id, r).every((c) => ed.board.inBounds(x + c.x, y + c.y));

  function say(t: string) {
    message = t;
  }
  function result(r: { ok: boolean; reason?: string }, okText: string) {
    say(r.ok ? okText : `✗ ${(r as { reason: string }).reason}`);
    if (r.ok) resetRun();
  }
  function resetRun() {
    run = null;
    finished = null;
    running = false;
    gearAngle.clear();
    gearTarget.clear();
  }

  // ---------- 키 ----------
  function key(e: KeyboardEvent) {
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const ctrl = e.ctrlKey || e.metaKey;
    if (k !== 'Shift') shiftAlone = false;
    if (k === 'Escape') return handled(e, onExit);
    if (k === '?' || (lower === 'h' && mode !== 'level')) return handled(e, () => (helpOpen = !helpOpen));
    if (ctrl && lower === 'z' && !e.shiftKey) return handled(e, () => (ed.undo() ? (resetRun(), say('되돌림')) : say('되돌릴 것 없음')));
    if (ctrl && (lower === 'y' || (lower === 'z' && e.shiftKey))) return handled(e, () => (ed.redo() ? (resetRun(), say('다시 함')) : say('다시 할 것 없음')));
    if (ctrl) return;
    if (k === 'Shift') {
      if (!e.repeat) shiftAlone = true;
      return;
    }
    if (lower === 'n' && mode !== 'level')
      return handled(e, () => {
        if (st.tut?.active) st.tut.next();
        else st.tut = new Tutorial(SANDBOX_TUTORIAL, () => markTutorialSeen('sandbox'));
      });
    if (k === 'Tab') return handled(e, () => ((mode = mode === 'queue' ? lastEditMode : 'queue'), tev(`mode:${mode}`)));
    if (lower === 'l') return handled(e, () => ((mode = mode === 'level' ? lastEditMode : 'level'), tev(`mode:${mode}`)));
    if (mode === 'level') {
      if (lower === 'p') return handled(e, () => (saveReference(st), say(st.result)));
      if (lower === 't') return handled(e, () => (st.saved ? onTest(st.saved) : say('먼저 P 로 저장해서 검증하세요')));
      const r = levelModeKey(st, e);
      if (r !== null) return handled(e, () => (r ? say(r) : (resetRun(), say(''))));
      return;
    }
    if (lower === 'r') return handled(e, toggleRun);
    if (lower === 'f') return handled(e, toggleFixed);

    if (mode === 'mino') return minoKey(e, k, lower);
    if (mode === 'part') return partKey(e, k, lower);
    return queueKey(e, k, lower);
  }

  function handled(e: KeyboardEvent, f: () => void) {
    e.preventDefault();
    f();
    refresh();
  }

  /** 레벨에 미리 박을 고정 미노·부품 지정 (F) */
  function toggleFixed() {
    if (mode === 'part') {
      const i = ed.board.idx(cursor.x, cursor.y);
      if (!ed.board.parts.has(i)) return say('이 칸에 부품이 없다');
      if (st.fixedParts.delete(i)) return say('부품 고정 해제');
      st.fixedParts.add(i);
      return say('부품 고정 — 레벨에 미리 박힌다 (0원, 못 지움)');
    }
    const keys = new Set<string>();
    for (const c of floatingCells()) {
      const x = pos.x + c.x;
      const y = pos.y + c.y;
      const u = ed.board.inBounds(x, y) ? ed.board.owner[ed.board.idx(x, y)] : 0;
      const p = u ? ed.board.placed.find((q) => q.uid === u) : undefined;
      if (p) keys.add(placedKey(p));
    }
    if (!keys.size) return say('겹치는 미노가 없다');
    const allFixed = [...keys].every((k) => st.fixedMinos.has(k));
    for (const k of keys) allFixed ? st.fixedMinos.delete(k) : st.fixedMinos.add(k);
    say(allFixed ? '미노 고정 해제' : '미노 고정 — 레벨에 미리 박힌다 (0원, 못 지움)');
  }

  function minoKey(e: KeyboardEvent, k: string, lower: string) {
    const move = (dx: number, dy: number) => {
      if (fitsInside(rot, pos.x + dx, pos.y + dy)) {
        pos.x += dx;
        pos.y += dy;
      }
    };
    const rotate = (d: number) => {
      const r = (rot + d + 4) % 4;
      if (fitsInside(r, pos.x, pos.y)) rot = r;
      else say('판 밖으로 나가서 회전할 수 없음');
    };
    if (/^[1-7]$/.test(k)) return handled(e, () => {
      shape = Number(k) - 1;
      clampFloating();
    });
    if (lower === 'q' || lower === 'e') return handled(e, () => {
      const p = PIECE_ORDER[shape]!;
      const n = variantsOf(p).length;
      variant[p] = ((variant[p] ?? 0) + (lower === 'e' ? 1 : -1) + n) % n;
    });
    if (k === 'ArrowLeft') return handled(e, () => move(-1, 0));
    if (k === 'ArrowRight') return handled(e, () => move(1, 0));
    if (k === 'ArrowDown') return handled(e, () => move(0, 1));
    if (k === 'ArrowUp') return handled(e, () => move(0, -1));
    if (lower === 'x') return handled(e, () => rotate(1));
    if (lower === 'z') return handled(e, () => rotate(-1));
    if (k === ' ' || k === 'Enter')
      return handled(e, () => {
        const r = ed.placeMino(currentDef().id, rot, pos.x, pos.y);
        if (r.ok) tev('drop');
        result(r, `${currentDef().name} 놓음`);
      });
    if (k === 'Delete' || k === 'Backspace') return handled(e, () => result(ed.removeMinosOverlapping(floatingCells(), pos.x, pos.y), '미노 제거'));
  }

  function clampFloating() {
    for (let r = 0; r < 4 && !fitsInside(rot, pos.x, pos.y); r++) {
      pos.x = Math.max(0, Math.min(pos.x, ed.board.w - 1));
      pos.y = Math.max(0, Math.min(pos.y, ed.board.h - 1));
      const cells = floatingCells();
      const w = Math.max(...cells.map((c) => c.x)) + 1;
      const h = Math.max(...cells.map((c) => c.y)) + 1;
      pos.x = Math.min(pos.x, ed.board.w - w);
      pos.y = Math.min(pos.y, ed.board.h - h);
    }
  }

  function partKey(e: KeyboardEvent, k: string, lower: string) {
    const move = (dx: number, dy: number) => {
      if (ed.board.inBounds(cursor.x + dx, cursor.y + dy)) {
        cursor.x += dx;
        cursor.y += dy;
      }
    };
    if (/^[1-6]$/.test(k)) return handled(e, () => (partIdx = Number(k) - 1));
    if (k === 'ArrowLeft') return handled(e, () => move(-1, 0));
    if (k === 'ArrowRight') return handled(e, () => move(1, 0));
    if (k === 'ArrowDown') return handled(e, () => move(0, 1));
    if (k === 'ArrowUp') return handled(e, () => move(0, -1));
    if (lower === 'x' || lower === 'z') return handled(e, () => result(ed.rotateSwitch(cursor.x, cursor.y, lower === 'x' ? 1 : -1), '스위치 공통 갈래 바꿈'));
    if (lower === 'a' || lower === 'b')
      return handled(e, () => result(ed.setSwitchStart(cursor.x, cursor.y, lower.toUpperCase() as 'A' | 'B'), `시작 상태 ${lower.toUpperCase()}`));
    if (k === ' ' || k === 'Enter') return handled(e, () => {
      const p = PARTS[partIdx]!;
      const r = ed.placePart(cursor.x, cursor.y, p.type, p.dir);
      if (r.ok) tev(`part:${p.type}`);
      result(r, `${p.label} 놓음`);
    });
    if (k === 'Delete' || k === 'Backspace') return handled(e, () => result(ed.removeAt(cursor.x, cursor.y), '제거'));
  }

  function queueKey(e: KeyboardEvent, k: string, lower: string) {
    const q = ed.queue;
    if (k === 'ArrowUp') return handled(e, () => (qSel = Math.max(0, qSel - 1)));
    if (k === 'ArrowDown') return handled(e, () => (qSel = Math.min(q.length - 1, qSel + 1)));
    if (k === 'ArrowLeft' || k === 'ArrowRight')
      return handled(e, () => result(ed.queueSet(qSel, { inject: k === 'ArrowLeft' ? 'left' : 'right' }), '투입구 바꿈'));
    if (k === '1' || k === '2') return handled(e, () => result(ed.queueSet(qSel, { color: k === '1' ? 0 : 1 }), '색 바꿈'));
    if (k === ' ' || k === 'Enter')
      return handled(e, () => {
        const base = q[qSel] ?? { color: 0 as const, inject: 'left' as const };
        result(ed.queueAdd(q.length ? qSel : -1, { ...base }), '햄스터 추가');
        if (q.length > 1) qSel++;
      });
    if (k === 'Delete' || k === 'Backspace')
      return handled(e, () => {
        result(ed.queueRemove(qSel), '햄스터 삭제');
        qSel = Math.max(0, Math.min(qSel, ed.queue.length - 1));
      });
    void lower;
  }

  // ---------- 실행 ----------
  function toggleRun() {
    if (run) {
      resetRun();
      say('리셋');
      return;
    }
    if (ed.queue.length === 0) return say('대기열이 비어 있음 (Tab 으로 추가)');
    run = new QueueRun(ed.board, ed.queue.map((q) => ({ ...q })));
    running = true;
    nextStepAt = performance.now();
    anim = { from: { x: run.sim!.x, y: run.sim!.y }, t0: performance.now() };
    tev('run');
    say('실행 중 — R 로 리셋');
  }
  function stepRun(t: number) {
    const r = run!;
    const before = r.sim!;
    const from = { x: before.x, y: before.y };
    const res = r.step();
    const sim = r.sim!;
    for (const s of before.lastTriggered) pressedUntil.set(`${s.x},${s.y}`, t + 400);
    if (before.lastDrive)
      for (const [node, dir] of before.lastDrive.dirs) gearTarget.set(node, (gearTarget.get(node) ?? 0) + dir * (Math.PI / 4));
    anim = { from, t0: t };
    if (res) {
      finished = { sim: before, color: r.queue[r.results.length - 1]!.color, until: t + 700 };
      nextStepAt = t + 700;
      const n = r.results.length;
      const item = r.queue[n - 1]!;
      const color = item.color === 0 ? '빨강' : '파랑';
      if (res.status === 'loop') say(`⚠ ${n}번째(${color}) 무한 루프 감지 — 실행 중단. R 로 리셋`);
      else say(`${n}번째(${color}): ${res.status === 'binned' ? `통 ${res.bin}` : STATUS_TEXT[res.status]}`);
    }
    if (r.done) {
      running = false;
      if (!r.loop) say(`${message} · 대기열 끝 — R 로 리셋`);
    }
  }

  // ---------- 패널 ----------
  /** 지금 상황에서 쓸 키 3~4개 */
  function hintPairs(): [string, string][] {
    if (run) return [['R', '멈추고 리셋']];
    if (mode === 'mino') return [['1~7', '모양'], ['방향키', '옮기기'], ['X / Z', '회전'], ['Space', '놓기']];
    if (mode === 'part') {
      if (ed.board.partAt(cursor.x, cursor.y)?.type === 'switch') return [['A / B', '시작 방향'], ['X / Z', '공통(흰 점) 돌리기'], ['Delete', '지우기']];
      return [['방향키', '칸 고르기'], ['1~6', '부품 고르기'], ['Space', '놓기'], ['Shift', '미노로']];
    }
    if (mode === 'queue') return [['↑ ↓', '햄스터 고르기'], ['← →', '투입구'], ['1 / 2', '색'], ['Space', '추가']];
    return [['↑ ↓', '항목'], ['← → / Space', '값 바꾸기'], ['P', '참조 풀이로 저장'], ['T', '시험 플레이']];
  }

  function refresh() {
    if (st.tut) st.tut.render(tutBox);
    else tutBox.hidden = true;
    cursor.x = Math.min(cursor.x, ed.board.w - 1);
    cursor.y = Math.min(cursor.y, ed.board.h - 1);
    const modeName = mode === 'mino' ? '미노 모드' : mode === 'part' ? '부품 모드' : mode === 'queue' ? '대기열 모드' : '레벨 설정 모드';
    modeBar.innerHTML = '';
    for (const [m, label] of [['mino', '미노'], ['part', '부품'], ['queue', '대기열'], ['level', '레벨']] as const) {
      const b = el('span', 'mode' + (mode === m ? ' on' : ''), label);
      modeBar.append(b);
    }
    modeBar.append(el('span', 'dim', `  ${modeName} · ? 전체 키`));

    selBox.innerHTML = '';
    if (mode === 'mino') {
      const p = PIECE_ORDER[shape]!;
      const vs = variantsOf(p);
      selBox.append(el('div', '', `모양 ${shape + 1}:${p}  ·  변형 ${((variant[p] ?? 0) % vs.length) + 1}/${vs.length} = ${currentDef().name}`));
      selBox.append(el('div', 'dim', PIECE_ORDER.map((q, i) => `${i + 1}:${q}`).join('  ')));
    } else if (mode === 'part') {
      selBox.append(el('div', '', `부품 ${partIdx + 1}: ${PARTS[partIdx]!.label}  ·  커서 (${cursor.x},${cursor.y})`));
      selBox.append(el('div', 'dim', PARTS.map((p, i) => `${i + 1}:${p.label}`).join('  ')));
      const here = ed.board.partAt(cursor.x, cursor.y);
      if (here) selBox.append(el('div', 'dim', `이 칸: ${PART_NAMES[here.type]}${here.type === 'switch' ? ` (시작 ${here.start})` : ''}`));
    } else if (mode === 'queue') {
      selBox.append(el('div', '', `대기열 ${ed.queue.length}마리 · 선택 ${qSel + 1}번`));
    } else {
      selBox.append(el('div', '', `레벨 ${st.meta.name} (${st.meta.id}) · ${ed.board.w}×${ed.board.h}`));
      selBox.append(el('div', 'dim', `고정 미노 ${fixedUids(st).size} · 고정 부품 ${st.fixedParts.size}`));
    }
    levelHead.hidden = levelBox.hidden = mode !== 'level';
    if (mode === 'level') renderLevelPanel(st, levelBox);

    renderHints(hints, hintPairs());
    keysHead.hidden = keysBox.hidden = !helpOpen;
    keysBox.innerHTML = '';
    const rows: [string, string][] =
      mode === 'mino'
        ? [['1~7', '모양'], ['Q / E', '변형(튜브/빈) 순환'], ['방향키', '미노 이동'], ['X / Z', '회전 (시계/반시계)'], ['Space / Enter', '놓기'], ['Delete', '겹치는 미노 제거'], ['F', '겹치는 미노 고정(레벨용)']]
        : mode === 'part'
          ? [['1~6', '부품'], ['방향키', '칸 커서 이동'], ['Space / Enter', '부품 놓기'], ['X / Z', '스위치 공통 갈래 돌리기'], ['A / B', '스위치 시작 상태'], ['Delete', '부품 제거 (없으면 미노)'], ['F', '부품 고정(레벨용)']]
          : mode === 'queue'
            ? [['↑ / ↓', '햄스터 선택'], ['← / →', '투입구 왼/오'], ['1 / 2', '색 빨강/파랑'], ['Space / Enter', '선택 뒤에 추가'], ['Delete', '삭제']]
            : [['↑ / ↓', '항목 고르기'], ['← / →', '숫자 바꾸기'], ['Space', '사용 가능 켜고 끄기'], ['Enter', '글자 넣기'], ['P', '현재 배치를 참조 풀이로 저장'], ['T', '저장한 레벨 시험 플레이']];
    rows.push(['Shift', '미노 ↔ 부품 모드'], ['Tab', '대기열 모드'], ['L', '레벨 설정 모드'], ['Ctrl+Z / Ctrl+Y', '되돌리기 / 다시 하기'], ['R', '실행 / 리셋 (레벨 모드 밖)'], ['Esc', '레벨 목록'], ['? / H', '이 목록 열고 닫기'], ['N', '안내 다음 / 다시 보기']);
    for (const [key, what] of rows) {
      const r = el('div', 'krow');
      r.append(el('kbd', '', key), el('span', '', what));
      keysBox.append(r);
    }

    queueBox.innerHTML = '';
    ed.queue.forEach((q, i) => {
      const done = run ? i < run.results.length : false;
      const cur = run && !run.done && i === run.index;
      const r = el('div', 'qrow' + (mode === 'queue' && i === qSel ? ' sel' : '') + (cur ? ' cur' : '') + (done ? ' done' : ''));
      const dot = el('span', 'dot');
      dot.style.background = THEME.scarf[q.color]!;
      r.append(el('span', 'qi', `${i + 1}`), dot, el('span', '', q.inject === 'left' ? '왼쪽' : '오른쪽'));
      if (run && run.results[i]) {
        const res = run.results[i]!;
        r.append(el('span', 'dim', res.status === 'binned' ? `→ 통 ${res.bin}` : `→ ${STATUS_TEXT[res.status]}`));
      }
      queueBox.append(r);
    });
    if (!ed.queue.length) queueBox.append(el('span', 'dim', '비어 있음 — Tab 후 Space 로 추가'));

    tallyBox.innerHTML = '';
    const bins = run?.tally.bins ?? Array.from({ length: binCount(ed.board.w) }, () => [0, 0]);
    const stopped = run?.tally.stopped ?? [0, 0];
    bins.forEach((b, i) => tallyBox.append(el('div', '', `통 ${i}: 빨강 ${b[0]} · 파랑 ${b[1]}`)));
    tallyBox.append(el('div', 'dim', `멈춤: 빨강 ${stopped[0]} · 파랑 ${stopped[1]}`));
    msg.textContent = message || '시작: 1~7 로 모양, 방향키로 옮기고 Space 로 놓기';
  }

  // ---------- 루프 ----------
  let last = performance.now();
  let alive = true;
  function frame(t: number) {
    if (!alive) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (running && run && !run.done && t >= nextStepAt) {
      nextStepAt = t + STEP_MS;
      stepRun(t);
      refresh();
    }
    if (finished && t >= finished.until && !(run?.done)) {
      finished = null;
      if (run?.sim) anim = { from: { x: run.sim.x, y: run.sim.y }, t0: t };
    }
    for (const [node, target] of gearTarget) {
      const cur = gearAngle.get(node) ?? 0;
      gearAngle.set(node, cur + (target - cur) * (1 - Math.exp(-dt * 14)));
    }
    const sim = run?.sim ?? null;
    const links = sim?.links ?? computeLinks(ed.board);
    let hamster = null;
    const shown = finished?.sim ?? sim;
    if (run && shown) {
      const e = Math.min(1, (t - anim.t0) / STEP_MS);
      const color = finished ? finished.color : run.queue[Math.min(run.index, run.queue.length - 1)]!.color;
      const visible = shown.status === 'running' || finished !== null || run.loop;
      if (visible)
        hamster = {
          x: anim.from.x + (shown.x - anim.from.x) * e,
          y: anim.from.y + ((shown.status === 'binned' ? ed.board.h + 0.3 : shown.y) - anim.from.y) * e,
          color,
          shake: shown.status === 'crashed' || shown.status === 'dead' || shown.status === 'junction' ? Math.sin(t / 25) * 3 : 0,
        };
    }
    const pressed = new Set<string>();
    for (const [k, until] of pressedUntil) if (until > t) pressed.add(k);
    fitCanvas();
    renderArt(ctx, THEME, {
      fixedUids: fixedUids(st),
      board: ed.board,
      links,
      switchState: (x, y) => sim?.switchStateAt(x, y) ?? ed.board.partAt(x, y)?.start,
      locked: (x, y) => sim?.isCellLocked(x, y) ?? false,
      gearAngle: (x, y) => {
        const n = sim?.nodeOfCell.get(ed.board.idx(x, y));
        return n === undefined ? 0 : (gearAngle.get(n) ?? 0);
      },
      switchTurn: (x, y) => {
        const n = sim?.nodeOfCell.get(ed.board.idx(x, y));
        return n === undefined ? 0 : ((gearAngle.get(n) ?? 0) - (gearTarget.get(n) ?? 0)) * 2;
      },
      pressed,
      floating: mode === 'mino' && !run ? { cells: floatingCells(), x: pos.x, y: pos.y, ok: ed.board.canPlace(floatingCells(), pos.x, pos.y) } : null,
      cursor: mode === 'part' && !run ? cursor : null,
      hamster,
      nextInject: run && !run.done ? run.queue[run.index]!.inject : ed.queue[0]?.inject ?? null,
      bins: run?.tally.bins ?? [],
      ghost: null,
      goals: null,
      blink: Math.floor(t / 400) % 2 === 0,
    });
    requestAnimationFrame(frame);
  }

  refresh();
  requestAnimationFrame(frame);

  // 테스트 훅 (Playwright 검증용)
  (window as unknown as { __hamster: unknown }).__hamster = {
    screen: 'sandbox',
    ed,
    st,
    get run() {
      return run;
    },
    get mode() {
      return mode;
    },
    get pos() {
      return { ...pos, rot, def: currentDef().id };
    },
    get cursor() {
      return { ...cursor };
    },
  };
  return {
    key,
    keyUp(e: KeyboardEvent) {
      if (e.key !== 'Shift' || !shiftAlone) return;
      shiftAlone = false;
      mode = mode === 'mino' ? 'part' : mode === 'part' ? 'mino' : lastEditMode === 'mino' ? 'part' : 'mino';
      lastEditMode = mode as 'mino' | 'part';
      tev(`mode:${mode}`);
      refresh();
    },
    dispose() {
      alive = false;
    },
  };
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
