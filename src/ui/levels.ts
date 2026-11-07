import { Board, findDef } from '../core/board';
import { Simulation, type Status } from '../core/hamster';
import { buildLevelBoard, gradeLevel, type CaseResult, type Expect, type Level } from '../core/level';
import { srsPiece } from '../core/srs';
import { Stack } from '../core/stack';
import { binCount, type SwitchState } from '../core/types';
import { MINOS } from '../data/minos';
import { LEVELS } from '../data/levels';
import { canvasSize, cellAt, drawCell, render } from './render';

const FAIL_TEXT: Record<string, string> = {
  dead: '막다른 길',
  crashed: '튕김',
  out: '판 밖',
  loop: '루프',
  any: '아무 실패',
};
function expectText(e: Expect): string {
  return 'bin' in e ? `통 ${e.bin}` : `실패(${FAIL_TEXT[e.fail]})`;
}
function resultText(status: Status, bin: number | null): string {
  return status === 'binned' ? `통 ${bin}` : `실패(${FAIL_TEXT[status] ?? status})`;
}

export function startLevels(root: HTMLElement, isActive: () => boolean) {
  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const panel = el('div', 'panel');
  root.append(left, panel);

  // 레벨 고르기
  const pick = el('div', 'row levelpick');
  left.append(pick);
  const title = el('h1', '');
  const desc = el('p', 'desc');
  const status = el('div', 'status');
  left.append(title, desc, status);

  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  const ctx = canvas.getContext('2d')!;
  left.append(canvas);

  const ctrl = el('div', 'row pad');
  left.append(ctrl);
  const supplyTitle = el('h2', '', '공급 (눌러서 꺼내기)');
  const supplyBox = el('div', 'palette');
  left.append(supplyTitle, supplyBox);

  panel.append(el('h2', '', '테스트'));
  const testRow = el('div', 'row');
  panel.append(testRow);
  const resultBox = el('div', 'results');
  panel.append(resultBox);
  panel.append(
    el(
      'p',
      'help',
      '←→ 이동 · ↓ 한 칸 내리기 · Space 끝까지 내리고 고정 · ↑/X 시계 · Z 반시계 · Ctrl+Z 무르기. ' +
        '미노는 저절로 떨어지지 않습니다. 바닥이나 다른 미노에 닿고 1초가 지나면 고정됩니다(움직이면 다시 1초, 최대 15번). ' +
        '내가 놓은 스위치 칸을 누르면 시작 상태 A/B 를 바꿀 수 있습니다. 고정 스위치의 상태는 케이스가 정합니다.',
    ),
  );

  let level: Level = LEVELS[0]!;
  let board: Board = buildLevelBoard(level);
  let stack = new Stack(board, level.supply);
  let fixedSwitches = new Set<number>();
  const playerSwitches = new Map<number, SwitchState>();
  let results: CaseResult[] | null = null;
  let cw = 0;

  // 재생 상태
  let replay: {
    caseIdx: number;
    hIdx: number;
    sim: Simulation;
    switches: Map<number, SwitchState>;
    locked: Set<number>;
    nextAt: number;
    prev: { x: number; y: number };
    t0: number;
  } | null = null;
  const STEP_MS = 220;

  const btn = (text: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = cls;
    b.onclick = onClick;
    return b;
  };

  for (const l of LEVELS) pick.append(btn(l.title, () => loadLevel(l)));

  const now = () => performance.now();
  ctrl.append(
    btn('◀', () => act(() => stack.move(-1, now()))),
    btn('▶', () => act(() => stack.move(1, now()))),
    btn('↺', () => act(() => stack.rotate(-1, now()))),
    btn('↻', () => act(() => stack.rotate(1, now()))),
    btn('▼', () => act(() => stack.softDrop(now()))),
    btn('⤓ 고정', () => act(() => stack.hardDrop()), 'primary'),
    btn('무르기', () => act(() => stack.undo())),
    btn('처음부터', () => loadLevel(level), 'danger'),
  );
  testRow.append(btn('▶ 테스트', () => runTests(), 'primary'));

  function act(f: () => boolean) {
    stopReplay();
    if (f()) {
      results = null;
      refresh();
    }
  }

  function loadLevel(l: Level) {
    level = l;
    board = buildLevelBoard(l);
    stack = new Stack(board, l.supply);
    fixedSwitches = new Set();
    for (let y = 0; y < board.h; y++)
      for (let x = 0; x < board.w; x++) if (board.at(x, y)?.kind === 'switch') fixedSwitches.add(board.idx(x, y));
    playerSwitches.clear();
    results = null;
    replay = null;
    const [w, h] = canvasSize(board);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.aspectRatio = `${w} / ${h}`;
    canvas.style.maxWidth = `${w}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = w;
    title.textContent = l.title;
    desc.textContent = l.description;
    setStatus('공급에서 미노를 골라 꺼내세요');
    pick.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.textContent === l.title));
    refresh();
  }

  function setStatus(t: string) {
    status.textContent = t;
  }

  function spawn(id: string) {
    stopReplay();
    if (stack.active) return setStatus('떨어지는 중인 미노를 먼저 놓으세요');
    if (!stack.spawn(id, now())) return setStatus('꺼낼 수 없습니다 (공급이 없거나 맨 위가 막혀 있음)');
    results = null;
    setStatus(`${findDef(id).name} — 내려서 놓으세요`);
    refresh();
  }

  function refresh() {
    supplyBox.innerHTML = '';
    for (const [id, n] of stack.supply) {
      const def = MINOS.find((m) => m.id === id);
      if (!def) continue;
      const b = document.createElement('button');
      b.className = 'pal';
      b.disabled = n <= 0 || !!stack.active;
      const cv = document.createElement('canvas');
      cv.width = 112;
      cv.height = 112;
      const c = cv.getContext('2d')!;
      const cells = srsPiece(def).states[0]!;
      const n4 = srsPiece(def).n;
      const sz = Math.floor(104 / n4);
      const off = (112 - n4 * sz) / 2;
      for (const q of cells) drawCell(c, q.cell, off + q.x * sz, off + q.y * sz, sz, { switchState: 'A' });
      b.append(cv, el('span', '', `${def.name} ×${n}`));
      b.onclick = () => spawn(id);
      supplyBox.append(b);
    }
    renderResults();
  }

  function runTests() {
    stopReplay();
    if (stack.active) return setStatus('떨어지는 중인 미노를 먼저 놓으세요');
    const g = gradeLevel(level, board, playerSwitches);
    results = g.cases;
    const used = stack.history.length;
    setStatus(g.ok ? `클리어! (미노 ${used}개 사용)` : `실패 — ${g.cases.filter((c) => !c.ok).length}개 케이스 틀림`);
    renderResults();
  }

  function renderResults() {
    resultBox.innerHTML = '';
    level.cases.forEach((c, ci) => {
      const r = results?.[ci];
      const box = el('div', 'case' + (r ? (r.ok ? ' ok' : ' bad') : ''));
      const head = el('div', 'casehead');
      head.append(el('b', '', `${r ? (r.ok ? '✓' : '✗') : '·'} ${c.name}`));
      if (c.switches?.length) head.append(el('span', 'dim', ' 시작 ' + c.switches.map((s) => s.state).join(',')));
      head.append(btn('재생', () => startReplay(ci)));
      box.append(head);
      c.hamsters.forEach((h, hi) => {
        const hr = r?.hamsters[hi];
        const line = `${hi + 1}. ${h.inject === 'left' ? '왼쪽' : '오른쪽'} → 기대 ${expectText(h.expect)}` + (hr ? ` · 결과 ${resultText(hr.status, hr.bin)} ${hr.ok ? '✓' : '✗'}` : '');
        box.append(el('div', 'hline' + (hr ? (hr.ok ? ' ok' : ' bad') : ''), line));
      });
      resultBox.append(box);
    });
  }

  // ---------- 재생 ----------
  function caseStartSwitches(ci: number) {
    const m = new Map(playerSwitches);
    for (const s of level.cases[ci]!.switches ?? []) m.set(board.idx(s.x, s.y), s.state);
    return m;
  }
  function startReplay(ci: number) {
    if (stack.active) return setStatus('떨어지는 중인 미노를 먼저 놓으세요');
    const switches = caseStartSwitches(ci);
    const h = level.cases[ci]!.hamsters[0]!;
    const sim = new Simulation(board, { inject: h.inject, switches, locked: new Set() });
    replay = { caseIdx: ci, hIdx: 0, sim, switches, locked: new Set(), nextAt: now() + 300, prev: { x: sim.x, y: sim.y }, t0: now() };
    setStatus(`재생: ${level.cases[ci]!.name} — 1번째 햄스터`);
  }
  function stopReplay() {
    replay = null;
  }
  function stepReplay(t: number) {
    const r = replay!;
    if (t < r.nextAt) return;
    if (r.sim.status === 'running') {
      r.prev = { x: r.sim.x, y: r.sim.y };
      r.t0 = t;
      r.sim.step();
      r.nextAt = t + STEP_MS;
      if (r.sim.status !== 'running') {
        const c = level.cases[r.caseIdx]!;
        const h = c.hamsters[r.hIdx]!;
        setStatus(`재생: ${c.name} — ${r.hIdx + 1}번째: ${resultText(r.sim.status, r.sim.bin)} (기대 ${expectText(h.expect)})`);
        r.nextAt = t + 900;
      }
      return;
    }
    // 다음 햄스터
    const c = level.cases[r.caseIdx]!;
    if (r.hIdx + 1 >= c.hamsters.length) {
      replay = null;
      return;
    }
    const sw = new Map<number, SwitchState>();
    for (const [node, st] of r.sim.switches) {
      const p = r.sim.nodeCells[node]!;
      sw.set(board.idx(p.x, p.y), st);
    }
    const locked = new Set(r.sim.locked);
    r.hIdx++;
    r.sim = new Simulation(board, { inject: c.hamsters[r.hIdx]!.inject, switches: sw, locked });
    r.prev = { x: r.sim.x, y: r.sim.y };
    r.t0 = t;
    r.nextAt = t + 300;
    setStatus(`재생: ${c.name} — ${r.hIdx + 1}번째 햄스터`);
  }

  // ---------- 입력 ----------
  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    const t = now();
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) {
      e.preventDefault();
      return act(() => stack.undo());
    }
    if (k === 'ArrowLeft') act(() => stack.move(-1, t));
    else if (k === 'ArrowRight') act(() => stack.move(1, t));
    else if (k === 'ArrowDown') act(() => stack.softDrop(t));
    else if (k === 'ArrowUp' || k === 'x' || k === 'X') act(() => stack.rotate(1, t));
    else if (k === 'z' || k === 'Z') act(() => stack.rotate(-1, t));
    else if (k === ' ') act(() => stack.hardDrop());
    else return;
    e.preventDefault();
  });
  canvas.addEventListener('click', (e) => {
    if (stack.active) return;
    const r = canvas.getBoundingClientRect();
    const k = cw / r.width;
    const p = cellAt(board, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
    if (!p || board.at(p.x, p.y)?.kind !== 'switch') return;
    const i = board.idx(p.x, p.y);
    if (fixedSwitches.has(i)) return setStatus('고정 스위치의 시작 상태는 케이스가 정합니다');
    playerSwitches.set(i, playerSwitches.get(i) === 'B' ? 'A' : 'B');
    results = null;
    stopReplay();
    refresh();
  });

  // ---------- 루프 ----------
  function frame(t: number) {
    if (isActive()) {
      if (stack.tick(t)) {
        setStatus('고정됨 — 다음 미노를 고르세요');
        refresh();
      }
      if (replay) stepReplay(t);
      const a = stack.active;
      const ghostCells = (p: { defId: string; r: number; x: number; y: number }, ok = true) => ({
        cells: stack.cellsOf(p),
        x: p.x,
        y: p.y,
        ok,
      });
      const g = stack.ghost();
      let hamster = null;
      if (replay) {
        const e = Math.min(1, (t - replay.t0) / STEP_MS);
        hamster = {
          x: replay.prev.x + (replay.sim.x - replay.prev.x) * e,
          y: replay.prev.y + (replay.sim.y - replay.prev.y) * e,
          shake: replay.sim.status === 'crashed' ? Math.sin(t / 25) * 3 : 0,
        };
      }
      const startSw = new Map(playerSwitches);
      render(ctx, {
        board,
        sim: replay?.sim ?? null,
        startSwitches: startSw,
        ghost: null,
        active: a ? ghostCells(a) : null,
        landing: g && a && g.y !== a.y ? ghostCells(g) : null,
        gearAngle: new Map(),
        pressed: new Set(),
        hamster,
        inject: replay ? level.cases[replay.caseIdx]!.hamsters[replay.hIdx]!.inject : 'left',
        binCounts: new Array(binCount(board.w)).fill(0),
        lastBin: replay?.sim.status === 'binned' ? replay.sim.bin : null,
      });
    }
    requestAnimationFrame(frame);
  }

  loadLevel(level);
  requestAnimationFrame(frame);

  (window as unknown as { __levels: unknown }).__levels = {
    get stack() {
      return stack;
    },
    get board() {
      return board;
    },
    loadLevel: (i: number) => loadLevel(LEVELS[i]!),
    runTests,
    spawn,
    refresh,
  };
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
