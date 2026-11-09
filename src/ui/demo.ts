/**
 * 1번 레벨에 처음 들어갈 때 보여 주는 자동 플레이 데모 (키보드 전용, 아무 키 = 건너뛰고 시작).
 * 1번 정답을 보여 주지 않으려고 좌우가 뒤집힌 다른 작은 판에서:
 * 투입구 → 목표 통 → 미노 꺼내기 → 돌리기 → 옮기기 → 떨어뜨리기 → 실행 → 클리어 를 자막과 함께 보여 준다.
 */
import { parseLevel, queueItems } from '../core/level';
import { computeLinks } from '../core/links';
import { LevelPlay } from '../core/play';
import { BIN_WIDTH } from '../core/types';
import { artSize, burst, drawCelebration, renderArt, THEME, type Particle } from './art';
import { el, fitCanvas, renderHints, Runner, type Screen } from './runner';

/** 데모 판: 7×6, 오른쪽 투입구, J 튜브 하나를 오른쪽 아래에 */
const DEMO = parseLevel({
  id: 'demo',
  name: '데모',
  mechanic: '',
  w: 7,
  h: 6,
  queue: [{ color: 'red', inject: 'right' }],
  bins: [{ red: 0, blue: 0 }, { red: 0, blue: 0 }, { red: 1, blue: 0 }, { red: 0, blue: 0 }],
  allowed: { minos: ['J-tube'], parts: [] },
  budget: 4,
  fixed: { minos: [], parts: [] },
  solution: { minos: [{ id: 'J-tube', r: 3, x: 5, y: 3 }], parts: [] },
});
const TARGET = DEMO.solution!.minos[0]!;

type Cap = { text: string; keys: [string, string][]; at: 'inlet' | 'bin' | 'active' | 'top' };
const STEPS: Cap[] = [
  { text: '햄스터는 투입구에서 나와 아래로 떨어진다', keys: [], at: 'inlet' },
  { text: '목표 통에 넣으면 클리어', keys: [], at: 'bin' },
  { text: '숫자 키로 미노를 꺼낸다', keys: [['숫자', '꺼내기']], at: 'active' },
  { text: '돌려서 모양을 맞추고', keys: [['X / Z', '돌리기']], at: 'active' },
  { text: '옆으로 옮겨서', keys: [['← →', '옮기기']], at: 'active' },
  { text: '떨어뜨려 고정한다', keys: [['Space', '떨어뜨리기']], at: 'active' },
  { text: '실행! 튜브를 따라 굴러 통으로', keys: [['R', '실행']], at: 'inlet' },
  { text: '클리어! 이제 직접 해 보자', keys: [['아무 키', '시작']], at: 'top' },
];

export function startDemo(root: HTMLElement, onDone: () => void): Screen {
  const play = new LevelPlay(DEMO);
  let alive = true;
  let step = 0;
  let stepAt = performance.now();
  let runner: Runner | null = null;
  let celebrate: { ps: Particle[]; t0: number } | null = null;

  root.innerHTML = '';
  root.className = 'app';
  const left = el('div', 'left');
  const panel = el('div', 'panel');
  root.append(left, panel);
  const canvas = document.createElement('canvas');
  canvas.className = 'board';
  const [cw, ch] = artSize(play.board);
  let ctx = fitCanvas(canvas, cw, ch, left);
  const onResize = () => (ctx = fitCanvas(canvas, cw, ch, left));
  window.addEventListener('resize', onResize);
  const hints = el('div', 'hints');
  left.append(canvas, hints);
  renderHints(hints, [['아무 키', '건너뛰고 바로 시작']]);
  const list = el('ol', 'demosteps');
  const card = el('div', 'card');
  card.append(el('h2', '', '먼저 보기'), el('h1', '', '이렇게 하는 게임'), list);
  panel.append(card);

  function refreshList() {
    list.innerHTML = '';
    STEPS.forEach((s, i) => list.append(el('li', i === step ? 'on' : i < step ? 'done' : '', s.text)));
  }

  /** 단계마다: 들어갈 때 할 일, 다음으로 넘어갈 때까지 기다릴 시간(ms) */
  function go(i: number, now: number) {
    step = i;
    stepAt = now;
    if (i === 2) play.spawn(TARGET.id, now);
    if (i === 3) play.rotate(-1, now);
    if (i === 5) play.hardDrop();
    if (i === 6) runner = new Runner(play.board, queueItems(DEMO), now);
    if (i === 7) celebrate = { ps: burst(cw / 2, ch * 0.32, now), t0: now };
    refreshList();
  }

  function tick(now: number) {
    const dt = now - stepAt;
    if (step <= 1 && dt > 2200) return go(step + 1, now);
    if (step === 2 && dt > 1500) return go(3, now);
    if (step === 3 && dt > 1200) return go(4, now);
    if (step === 4) {
      const a = play.active;
      if (a && a.x !== TARGET.x && dt > 400) {
        play.move(a.x < TARGET.x ? 1 : -1, now);
        stepAt = now - 100;
      } else if (a && a.x === TARGET.x && dt > 700) go(5, now);
      return;
    }
    if (step === 5 && dt > 1000) return go(6, now);
    if (step === 6 && runner?.run.done && dt > 600) return go(7, now);
  }

  function anchor(c: Cap): { ax: number; ay: number; below: boolean } {
    if (c.at === 'inlet') return { ax: DEMO.w - 0.5, ay: 0.2, below: false };
    if (c.at === 'bin') {
      const i = DEMO.bins.findIndex((g) => g.red + g.blue > 0);
      return { ax: i * BIN_WIDTH + BIN_WIDTH / 2, ay: DEMO.h + 0.1, below: false };
    }
    const a = play.active;
    if (c.at === 'active' && a) {
      const cs = play.stack.cellsOf(a).map((q) => ({ x: a.x + q.x, y: Math.max(0, a.y + q.y) }));
      return { ax: cs.reduce((s, q) => s + q.x, 0) / cs.length + 0.5, ay: Math.max(...cs.map((q) => q.y)) + 1, below: true };
    }
    return { ax: DEMO.w / 2, ay: 2.5, below: true };
  }

  function frame(t: number) {
    if (!alive) return;
    tick(t);
    if (runner) runner.frame(t);
    const a = play.active;
    const g = play.ghost();
    const cap = STEPS[step]!;
    const p = anchor(cap);
    const glow = step >= 2 && step <= 5 ? play.stack.cellsOf({ defId: TARGET.id, r: TARGET.r }).map((c) => ({ x: TARGET.x + c.x, y: TARGET.y + c.y })) : [];
    renderArt(ctx, THEME, {
      board: play.board,
      links: runner?.sim?.links ?? computeLinks(play.board),
      switchState: () => undefined,
      locked: () => false,
      gearAngle: () => 0,
      switchTurn: () => 0,
      pressed: runner?.pressed(t) ?? new Set(),
      floating: a && !runner ? { cells: play.stack.cellsOf(a), x: a.x, y: a.y, ok: true } : null,
      ghost: g && !runner ? { cells: play.stack.cellsOf(g), x: g.x, y: g.y } : null,
      cursor: null,
      hamster: runner?.hamster(t, play.board.h) ?? null,
      nextInject: 'right',
      bins: runner?.run.tally.bins ?? [],
      goals: DEMO.bins.map((b) => [b.red, b.blue]),
      overlay: { glow, bubble: { text: cap.text, keys: cap.keys, ax: p.ax, ay: p.ay, below: p.below } },
      binBounce: runner?.binBounce(t, DEMO.bins.length),
      blink: Math.floor(t / 400) % 2 === 0,
      time: t,
    });
    if (celebrate && !drawCelebration(ctx, celebrate.ps, celebrate.t0, t, cw, ch)) celebrate = null;
    requestAnimationFrame(frame);
  }
  refreshList();
  requestAnimationFrame(frame);
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'demo', get step() { return step; } };
  return {
    key(e) {
      if (e.key === 'Shift' || e.ctrlKey || e.metaKey || e.repeat) return;
      e.preventDefault();
      onDone();
    },
    dispose() {
      alive = false;
      window.removeEventListener('resize', onResize);
    },
  };
}
