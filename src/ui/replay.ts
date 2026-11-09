/**
 * 풀이 보기 — 친구가 보낸 링크(#s=코드)로 들어오는 화면. 키보드 전용.
 * 코드를 믿지 않고 엔진으로 다시 돌려 ✓/✗ 와 가격을 보여준다. R 재생, Enter 직접 풀기, Esc 목록.
 */
import { applyLayout, buildFixed, queueItems, type Built } from '../core/level';
import { computeLinks } from '../core/links';
import { checkShare } from '../core/share';
import { LEVELS } from '../data/levels';
import { PRICES } from '../data/prices';
import { artSize, renderArt, THEME } from './art';
import { el, fitCanvas, renderHints, Runner, type Screen } from './runner';
import { bestPrice, isUnlocked } from './storage';

export interface ReplayOpts {
  code: string;
  onExit: () => void;
  /** 이 레벨 직접 풀기 (열린 레벨일 때만) */
  onPlay: (levelIndex: number) => void;
}

export function startReplay(root: HTMLElement, o: ReplayOpts): Screen {
  const res = checkShare(o.code, LEVELS, PRICES);
  const lv = res.level;
  const idx = lv ? LEVELS.indexOf(lv) : -1;
  const open = idx >= 0 && isUnlocked(LEVELS.map((l) => l.id), idx);
  // 아직 안 깬 레벨이면 먼저 스포일러 경고
  let gate = !!lv && bestPrice(lv.id) === undefined;
  let runner: Runner | null = null;
  let alive = true;
  let speed = 1;

  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const panel = el('div', 'panel');
  root.append(left, panel);
  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  const hints = el('div', 'hints');
  const msg = el('div', 'status');
  left.append(canvas, hints, msg);

  let built: Built | null = null;
  if (lv) {
    built = buildFixed(lv);
    if (res.layout) applyLayout(lv, built, res.layout);
  }
  const [cw, ch] = built ? artSize(built.board) : [320, 200];
  let ctx = fitCanvas(canvas, cw, ch, left);
  const onResize = () => (ctx = fitCanvas(canvas, cw, ch, left));
  window.addEventListener('resize', onResize);

  const card = (...kids: HTMLElement[]) => {
    const c = el('div', 'card');
    c.append(...kids);
    return c;
  };
  const verdict = el('div', 'pricebig' + (res.ok ? '' : ' over'));
  panel.append(
    card(el('h2', '', '친구의 풀이'), el('h1', '', lv ? `${idx + 1}. ${lv.name}` : '알 수 없는 풀이'), lv ? el('div', 'mech', lv.mechanic) : el('div', '')),
    card(el('h2', '', '엔진으로 다시 확인'), verdict),
  );
  if (res.ok) {
    verdict.textContent = `✓ 클리어 · 가격 ${res.judgement.price} / ${res.level.budget}${res.hinted ? ' · 💡 힌트 사용' : ''}`;
    const mine = bestPrice(res.level.id);
    if (mine !== undefined) panel.lastElementChild!.append(el('div', 'dim', `내 최저 기록 ${mine}`));
  } else {
    verdict.textContent = `✗ ${res.reason}`;
    panel.lastElementChild!.append(el('div', 'dim', '이 풀이는 이 게임에서 깨지지 않는다 (코드가 바뀌었거나 레벨이 바뀜)'));
  }

  function refresh() {
    const pairs: [string, string][] = [];
    if (gate) pairs.push(['Enter', '스포일러지만 보기'], ['Esc', '목록']);
    else {
      if (lv) pairs.push(['R', runner ? '리셋' : '재생'], ['F', `빨리가기 ${speed}×`]);
      if (open) pairs.push(['Enter', '이 레벨 직접 풀기']);
      pairs.push(['Esc', '목록']);
    }
    renderHints(hints, pairs);
    msg.textContent = gate ? '아직 안 깬 레벨이다. 풀이를 보면 스포일러가 된다.' : runner?.run.done ? '재생 끝 — R 로 다시' : runner ? '재생 중' : 'R 로 햄스터를 굴려 본다';
    canvas.style.filter = gate ? 'blur(10px)' : '';
  }

  function key(e: KeyboardEvent) {
    const done = (f: () => void) => {
      e.preventDefault();
      f();
      refresh();
    };
    if (e.key === 'Escape') return done(o.onExit);
    if (gate) {
      if (e.key === 'Enter') return done(() => (gate = false));
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && lv && built)
      return done(() => {
        runner = runner ? null : new Runner(built!.board, queueItems(lv), performance.now());
        if (runner) runner.speed = speed;
      });
    if (e.key === 'Enter' && open) return done(() => o.onPlay(idx));
    if (e.key === 'f' || e.key === 'F')
      return done(() => {
        speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
        if (runner) runner.speed = speed;
      });
  }

  function frame(t: number) {
    if (!alive) return;
    if (runner) {
      const out = runner.frame(t);
      if (out) refresh();
    }
    if (built && lv) {
      const sim = runner?.sim ?? null;
      const b = built.board;
      renderArt(ctx, THEME, {
        board: b,
        links: sim?.links ?? computeLinks(b),
        switchState: (x, y) => sim?.switchStateAt(x, y) ?? b.partAt(x, y)?.start,
        locked: (x, y) => sim?.isCellLocked(x, y) ?? false,
        gearAngle: (x, y) => runner?.gearAngleAt(b, x, y) ?? 0,
        switchTurn: (x, y) => runner?.switchTurnAt(b, x, y) ?? 0,
        pressed: runner?.pressed(t) ?? new Set(),
        floating: null,
        ghost: null,
        cursor: null,
        hamster: runner?.hamster(t, b.h) ?? null,
        nextInject: runner && !runner.run.done ? runner.run.queue[runner.run.index]!.inject : (lv.queue[0]?.inject ?? null),
        bins: runner?.run.tally.bins ?? [],
        goals: lv.bins.map((g) => [g.red, g.blue]),
        binBounce: runner?.binBounce(t, lv.bins.length),
        fixedUids: built.fixed.minos,
        blink: Math.floor(t / 400) % 2 === 0,
        time: t,
      });
    } else {
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, cw, ch);
    }
    requestAnimationFrame(frame);
  }
  refresh();
  requestAnimationFrame(frame);
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'replay', res, get runner() { return runner; }, get gate() { return gate; } };
  return {
    key,
    dispose() {
      alive = false;
      window.removeEventListener('resize', onResize);
    },
  };
}
