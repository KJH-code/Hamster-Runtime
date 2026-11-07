import { Board } from '../core/board';
import { Simulation, type Inject } from '../core/hamster';
import { buildShape, rotateShape } from '../core/mino';
import { BOARD_H, BOARD_W, SwitchState } from '../core/types';
import { MINOS } from '../data/minos';
import { CELL, canvasSize, cellAt, drawCell, render, type RenderState } from './render';

type Tool = 'place' | 'delete' | 'switch';

const STATUS_TEXT: Record<string, string> = {
  running: '실행 중',
  binned: '통에 도착',
  dead: '막다른 길 — 실패',
  crashed: '튕김 — 실패',
  out: '판 밖으로 나감 — 실패',
  loop: '무한 루프 감지 — 같은 상태가 반복됨. 리셋하거나 다시 투입하세요',
};

export function startApp(root: HTMLElement) {
  const board = new Board(BOARD_W, BOARD_H);
  let selected = MINOS[0]!.id;
  let rot = 0;
  let tool: Tool = 'place';
  let inject: Inject = 'left';
  let sim: Simulation | null = null;
  let running = false;
  let speed = 350;
  const startSwitches = new Map<number, SwitchState>();
  const gearAngle = new Map<number, number>();
  const gearTarget = new Map<number, number>();
  const pressedUntil = new Map<string, number>();
  const binCounts = new Array<number>(5).fill(0);
  let lastBin: number | null = null;
  let hover: { x: number; y: number } | null = null;
  let anim = { from: { x: 0, y: -1 }, to: { x: 0, y: -1 }, t0: 0, dur: 1, shake: false };
  let nextStepAt = 0;
  let runNo = 0;
  let announced = false;

  // ---------- DOM ----------
  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const canvas = document.createElement('canvas');
  const [cw, ch] = canvasSize(board);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  left.append(canvas);
  const panel = el('div', 'panel');
  root.append(left, panel);

  panel.append(el('h1', '', 'Hamster Runtime · 샌드박스'));
  const status = el('div', 'status', '미노를 놓고 ▶ 실행');
  panel.append(status);

  // 팔레트
  panel.append(el('h2', '', '미노 팔레트 (R: 회전)'));
  const paletteBox = el('div', 'palette');
  const paletteBtns: { id: string; btn: HTMLButtonElement; cv: HTMLCanvasElement }[] = [];
  for (const d of MINOS) {
    const btn = document.createElement('button');
    btn.className = 'pal';
    btn.title = d.name;
    const cv = document.createElement('canvas');
    cv.width = 112;
    cv.height = 112;
    btn.append(cv, el('span', '', d.name));
    btn.onclick = () => {
      selected = d.id;
      tool = 'place';
      refreshUi();
    };
    paletteBox.append(btn);
    paletteBtns.push({ id: d.id, btn, cv });
  }
  panel.append(paletteBox);

  const row = (label?: string) => {
    const r = el('div', 'row');
    if (label) r.append(el('span', 'lbl', label));
    panel.append(r);
    return r;
  };
  const btn = (text: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = cls;
    b.onclick = onClick;
    return b;
  };

  const toolRow = row('도구');
  const toolBtns: Record<Tool, HTMLButtonElement> = {
    place: btn('배치', () => setTool('place')),
    delete: btn('삭제', () => setTool('delete')),
    switch: btn('스위치 A/B', () => setTool('switch')),
  };
  toolRow.append(toolBtns.place, toolBtns.delete, toolBtns.switch, btn('회전 R', () => rotate()), btn('초기화', () => clearBoard()));

  const injRow = row('투입구');
  const injBtns = {
    left: btn('왼쪽', () => setInject('left')),
    right: btn('오른쪽', () => setInject('right')),
  };
  injRow.append(injBtns.left, injBtns.right);

  const runRow = row('실행');
  const runBtn = btn('▶ 실행', () => toggleRun());
  runRow.append(
    runBtn,
    btn('한 칸 ⏭', () => stepOnce()),
    btn('⟲ 리셋', () => resetSim()),
    btn('다음 햄스터 ↻', () => nextHamster()),
  );
  const speedRow = row('속도');
  const speedInput = document.createElement('input');
  speedInput.type = 'range';
  speedInput.min = '80';
  speedInput.max = '900';
  speedInput.value = String(1000 - speed);
  speedInput.oninput = () => (speed = 1000 - Number(speedInput.value));
  speedRow.append(speedInput);

  panel.append(el('h2', '', '스위치 시작 상태'));
  const swBox = el('div', 'swlist');
  panel.append(swBox);

  panel.append(el('h2', '', '기록'));
  const logBox = el('div', 'log');
  panel.append(logBox);

  panel.append(
    el(
      'p',
      'help',
      '좌클릭 배치 · 우클릭 삭제 · R 회전 · Space 실행/일시정지. ' +
        '"리셋" = 스위치 시작 상태로 되돌림. "다음 햄스터" = 스위치·잠김 상태를 그대로 두고 새 햄스터를 투입(토글 확인용).',
    ),
  );

  // ---------- 동작 ----------
  function setTool(t: Tool) {
    tool = t;
    refreshUi();
  }
  function setInject(i: Inject) {
    inject = i;
    resetSim();
  }
  function rotate() {
    rot = (rot + 1) % 4;
    refreshUi();
  }
  function onBoardEdited() {
    sim = null;
    running = false;
    gearAngle.clear();
    gearTarget.clear();
    setStatus('미노를 놓고 ▶ 실행');
    refreshUi();
  }
  function clearBoard() {
    board.clear();
    startSwitches.clear();
    onBoardEdited();
  }
  function resetSim() {
    sim = null;
    running = false;
    announced = false;
    gearAngle.clear();
    gearTarget.clear();
    setStatus('리셋됨 — 스위치 시작 상태로 돌아갔습니다');
    refreshUi();
  }
  function ensureSim(): Simulation {
    if (!sim) {
      sim = new Simulation(board, { inject, switches: startSwitches });
      anim = { from: { x: sim.x, y: sim.y }, to: { x: sim.x, y: sim.y }, t0: 0, dur: 1, shake: false };
      announced = false;
      runNo++;
    }
    return sim;
  }
  function nextHamster() {
    if (!sim) return ensureSim(), refreshUi();
    const keep = new Map<number, SwitchState>();
    for (const [node, st] of sim.switches) {
      const p = sim.nodeCells[node]!;
      keep.set(board.idx(p.x, p.y), st);
    }
    const locked = new Set(sim.locked);
    sim = new Simulation(board, { inject, switches: keep, locked });
    anim = { from: { x: sim.x, y: sim.y }, to: { x: sim.x, y: sim.y }, t0: 0, dur: 1, shake: false };
    announced = false;
    running = false;
    runNo++;
    setStatus('다음 햄스터 준비됨 (스위치·잠김 상태 유지)');
    refreshUi();
  }
  function toggleRun() {
    const s = ensureSim();
    if (s.status !== 'running') return;
    running = !running;
    nextStepAt = performance.now();
    refreshUi();
  }
  function stepOnce() {
    const s = ensureSim();
    running = false;
    if (s.status === 'running') doStep(performance.now());
    refreshUi();
  }
  function setStatus(t: string) {
    status.textContent = t;
  }
  function addLog(t: string) {
    const d = el('div', '', t);
    logBox.prepend(d);
    while (logBox.childElementCount > 40) logBox.lastElementChild?.remove();
  }

  function doStep(now: number) {
    const s = sim!;
    const before = { x: s.x, y: s.y };
    s.step();
    let to = { x: s.x, y: s.y };
    if (s.status === 'binned') to = { x: s.x, y: board.h };
    if (s.status === 'crashed' && s.bounce) to = { x: before.x + (s.bounce.x - before.x) * 0.45, y: before.y + (s.bounce.y - before.y) * 0.45 };
    anim = { from: before, to, t0: now, dur: Math.max(60, speed * 0.9), shake: s.status === 'crashed' };
    for (const t of s.lastTriggered) pressedUntil.set(`${t.x},${t.y}`, now + Math.max(350, speed));
    if (s.lastDrive) for (const [node, dir] of s.lastDrive.dirs) gearTarget.set(node, (gearTarget.get(node) ?? 0) + dir * (Math.PI / 4));
    if (s.status !== 'running') {
      running = false;
      finishRun();
    } else {
      setStatus(`실행 중 · ${s.steps}칸`);
    }
    refreshUi(false);
  }

  function finishRun() {
    const s = sim!;
    if (announced) return;
    announced = true;
    let msg = STATUS_TEXT[s.status] ?? s.status;
    if (s.status === 'binned') {
      binCounts[s.bin!]!++;
      lastBin = s.bin;
      msg = `통 ${s.bin} 에 도착`;
    }
    setStatus(msg);
    const sw = Array.from(s.switches.entries())
      .map(([n, v]) => `(${s.nodeCells[n]!.x},${s.nodeCells[n]!.y})=${v}`)
      .join(' ');
    addLog(`#${runNo} ${inject === 'left' ? '왼쪽' : '오른쪽'} · ${msg} · ${s.steps}칸${sw ? ' · 스위치 ' + sw : ''}${s.locked.size ? ' · 잠김 ' + s.locked.size : ''}`);
  }

  // ---------- 입력 ----------
  function ghostFor() {
    if (tool !== 'place' || !hover) return null;
    const shape = rotateShape(buildShape(MINOS.find((m) => m.id === selected)!), rot);
    const w = Math.max(...shape.map((c) => c.x)) + 1;
    const h = Math.max(...shape.map((c) => c.y)) + 1;
    const x = hover.x - Math.floor(w / 2);
    const y = hover.y - Math.floor(h / 2);
    return { cells: shape, x, y, ok: board.canPlace(shape, x, y) };
  }
  function pos(e: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    return cellAt(board, e.clientX - r.left, e.clientY - r.top);
  }
  canvas.addEventListener('mousemove', (e) => (hover = pos(e)));
  canvas.addEventListener('mouseleave', () => (hover = null));
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = pos(e);
    if (p && board.removeAt(p.x, p.y)) onBoardEdited();
  });
  canvas.addEventListener('click', (e) => {
    const p = pos(e);
    if (!p) return;
    if (tool === 'place') {
      const g = ghostFor();
      if (g?.ok && board.place(selected, rot, g.x, g.y)) onBoardEdited();
    } else if (tool === 'delete') {
      if (board.removeAt(p.x, p.y)) onBoardEdited();
    } else {
      const c = board.at(p.x, p.y);
      if (c?.kind === 'switch') {
        const i = board.idx(p.x, p.y);
        startSwitches.set(i, startSwitches.get(i) === 'B' ? 'A' : 'B');
        resetSim();
      }
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') rotate();
    else if (e.key === ' ') {
      e.preventDefault();
      toggleRun();
    }
  });

  // ---------- UI 갱신 ----------
  function refreshUi(rebuildSwitches = true) {
    for (const t of ['place', 'delete', 'switch'] as Tool[]) toolBtns[t].classList.toggle('on', tool === t);
    injBtns.left.classList.toggle('on', inject === 'left');
    injBtns.right.classList.toggle('on', inject === 'right');
    runBtn.textContent = running ? '⏸ 일시정지' : '▶ 실행';
    for (const p of paletteBtns) {
      p.btn.classList.toggle('on', p.id === selected && tool === 'place');
      const c = p.cv.getContext('2d')!;
      c.clearRect(0, 0, 112, 112);
      const shape = rotateShape(buildShape(MINOS.find((m) => m.id === p.id)!), rot);
      const w = Math.max(...shape.map((q) => q.x)) + 1;
      const h = Math.max(...shape.map((q) => q.y)) + 1;
      const sz = Math.min(28, Math.floor(104 / Math.max(w, h)));
      const ox = (112 - w * sz) / 2;
      const oy = (112 - h * sz) / 2;
      for (const q of shape) drawCell(c, q.cell, ox + q.x * sz, oy + q.y * sz, sz, { switchState: 'A' });
    }
    if (rebuildSwitches) {
      swBox.innerHTML = '';
      let any = false;
      for (let y = 0; y < board.h; y++)
        for (let x = 0; x < board.w; x++)
          if (board.at(x, y)?.kind === 'switch') {
            any = true;
            const i = board.idx(x, y);
            const cur = startSwitches.get(i) ?? 'A';
            const b = btn(`(${x},${y}) ${cur}`, () => {
              startSwitches.set(i, cur === 'A' ? 'B' : 'A');
              resetSim();
            });
            swBox.append(b);
          }
      if (!any) swBox.append(el('span', 'dim', '스위치 칸이 없습니다 (T-스위치를 놓으세요)'));
    }
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (running && sim && sim.status === 'running' && now >= nextStepAt) {
      doStep(now);
      nextStepAt = now + speed;
    }
    // 기어 각도 보간
    for (const [node, target] of gearTarget) {
      const cur = gearAngle.get(node) ?? 0;
      gearAngle.set(node, cur + (target - cur) * (1 - Math.exp(-dt * 14)));
    }
    // 햄스터 위치
    let hamster: RenderState['hamster'] = null;
    if (sim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur);
      const e = anim.t0 === 0 ? 1 : t;
      const shake = anim.shake && t >= 1 ? Math.sin(now / 25) * 3 : 0;
      hamster = {
        x: anim.from.x + (anim.to.x - anim.from.x) * e,
        y: anim.from.y + (anim.to.y - anim.from.y) * e,
        shake,
      };
    }
    const pressed = new Set<string>();
    for (const [k, until] of pressedUntil) if (until > now) pressed.add(k);
    render(ctx, {
      board,
      sim,
      startSwitches,
      ghost: ghostFor(),
      gearAngle,
      pressed,
      hamster,
      inject,
      binCounts,
      lastBin,
    });
    requestAnimationFrame(frame);
  }

  refreshUi();
  requestAnimationFrame(frame);

  // 테스트/디버그 훅 (Playwright 검증용)
  (window as unknown as { __hamster: unknown }).__hamster = {
    board,
    place: (id: string, r: number, x: number, y: number) => {
      const p = board.place(id, r, x, y);
      if (p) onBoardEdited();
      return !!p;
    },
    setSwitch: (x: number, y: number, s: SwitchState) => {
      startSwitches.set(board.idx(x, y), s);
      resetSim();
    },
    setInject,
    get sim() {
      return sim;
    },
    stepOnce,
    nextHamster,
    resetSim,
    setSpeed: (ms: number) => (speed = ms),
    run: toggleRun,
    CELL,
  };
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
