/**
 * 레벨 플레이 화면 — 키보드 전용. 편집은 core/play.ts, 실행은 Runner(QueueRun).
 * 화면에는 대기열 · 통 조건 · 총 가격/예산만 (케이스 목록 없음).
 */
import { queueItems, type Level } from '../core/level';
import { computeLinks } from '../core/links';
import { PART_NAMES } from '../core/parts';
import { LevelPlay } from '../core/play';
import type { Dir, PartType } from '../core/types';
import { MINOS, PIECE_ORDER, type PieceLetter } from '../data/minos';
import { canvasSize, COLORS, render } from './render';
import { el, renderHints, Runner, sizeCanvas, type Screen } from './runner';
import { bestPrice, recordClear } from './storage';

export interface LevelScreenOpts {
  level: Level;
  /** 레벨 번호 (표시용). 없으면 시험 플레이 */
  number?: number;
  /** 기록을 남기는가 (에디터 시험 플레이는 false) */
  record: boolean;
  onExit: () => void;
  onNext?: () => void;
}

export function startLevel(root: HTMLElement, o: LevelScreenOpts): Screen {
  const lv = o.level;
  const play = new LevelPlay(lv);
  let mode: 'mino' | 'part' = 'mino';
  const letters = PIECE_ORDER.filter((p) => lv.allowed.minos.some((id) => MINOS.find((d) => d.id === id)?.piece === p));
  let letterIdx = 0;
  const variant: Partial<Record<PieceLetter, number>> = {};
  const parts: { type: PartType; dir?: Dir; label: string }[] = [];
  for (const t of lv.allowed.parts) {
    if (t === 'motor') parts.push({ type: 'motor', dir: 1, label: '모터 ↻' }, { type: 'motor', dir: -1, label: '모터 ↺' });
    else parts.push({ type: t, label: PART_NAMES[t] });
  }
  let partIdx = 0;
  const cursor = { x: Math.floor(lv.w / 2), y: Math.floor(lv.h / 2) };
  let runner: Runner | null = null;
  let cleared = false;
  let message = '';
  let alive = true;
  /** Shift 를 다른 키 없이 눌렀다 뗐을 때만 미노↔부품 (? 를 칠 때 바뀌지 않게) */
  let shiftAlone = false;
  let helpOpen = false;

  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const panel = el('div', 'panel');
  root.append(left, panel);
  const modeBar = el('div', 'modebar');
  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  const [cw, ch] = canvasSize(play.board);
  const ctx = sizeCanvas(canvas, cw, ch);
  const hints = el('div', 'hints');
  const msg = el('div', 'status');
  left.append(modeBar, canvas, hints, msg);
  const title = el('h1', '', `${o.number ? `${o.number}. ` : '시험 플레이 · '}${lv.name}`);
  const mech = el('div', 'mech', lv.mechanic);
  const priceBox = el('div', 'price');
  const queueBox = el('div', 'queue');
  const goalBox = el('div', 'tally');
  const selBox = el('div', 'sel');
  const keysBox = el('div', 'keys');
  const keysHead = el('h2', '', '전체 키 (? 로 닫기)');
  panel.append(title, mech, el('h2', '', '가격'), priceBox, el('h2', '', '대기열'), queueBox, el('h2', '', '통 조건'), goalBox, el('h2', '', '선택'), selBox, keysHead, keysBox);

  const defsOf = (p: PieceLetter) => MINOS.filter((d) => d.piece === p && lv.allowed.minos.includes(d.id));
  const currentDef = () => {
    const p = letters[letterIdx];
    if (!p) return null;
    const vs = defsOf(p);
    return vs[(variant[p] ?? 0) % vs.length]!;
  };
  const say = (t: string) => (message = t);
  const res = (r: { ok: boolean; reason?: string }, okText: string) => say(r.ok ? okText : `✗ ${(r as { reason: string }).reason}`);
  const editing = () => {
    if (runner) {
      say('실행 중에는 고칠 수 없다 — R 로 리셋');
      return false;
    }
    return true;
  };
  const spawnCurrent = () => {
    const d = currentDef();
    if (!d) return say('이 레벨에서는 미노를 쓸 수 없다');
    res(play.spawn(d.id, performance.now()), `${d.name} — ←→ 이동, X/Z 회전, Space 떨어뜨리기`);
  };

  function key(e: KeyboardEvent) {
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const ctrl = e.ctrlKey || e.metaKey;
    const now = performance.now();
    const done = (f: () => void) => {
      e.preventDefault();
      f();
      refresh();
    };
    if (k !== 'Shift') shiftAlone = false;
    if (k === 'Escape') return done(() => o.onExit());
    if (k === '?' || lower === 'h') return done(() => (helpOpen = !helpOpen));
    if (ctrl && lower === 'z' && !e.shiftKey) return done(() => editing() && say(play.undo() ? '되돌림' : '되돌릴 것 없음'));
    if (ctrl && (lower === 'y' || (lower === 'z' && e.shiftKey))) return done(() => editing() && say(play.redo() ? '다시 함' : '다시 할 것 없음'));
    if (ctrl) return;
    if (lower === 'r') return done(toggleRun);
    if (k === 'Enter' && cleared && o.onNext) return done(() => o.onNext!());
    if (k === 'Shift') {
      if (!e.repeat) shiftAlone = true;
      return;
    }
    if (!editing()) return done(() => {});
    if (mode === 'mino') {
      if (/^[1-7]$/.test(k)) return done(() => {
        const i = Number(k) - 1;
        if (i >= letters.length) return say('없는 번호');
        letterIdx = i;
        spawnCurrent();
      });
      if (lower === 'q' || lower === 'e') return done(() => {
        const p = letters[letterIdx];
        if (!p) return;
        const n = defsOf(p).length;
        variant[p] = ((variant[p] ?? 0) + (lower === 'e' ? 1 : -1) + n) % n;
        spawnCurrent();
      });
      const a = play.active;
      if (k === 'ArrowLeft') return done(() => a && play.move(-1, now));
      if (k === 'ArrowRight') return done(() => a && play.move(1, now));
      if (k === 'ArrowDown') return done(() => a && play.softDrop(now));
      if (lower === 'x') return done(() => a && play.rotate(1, now));
      if (lower === 'z') return done(() => a && play.rotate(-1, now));
      if (k === ' ' || k === 'Enter') return done(() => (a ? res(play.hardDrop(), '놓음') : spawnCurrent()));
      if (k === 'Delete' || k === 'Backspace') return done(() => (a ? (play.undo(), say('취소')) : res(play.removeLastMino(), '마지막 미노 제거')));
    } else {
      const move = (dx: number, dy: number) => {
        if (play.board.inBounds(cursor.x + dx, cursor.y + dy)) {
          cursor.x += dx;
          cursor.y += dy;
        }
      };
      if (/^[1-9]$/.test(k)) return done(() => {
        const i = Number(k) - 1;
        if (i >= parts.length) return say('없는 번호');
        partIdx = i;
      });
      if (k === 'ArrowLeft') return done(() => move(-1, 0));
      if (k === 'ArrowRight') return done(() => move(1, 0));
      if (k === 'ArrowDown') return done(() => move(0, 1));
      if (k === 'ArrowUp') return done(() => move(0, -1));
      if (lower === 'x' || lower === 'z') return done(() => res(play.rotateSwitch(cursor.x, cursor.y, lower === 'x' ? 1 : -1), '스위치 공통 갈래 바꿈'));
      if (lower === 'a' || lower === 'b')
        return done(() => res(play.setSwitchStart(cursor.x, cursor.y, lower.toUpperCase() as 'A' | 'B'), `시작 상태 ${lower.toUpperCase()}`));
      if (k === ' ' || k === 'Enter') return done(() => {
        const p = parts[partIdx];
        if (!p) return say('이 레벨에서는 부품을 쓸 수 없다');
        res(play.placePart(cursor.x, cursor.y, p.type, p.dir), `${p.label} 놓음`);
      });
      if (k === 'Delete' || k === 'Backspace') return done(() => res(play.removePart(cursor.x, cursor.y), '부품 제거'));
    }
  }

  function toggleRun() {
    if (runner) {
      runner = null;
      cleared = false;
      return say('리셋 — 다시 고칠 수 있다');
    }
    play.stack.cancelActive();
    runner = new Runner(play.board, queueItems(lv), performance.now());
    say('실행 중 — R 로 리셋');
  }

  function finish() {
    const j = play.judge(runner!.run);
    if (j.clear) {
      cleared = true;
      let best = '';
      if (o.record) {
        const isNew = recordClear(lv.id, j.price);
        best = isNew ? ' · 새 최저 기록!' : ` · 최저 ${bestPrice(lv.id)}`;
      }
      say(`★ 클리어! 가격 ${j.price}${best}${o.onNext ? ' — Enter 다음 레벨' : ''} · Esc 목록`);
    } else {
      const why: string[] = [];
      if (j.loop) why.push('무한 루프');
      if (!j.binsOk.every(Boolean)) why.push('통 조건이 맞지 않음');
      if (j.overBudget) why.push(`예산 초과 (${j.price} > ${lv.budget})`);
      say(`✗ 실패: ${why.join(' · ')} — R 로 리셋`);
    }
  }

  /** 지금 상황에서 쓸 키 3~4개 */
  function hintPairs(): [string, string][] {
    if (runner) {
      if (cleared) return o.onNext ? [['Enter', '다음 레벨'], ['Esc', '목록'], ['R', '다시 고치기']] : [['Esc', '돌아가기'], ['R', '다시 고치기']];
      if (runner.run.done) return [['R', '리셋하고 고치기'], ['Esc', '목록']];
      return [['R', '멈추고 리셋']];
    }
    if (mode === 'mino') {
      if (play.active) return [['← →', '옮기기'], ['X / Z', '회전'], ['Space', '떨어뜨리기'], ['Q / E', '변형']];
      return [[`1~${Math.max(1, letters.length)}`, '미노 꺼내기'], ['Shift', '부품으로'], ['R', '실행'], ['?', '전체 키']];
    }
    if (!parts.length) return [['Shift', '미노로 돌아가기 (이 레벨은 부품이 없다)']];
    const here = play.board.partAt(cursor.x, cursor.y);
    if (here?.type === 'switch' && !play.isFixedCell(cursor.x, cursor.y)) return [['A / B', '시작 방향'], ['X / Z', '공통(흰 점) 돌리기'], ['Delete', '지우기']];
    return [['방향키', '칸 고르기'], [`1~${Math.max(1, parts.length)}`, '부품 고르기'], ['Space', '놓기'], ['Shift', '미노로']];
  }

  function refresh() {
    modeBar.innerHTML = '';
    for (const [m, label] of [['mino', '미노'], ['part', '부품']] as const) modeBar.append(el('span', 'mode' + (mode === m ? ' on' : ''), label));
    modeBar.append(el('span', 'dim', '  Shift 미노↔부품 · ? 전체 키'));

    const price = play.price();
    priceBox.innerHTML = '';
    const pr = el('div', 'pricebig' + (price > lv.budget ? ' over' : ''), `${price} / 예산 ${lv.budget}`);
    priceBox.append(pr);
    const best = o.record ? bestPrice(lv.id) : undefined;
    if (best !== undefined) priceBox.append(el('div', 'dim', `최저 기록 ${best}`));

    queueBox.innerHTML = '';
    const r = runner?.run;
    lv.queue.forEach((q, i) => {
      const doneQ = r ? i < r.results.length : false;
      const cur = r && !r.done && i === r.index;
      const row = el('div', 'qrow' + (cur ? ' cur' : '') + (doneQ ? ' done' : ''));
      const dot = el('span', 'dot');
      dot.style.background = COLORS[q.color === 'red' ? 0 : 1]!;
      row.append(el('span', 'qi', `${i + 1}`), dot, el('span', '', `${q.color === 'red' ? '빨강' : '파랑'} · ${q.inject === 'left' ? '왼쪽' : '오른쪽'}`));
      queueBox.append(row);
    });

    goalBox.innerHTML = '';
    lv.bins.forEach((g, i) => {
      const got = r?.tally.bins[i];
      const ok = got && got[0] === g.red && got[1] === g.blue;
      const t = `통 ${i}: 빨강 ${g.red} · 파랑 ${g.blue}` + (got && r!.done ? `  (지금 ${got[0]} · ${got[1]}) ${ok ? '✓' : '✗'}` : '');
      goalBox.append(el('div', got && r!.done ? (ok ? 'ok' : 'bad') : '', t));
    });

    selBox.innerHTML = '';
    if (mode === 'mino') {
      const d = currentDef();
      selBox.append(el('div', '', d ? `${letterIdx + 1}:${letters[letterIdx]} · ${d.name}` : '미노 없음'));
      selBox.append(el('div', 'dim', letters.map((p, i) => `${i + 1}:${p}`).join('  ') || '이 레벨은 미노를 쓰지 않는다'));
    } else {
      const p = parts[partIdx];
      selBox.append(el('div', '', p ? `${partIdx + 1}: ${p.label} · 커서 (${cursor.x},${cursor.y})` : '부품 없음'));
      selBox.append(el('div', 'dim', parts.map((q, i) => `${i + 1}:${q.label}`).join('  ') || '이 레벨은 부품을 쓰지 않는다'));
      const here = play.board.partAt(cursor.x, cursor.y);
      if (here) selBox.append(el('div', 'dim', `이 칸: ${PART_NAMES[here.type]}${here.type === 'switch' ? ` (시작 ${here.start})` : ''}${play.isFixedCell(cursor.x, cursor.y) ? ' · 고정' : ''}`));
    }

    renderHints(hints, hintPairs());
    keysHead.hidden = keysBox.hidden = !helpOpen;
    keysBox.innerHTML = '';
    const rows: [string, string][] =
      mode === 'mino'
        ? [['1~7', '모양 고르기(나타남)'], ['Q / E', '변형'], ['← →', '이동'], ['↓', '한 칸 내리기'], ['X / Z', '회전'], ['Space', '떨어뜨리기'], ['Delete', '마지막 미노 지우기']]
        : [['숫자', '부품'], ['방향키', '커서'], ['Space', '놓기'], ['X / Z', '스위치 공통 갈래'], ['A / B', '스위치 시작 상태'], ['Delete', '부품 지우기']];
    rows.push(['Shift', '미노 ↔ 부품 (떼면 바뀜)'], ['Ctrl+Z / Ctrl+Y', '되돌리기 / 다시'], ['R', '실행 / 리셋'], ['Esc', '레벨 목록'], ['? / H', '이 목록 열고 닫기']);
    for (const [kk, what] of rows) {
      const row = el('div', 'krow');
      row.append(el('kbd', '', kk), el('span', '', what));
      keysBox.append(row);
    }
    msg.textContent = message || '숫자로 미노를 고르고 Space 로 떨어뜨린다. Shift 로 부품.';
  }

  function frame(t: number) {
    if (!alive) return;
    if (!runner && play.active) {
      const r = play.tick(t);
      if (r) {
        res(r, '놓음');
        refresh();
      }
    }
    if (runner) {
      const out = runner.frame(t);
      if (out) refresh();
      if (out && runner.run.done) {
        finish();
        refresh();
      }
    }
    const sim = runner?.sim ?? null;
    const a = play.active;
    const g = play.ghost();
    render(ctx, {
      board: play.board,
      links: sim?.links ?? computeLinks(play.board),
      switchState: (x, y) => sim?.switchStateAt(x, y) ?? play.board.partAt(x, y)?.start,
      locked: (x, y) => sim?.isCellLocked(x, y) ?? false,
      gearAngle: (x, y) => runner?.gearAngleAt(play.board, x, y) ?? 0,
      switchTurn: (x, y) => runner?.switchTurnAt(play.board, x, y) ?? 0,
      pressed: runner?.pressed(t) ?? new Set(),
      floating: a && !runner ? { cells: play.stack.cellsOf(a), x: a.x, y: a.y, ok: true } : null,
      ghost: g && !runner ? { cells: play.stack.cellsOf(g), x: g.x, y: g.y, ok: true } : null,
      cursor: mode === 'part' && !runner ? cursor : null,
      hamster: runner?.hamster(t, play.board.h) ?? null,
      nextInject: runner && !runner.run.done ? runner.run.queue[runner.run.index]!.inject : (lv.queue[0]?.inject ?? null),
      bins: runner?.run.tally.bins ?? [],
      goals: lv.bins.map((b) => [b.red, b.blue]),
      fixedUids: play.built.fixed.minos,
      blink: Math.floor(t / 400) % 2 === 0,
    });
    requestAnimationFrame(frame);
  }

  refresh();
  requestAnimationFrame(frame);
  const w = window as unknown as { __hamster: unknown };
  w.__hamster = { screen: 'level', play, get runner() { return runner; }, get message() { return message; } };
  return {
    key,
    keyUp(e: KeyboardEvent) {
      if (e.key !== 'Shift' || !shiftAlone) return;
      shiftAlone = false;
      mode = mode === 'mino' ? 'part' : 'mino';
      refresh();
    },
    dispose() {
      alive = false;
    },
  };
}
