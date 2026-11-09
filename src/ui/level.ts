/**
 * 레벨 플레이 화면 — 키보드 전용. 편집은 core/play.ts, 실행은 Runner(QueueRun).
 * 화면에는 대기열 · 통 조건 · 총 가격/예산만 (케이스 목록 없음).
 */
import { queueItems, srsCells, type Level } from '../core/level';
import { computeLinks } from '../core/links';
import { PART_NAMES } from '../core/parts';
import { LevelPlay } from '../core/play';
import { BIN_WIDTH, type Dir, type PartType } from '../core/types';
import { MINOS, PIECE_ORDER, type PieceLetter } from '../data/minos';
import { artSize, burst, drawCelebration, hamsterIcon, renderArt, THEME, type Overlay, type Particle } from './art';
import { copyLink, el, fitCanvas, renderHints, Runner, shareUrl, type Screen } from './runner';
import { encodeShare } from '../core/share';
import { bestPrice, recordClear } from './storage';
import { HIDE_PRICE, LEVEL_TUTORIALS, Tutorial } from './tutorial';
import { KeyRepeat } from './keyrepeat';
import { renderPalette } from './palette';

export interface LevelScreenOpts {
  level: Level;
  /** 레벨 번호 (표시용). 없으면 시험 플레이 */
  number?: number;
  /** 기록을 남기는가 (에디터 시험 플레이는 false) */
  record: boolean;
  onExit: () => void;
  onNext?: () => void;
  /** 마지막 레벨을 깨고 Enter → 끝 화면 */
  onAllClear?: () => void;
}

export function startLevel(root: HTMLElement, o: LevelScreenOpts): Screen {
  const lv = o.level;
  const play = new LevelPlay(lv);
  let mode: 'mino' | 'part' = 'mino';
  const letters = PIECE_ORDER.filter((p) => lv.allowed.minos.some((id) => MINOS.find((d) => d.id === id)?.piece === p));
  let letterIdx = 0;
  const variant: Partial<Record<PieceLetter, number>> = {};
  /** 부품은 글자 키로 바로: S 센서 · G 기어 · M 모터(다시 누르면 방향) · W 스위치 · P 마개 */
  const PART_KEYS: Record<string, PartType> = { s: 'sensor', g: 'gear', m: 'motor', w: 'switch', p: 'plug' };
  const KEY_OF: Record<PartType, string> = { sensor: 'S', gear: 'G', motor: 'M', switch: 'W', plug: 'P' };
  let partType: PartType | null = null;
  let motorDir: Dir = 1;
  const partLabel = (t: PartType) => (t === 'motor' ? `모터 ${motorDir === 1 ? '↻' : '↺'}` : PART_NAMES[t]);
  const repeat = new KeyRepeat();
  /** 자동 낙하: 들고 있는 미노가 이 간격마다 한 칸 (바닥에 닿으면 Space 를 기다린다) */
  const GRAVITY_MS = 800;
  let gravityAt = 0;
  const cursor = { x: Math.floor(lv.w / 2), y: Math.floor(lv.h / 2) };
  let runner: Runner | null = null;
  let cleared = false;
  let message = '';
  let alive = true;
  let celebrate: { ps: Particle[]; t0: number } | null = null;
  /** 이번에 깬 풀이의 공유 코드 */
  let clearCode: string | null = null;
  let failUntil = 0;
  /** 빨리가기 배율 (F) — 실행할 때마다 이어진다 */
  let speed = 1;
  let helpOpen = false;

  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const panel = el('div', 'panel');
  root.append(left, panel);
  const modeBar = el('div', 'modebar');
  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  const [cw, ch] = artSize(play.board);
  let ctx = fitCanvas(canvas, cw, ch, left);
  const onResize = () => (ctx = fitCanvas(canvas, cw, ch, left));
  window.addEventListener('resize', onResize);
  const hints = el('div', 'hints');
  const msg = el('div', 'status');
  left.append(modeBar, canvas, hints, msg);
  const title = el('h1', '', `${o.number ? `${o.number}. ` : '시험 플레이 · '}${lv.name}`);
  const mech = el('div', 'mech', lv.mechanic);
  const priceBox = el('div', 'price');
  const queueBox = el('div', 'qicons');
  const goalBox = el('div', 'goals');
  const selBox = el('div', 'sel');
  const palBox = el('div', '');
  const card = (...kids: HTMLElement[]) => {
    const c = el('div', 'card');
    c.append(...kids);
    return c;
  };
  const hidePrice = HIDE_PRICE.has(lv.id);
  const priceCard = card(el('h2', '', '가격 / 예산'), priceBox);
  priceCard.hidden = hidePrice;
  const keysBox = el('div', 'keys');
  const keysHead = el('h2', '', '전체 키 (? 로 닫기)');
  panel.append(
    card(title, mech),
    priceCard,
    card(el('h2', '', '대기열 — 이 순서로 떨어진다'), queueBox),
    card(el('h2', '', '통 목표'), goalBox),
    card(el('h2', '', '미노 · 부품'), palBox),
    selBox,
    keysHead,
    keysBox,
  );

  const defsOf = (p: PieceLetter) => MINOS.filter((d) => d.piece === p && lv.allowed.minos.includes(d.id));
  const currentDef = () => {
    const p = letters[letterIdx];
    if (!p) return null;
    const vs = defsOf(p);
    return vs[(variant[p] ?? 0) % vs.length]!;
  };
  const tutSteps = o.record ? LEVEL_TUTORIALS[lv.id] : undefined;
  /** 튜토리얼: 아직 안 깬 레벨에서만 (N 으로 다시 볼 수 있다) */
  let tut = tutSteps && bestPrice(lv.id) === undefined ? new Tutorial(tutSteps) : null;
  const tev = (name: string) => tut?.event(name);
  /** 안내 중 잘못 놓았을 때 말풍선에 띄울 경고 (다음 꺼내기·지우기에서 사라짐) */
  let tutWarn: string | null = null;
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
    const r = play.spawn(d.id, performance.now());
    if (r.ok) {
      tutWarn = null;
      tev('spawn');
      gravityAt = performance.now() + GRAVITY_MS;
    }
    res(r, `${d.name}`);
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
    if (e.repeat && (repeat.has(k) || k.startsWith('Arrow'))) return void e.preventDefault(); // 꾹 누르기는 직접 반복
    if (k !== 'Shift' && lower !== 'n') tut?.anyKey(); // 한 번짜리 말풍선은 아무 키나 누르면 닫힌다
    if (k === 'Escape') return done(() => (mode === 'part' ? ((mode = 'mino'), say('미노로')) : o.onExit()));
    if (k === '?' || lower === 'h') return done(() => (helpOpen = !helpOpen));
    if (lower === 'n')
      return done(() => {
        if (tut?.active) tut.next();
        else if (tutSteps) tut = new Tutorial(tutSteps);
        else say('이 레벨에는 안내가 없다');
      });
    if (ctrl && lower === 'z' && !e.shiftKey) return done(() => editing() && say(play.undo() ? '되돌림' : '되돌릴 것 없음'));
    if (ctrl && (lower === 'y' || (lower === 'z' && e.shiftKey))) return done(() => editing() && say(play.redo() ? '다시 함' : '다시 할 것 없음'));
    if (ctrl || k === 'Shift') return;
    if (lower === 'r') return done(toggleRun);
    if (lower === 'f')
      return done(() => {
        speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
        if (runner) runner.speed = speed;
        say(`빨리가기 ${speed}×`);
      });
    if (k === 'Enter' && cleared && o.onNext) return done(() => o.onNext!());
    if (k === 'Enter' && cleared && o.onAllClear) return done(() => o.onAllClear!());
    if (lower === 'c' && cleared && clearCode)
      return done(() => {
        const url = shareUrl(clearCode!);
        void copyLink(url).then((how) => {
          say(how === 'copied' ? '풀이 링크를 복사했다 — 카톡 등에 붙여 넣으면 친구가 그대로 볼 수 있다' : '링크 창에서 Ctrl+C 로 복사');
          refresh();
        });
      });
    if (!editing()) return done(() => {});
    // ---- 고르기: 숫자 = 미노, 글자 = 부품 (모드 전환 키 없음) ----
    if (/^[1-7]$/.test(k))
      return done(() => {
        const i = Number(k) - 1;
        if (i >= letters.length) return say('없는 번호');
        mode = 'mino';
        letterIdx = i;
        spawnCurrent();
      });
    const pt = PART_KEYS[lower];
    if (pt)
      return done(() => {
        if (!lv.allowed.parts.includes(pt)) return say(`이 레벨에서는 ${PART_NAMES[pt]} 를 쓸 수 없다`);
        if (pt === 'motor' && mode === 'part' && partType === 'motor') motorDir = motorDir === 1 ? -1 : 1;
        if (mode !== 'part') play.stack.cancelActive();
        mode = 'part';
        partType = pt;
        tev('mode:part');
        say(`${partLabel(pt)} — 방향키로 칸을 고르고 Space`);
      });
    if (mode === 'mino') {
      if (lower === 'q' || lower === 'e') return done(() => {
        const p = letters[letterIdx];
        if (!p) return;
        const n = defsOf(p).length;
        variant[p] = ((variant[p] ?? 0) + (lower === 'e' ? 1 : -1) + n) % n;
        spawnCurrent();
      });
      const a = play.active;
      const held = (fn: () => void) => done(() => repeat.press(k, now, () => { fn(); refresh(); }));
      if (k === 'ArrowLeft') return held(() => play.active && play.move(-1, performance.now()) && tev('move'));
      if (k === 'ArrowRight') return held(() => play.active && play.move(1, performance.now()) && tev('move'));
      if (k === 'ArrowDown') return held(() => {
        if (play.active && play.softDrop(performance.now())) gravityAt = performance.now() + GRAVITY_MS;
      });
      if (lower === 'x') return done(() => a && play.rotate(1, now) && tev('rotate'));
      if (lower === 'z') return done(() => a && play.rotate(-1, now) && tev('rotate'));
      if (k === ' ' || k === 'Enter')
        return done(() => {
          if (!a) return spawnCurrent();
          const r = play.hardDrop();
          res(r, '놓음');
          if (!r.ok) return;
          // 안내가 빛나는 자리를 가리키는데 다른 데 놓았으면 알려 주고 그 단계에 머문다
          const want = glowMino()?.m;
          const ms = play.layout().minos;
          const got = ms[ms.length - 1];
          const cellsKey = (m: { id: string; r: number; x: number; y: number }) =>
            m.id + ':' + srsCells(m.id, m.r).map((c) => `${m.x + c.x},${m.y + c.y}`).sort().join(' ');
          if (want && got && cellsKey(got) !== cellsKey(want))
            return void (tutWarn = say('빛나는 자리와 다르다. Delete 로 지우고 다시 꺼낸다'));
          tev('drop');
        });
      if (k === 'Delete' || k === 'Backspace') return done(() => ((tutWarn = null), a ? (play.undo(), say('취소')) : res(play.removeLastMino(), '마지막 미노 제거')));
    } else {
      const move = (dx: number, dy: number) => {
        if (play.board.inBounds(cursor.x + dx, cursor.y + dy)) {
          cursor.x += dx;
          cursor.y += dy;
          tev('cursor');
        }
      };
      const held = (dx: number, dy: number) => done(() => repeat.press(k, now, () => { move(dx, dy); refresh(); }));
      if (k === 'ArrowLeft') return held(-1, 0);
      if (k === 'ArrowRight') return held(1, 0);
      if (k === 'ArrowDown') return held(0, 1);
      if (k === 'ArrowUp') return held(0, -1);
      if (lower === 'x' || lower === 'z')
        return done(() => {
          const r = play.rotateSwitch(cursor.x, cursor.y, lower === 'x' ? 1 : -1);
          if (r.ok) tev('switchCommon');
          res(r, '스위치 공통 갈래 바꿈');
        });
      if (lower === 'a' || lower === 'b')
        return done(() => {
          const r = play.setSwitchStart(cursor.x, cursor.y, lower.toUpperCase() as 'A' | 'B');
          if (r.ok) tev('switchStart');
          res(r, `시작 방향 ${lower.toUpperCase()}`);
        });
      if (k === ' ' || k === 'Enter') return done(() => {
        if (!partType) return say('부품 키를 먼저 (S G M W P)');
        const r = play.placePart(cursor.x, cursor.y, partType, partType === 'motor' ? motorDir : undefined);
        if (r.ok) tev(`part:${partType}`);
        res(r, `${partLabel(partType)} 놓음`);
      });
      if (k === 'Delete' || k === 'Backspace') return done(() => res(play.removePart(cursor.x, cursor.y), '부품 제거'));
    }
  }

  function toggleRun() {
    if (runner) {
      runner = null;
      cleared = false;
      clearCode = null;
      celebrate = null;
      failUntil = 0;
      return say('리셋 — 다시 고칠 수 있다');
    }
    play.stack.cancelActive();
    runner = new Runner(play.board, queueItems(lv), performance.now());
    runner.speed = speed;
    tev('run');
    say('실행 중 — R 로 리셋');
  }

  function finish() {
    const j = play.judge(runner!.run);
    const now = performance.now();
    if (j.clear) {
      cleared = true;
      celebrate = { ps: burst(cw / 2, ch * 0.32, now), t0: now };
      tev('clear');
      tut = null; // 깼으면 안내는 닫는다 (N 으로 다시 볼 수 있다)
      let best = '';
      clearCode = encodeShare(lv.id, play.layout());
      if (o.record) {
        const isNew = recordClear(lv.id, j.price, clearCode);
        best = isNew ? ' · 새 최저 기록!' : ` · 최저 ${bestPrice(lv.id)}`;
      }
      say(`★ 클리어!${hidePrice ? '' : ` 가격 ${j.price}${best}`}${o.onNext ? ' — Enter 다음 레벨' : o.onAllClear ? ' — Enter 끝 화면' : ''} · C 풀이 링크 복사`);
    } else {
      const why: string[] = [];
      if (j.loop) why.push('무한 루프');
      if (!j.binsOk.every(Boolean)) why.push('통 조건이 맞지 않음');
      if (j.overBudget) why.push(`예산 초과 (${j.price} > ${lv.budget})`);
      failUntil = now + 1600;
      say(`✗ 실패: ${why.join(' · ')} — R 로 리셋하고 고친다 (Delete = 마지막 미노 지우기)`);
    }
  }

  /** 지금 상황에서 쓸 키 3~4개 */
  function hintPairs(): [string, string][] {
    if (runner) {
      if (cleared)
        return o.onNext
          ? [['Enter', '다음 레벨'], ['C', '풀이 링크 복사'], ['Esc', '목록'], ['R', '다시 고치기']]
          : o.onAllClear
            ? [['Enter', '끝 화면'], ['C', '풀이 링크 복사'], ['Esc', '목록']]
            : [['C', '풀이 링크 복사'], ['Esc', '돌아가기'], ['R', '다시 고치기']];
      if (runner.run.done) return [['R', '리셋하고 고치기'], ['Esc', '목록']];
      return [['R', '멈추고 리셋'], ['F', `빨리가기 (${speed}×)`]];
    }
    if (mode === 'mino') {
      if (play.active) return [['← →', '옮기기 (꾹)'], ['↓', '빨리 내리기'], ['X / Z', '회전'], ['Space', '고정']];
      const pk = lv.allowed.parts.map((t) => KEY_OF[t]).join(' ');
      return [[letters.length > 1 ? `1~${letters.length}` : '1', '미노'], ...(pk ? ([[pk, '부품']] as [string, string][]) : []), ['R', '실행'], ['?', '전체 키']];
    }
    const here = play.board.partAt(cursor.x, cursor.y);
    if (here?.type === 'switch' && !play.isFixedCell(cursor.x, cursor.y)) return [['A / B', '시작 방향'], ['X / Z', '공통(흰 점) 돌리기'], ['Delete', '지우기']];
    return [['방향키', '칸 고르기'], ['Space', `${partType ? partLabel(partType) : '부품'} 놓기`], ...(partType === 'motor' ? ([['M', '방향 바꾸기']] as [string, string][]) : []), ['숫자', '미노로']];
  }

  /** 안내가 가리키는 미노 (빛나는 자리) 와 그 숫자 키 */
  function glowMino() {
    const st = tut?.step;
    const m = st?.glow !== undefined ? lv.solution?.minos[st.glow] : undefined;
    if (!m) return null;
    const piece = MINOS.find((d) => d.id === m.id)?.piece;
    const i = piece ? letters.indexOf(piece) : -1;
    return { m, piece: piece ?? null, key: i >= 0 ? String(i + 1) : '숫자' };
  }

  /** 판 위 안내: 빛나는 목표 칸 + 말풍선 */
  function overlay(): Overlay | null {
    const st = tut?.step;
    if (!st || runner) return null;
    const gm = glowMino();
    const fill = (x: string) => x.replace('{key}', gm?.key ?? '숫자');
    const glow: { x: number; y: number }[] = [];
    const m = st.glow !== undefined ? lv.solution?.minos[st.glow] : undefined;
    if (m) for (const c of srsCells(m.id, m.r)) glow.push({ x: m.x + c.x, y: m.y + c.y });
    const center = (cs: { x: number; y: number }[]) => ({
      ax: cs.reduce((a, c) => a + c.x, 0) / cs.length + 0.5,
      ay: Math.min(...cs.map((c) => c.y)),
    });
    let p = { ax: lv.w / 2, ay: 1.2 };
    let below = false;
    const a = play.active;
    if (st.anchor === 'active' && a) {
      const cs = play.stack.cellsOf(a).map((c) => ({ x: a.x + c.x, y: Math.max(0, a.y + c.y) }));
      p = { ax: center(cs).ax, ay: Math.max(...cs.map((c) => c.y)) + 1 };
      below = true;
    }
    else if (st.anchor === 'glow' && glow.length) p = center(glow);
    else if (st.anchor === 'inlet') p = { ax: lv.queue[0]?.inject === 'right' ? lv.w - 0.5 : 0.5, ay: 0.2 };
    else if (st.anchor === 'bin') {
      const i = Math.max(0, lv.bins.findIndex((g) => g.red + g.blue > 0));
      p = { ax: i * BIN_WIDTH + Math.min(BIN_WIDTH, lv.w - i * BIN_WIDTH) / 2, ay: lv.h + 0.1 };
    }
    else if (st.anchor === 'top') p = { ax: lv.w / 2, ay: 0.2 };
    // 빛나는 자리가 한쪽에 있으면 말풍선은 반대쪽으로 비켜 선다 (그림자·자리를 가리지 않게)
    const gx = glow.length ? glow.reduce((s2, c) => s2 + c.x, 0) / glow.length + 0.5 : null;
    const side = st.anchor === 'active' && gx !== null ? (gx < lv.w / 2 ? 'right' : 'left') : undefined;
    if (tutWarn) return { glow, bubble: { text: tutWarn, keys: [['Delete', '지우기']], ax: p.ax, ay: p.ay, below, side, warn: true } };
    return { glow, bubble: { text: fill(st.text), keys: st.keys.map(([k, w]) => [fill(k), w] as [string, string]), ax: p.ax, ay: p.ay, below, side } };
  }

  function refresh() {
    modeBar.innerHTML = '';
    for (const [m, label] of [['mino', '미노'], ['part', '부품']] as const) modeBar.append(el('span', 'mode' + (mode === m ? ' on' : ''), label));
    modeBar.append(el('span', 'dim', lv.allowed.parts.length ? '  숫자 = 미노 · 글자 = 부품 · ? 전체 키' : '  숫자 = 미노 · ? 전체 키'));

    const price = play.price();
    priceBox.innerHTML = '';
    const over = price > lv.budget;
    priceBox.append(el('div', 'pricebig' + (over ? ' over' : ''), `${price} / ${lv.budget}`));
    const bar = el('div', 'bar');
    const fill = el('div', 'fill' + (over ? ' over' : price > lv.budget * 0.75 ? ' warn' : ''));
    fill.style.width = `${Math.min(100, lv.budget ? (price / lv.budget) * 100 : price ? 100 : 0)}%`;
    bar.append(fill);
    priceBox.append(bar);
    const best = o.record ? bestPrice(lv.id) : undefined;
    if (best !== undefined) priceBox.append(el('div', 'dim', `★ 최저 기록 ${best}`));

    queueBox.innerHTML = '';
    const r = runner?.run;
    lv.queue.forEach((q, i) => {
      const doneQ = r ? i < r.results.length : false;
      const cur = r && !r.done && i === r.index;
      const item = el('div', 'qitem' + (cur ? ' cur' : '') + (doneQ ? ' done' : ''));
      item.title = `${i + 1}번 ${q.color === 'red' ? '빨강' : '파랑'} ${q.inject === 'left' ? '왼쪽' : '오른쪽'}`;
      item.append(hamsterIcon(q.color === 'red' ? 0 : 1), el('span', 'qin', q.inject === 'left' ? '◀' : '▶'));
      queueBox.append(item);
    });

    goalBox.innerHTML = '';
    const scarf = (col: number, n: number) => {
      const s = el('span', 'gc');
      const d = el('span', 'dot');
      d.style.background = THEME.scarf[col]!;
      s.append(d, el('span', '', String(n)));
      return s;
    };
    let empties = 0;
    lv.bins.forEach((g, i) => {
      if (g.red === 0 && g.blue === 0) return void empties++;
      const got = r?.tally.bins[i];
      const doneRun = !!(got && r!.done);
      const ok = got && got[0] === g.red && got[1] === g.blue;
      const chip = el('div', 'goal' + (doneRun ? (ok ? ' ok' : ' bad') : ''));
      chip.append(el('span', 'gname', `통 ${i}`), scarf(0, g.red), scarf(1, g.blue));
      if (doneRun) chip.append(el('span', '', ok ? '✓' : '✗'));
      goalBox.append(chip);
    });
    if (empties) goalBox.append(el('div', 'dim', '나머지 통은 비워 둔다'));

    renderPalette(palBox, {
      allowedMinos: lv.allowed.minos,
      keyOrder: letters,
      letter: letters[letterIdx] ?? null,
      defId: currentDef()?.id ?? null,
      allowedParts: lv.allowed.parts,
      part: partType,
      partMode: mode === 'part',
      // 안내가 미노를 꺼내라고 하면 그 칸을 반짝인다
      pulse: !play.active && !runner ? (glowMino()?.piece ?? null) : null,
    });
    selBox.innerHTML = '';
    selBox.hidden = mode === 'mino';
    if (mode === 'mino') {
      // 미노는 팔레트가 보여준다
    } else {
      selBox.append(el('div', '', partType ? `${partLabel(partType)} · 커서 (${cursor.x},${cursor.y})` : '부품'));
      selBox.append(el('div', 'dim', lv.allowed.parts.map((t) => `${KEY_OF[t]}:${PART_NAMES[t]}`).join('  ') || '이 레벨은 부품을 쓰지 않는다'));
      const here = play.board.partAt(cursor.x, cursor.y);
      if (here) selBox.append(el('div', 'dim', `이 칸: ${PART_NAMES[here.type]}${here.type === 'switch' ? ` (시작 ${here.start})` : ''}${play.isFixedCell(cursor.x, cursor.y) ? ' · 고정' : ''}`));
    }

    renderHints(hints, hintPairs());
    keysHead.hidden = keysBox.hidden = !helpOpen;
    keysBox.innerHTML = '';
    const rows: [string, string][] =
      mode === 'mino'
        ? [['1~7', '미노 꺼내기 (저절로 천천히 내려옴)'], ['Q / E', '튜브 ↔ 빈 변형'], ['← →', '옮기기 (꾹 누르면 미끄러짐)'], ['↓', '빨리 내리기'], ['X / Z', '회전'], ['Space', '바로 떨어뜨려 고정'], ['Delete', '마지막 미노 지우기']]
        : [['방향키', '칸 고르기'], ['Space', '놓기'], ['M', '모터 방향 바꾸기'], ['X / Z', '스위치 공통 갈래'], ['A / B', '스위치 시작 상태'], ['Delete', '부품 지우기'], ['Esc', '미노로']];
    rows.push(['S G M W P', '센서 · 기어 · 모터 · 스위치 · 마개'], ['F', '빨리가기 1× · 2× · 4×'], ['Ctrl+Z / Ctrl+Y', '되돌리기 / 다시'], ['R', '실행 / 리셋'], ['Esc', '레벨 목록'], ['? / H', '이 목록 열고 닫기'], ['N', '안내 다음 / 다시 보기']);
    for (const [kk, what] of rows) {
      const row = el('div', 'krow');
      row.append(el('kbd', '', kk), el('span', '', what));
      keysBox.append(row);
    }
    msg.textContent = message || `숫자로 미노를 꺼내고 Space 로 고정.${lv.allowed.parts.length ? ' 부품은 S G M W P.' : ''}`;
  }

  function frame(t: number) {
    if (!alive) return;
    if (repeat.update(t)) refresh();
    // 느린 자동 낙하. 바닥에 닿으면 멈춰서 Space 를 기다린다 (저절로 고정하지 않음)
    // 안내 말풍선이 떠 있는 동안은 멈춘다 (천천히 읽고 따라 하도록)
    if (tut?.active && !runner) gravityAt = t + GRAVITY_MS;
    if (!runner && play.active && t >= gravityAt) {
      play.softDrop(t);
      play.stack.groundedAt = null;
      gravityAt = t + GRAVITY_MS;
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
    renderArt(ctx, THEME, {
      board: play.board,
      links: sim?.links ?? computeLinks(play.board),
      switchState: (x, y) => sim?.switchStateAt(x, y) ?? play.board.partAt(x, y)?.start,
      locked: (x, y) => sim?.isCellLocked(x, y) ?? false,
      gearAngle: (x, y) => runner?.gearAngleAt(play.board, x, y) ?? 0,
      switchTurn: (x, y) => runner?.switchTurnAt(play.board, x, y) ?? 0,
      pressed: runner?.pressed(t) ?? new Set(),
      floating: a && !runner ? { cells: play.stack.cellsOf(a), x: a.x, y: a.y, ok: true } : null,
      ghost: g && !runner ? { cells: play.stack.cellsOf(g), x: g.x, y: g.y } : null,
      cursor: mode === 'part' && !runner ? cursor : null,
      hamster: runner?.hamster(t, play.board.h) ?? null,
      nextInject: runner && !runner.run.done ? runner.run.queue[runner.run.index]!.inject : (lv.queue[0]?.inject ?? null),
      bins: runner?.run.tally.bins ?? [],
      goals: lv.bins.map((b) => [b.red, b.blue]),
      fixedUids: play.built.fixed.minos,
      overlay: overlay(),
      time: t,
      binBounce: runner?.binBounce(t, lv.bins.length),
      failFlash: t < failUntil && Math.floor(t / 200) % 2 === 0,
      blink: Math.floor(t / 400) % 2 === 0,
    });
    if (celebrate && !drawCelebration(ctx, celebrate.ps, celebrate.t0, t, cw, ch)) celebrate = null;
    requestAnimationFrame(frame);
  }

  refresh();
  requestAnimationFrame(frame);
  const w = window as unknown as { __hamster: unknown };
  w.__hamster = { screen: 'level', play, get runner() { return runner; }, get message() { return message; }, get tutStep() { return tut?.active ? tut.index : -1; } };
  return {
    key,
    keyUp(e: KeyboardEvent) {
      repeat.release(e.key);
    },
    dispose() {
      alive = false;
      repeat.clear();
      window.removeEventListener('resize', onResize);
    },
  };
}
