/**
 * 화면 전환: 레벨 목록 ↔ 레벨 플레이 ↔ 샌드박스(에디터). 키 입력은 여기서 현재 화면으로 보낸다.
 */
import { LEVELS } from '../data/levels';
import { startSandbox } from './app';
import { startLevel } from './level';
import { startMenu } from './menu';
import type { Screen } from './runner';
import { bestPrice, isUnlocked } from './storage';
import { startDemo } from './demo';
import { startDaily } from './daily';
import { startRogue } from './rogue';
import { DEMO_LEVEL } from './tutorial';
import { newSandboxState } from './levelEditor';
import { startReplay } from './replay';
import { startAllClear } from './allclear';
import { shareFromHash } from '../core/share';

export function startShell(root: HTMLElement) {
  let screen: Screen | null = null;
  let menuSel = 0;
  const ids = LEVELS.map((l) => l.id);
  const sandboxState = newSandboxState();
  const show = (s: Screen) => {
    screen?.dispose();
    screen = s;
  };
  const menu = () => show(startMenu(root, LEVELS, menuSel, openLevel, sandbox, allClear, () => openDaily(), () => openRogue()));
  function allClear() {
    show(startAllClear(root, LEVELS, menu));
  }
  /** 1번에 처음 들어가면 데모 먼저 (이번 접속에서 한 번) */
  let demoShown = false;
  function openLevel(i: number) {
    menuSel = i;
    const lv = LEVELS[i]!;
    if (lv.id === DEMO_LEVEL && !demoShown && bestPrice(lv.id) === undefined) {
      demoShown = true;
      return show(startDemo(root, () => openLevel(i)));
    }
    const next = i + 1 < LEVELS.length ? () => (isUnlocked(ids, i + 1) ? openLevel(i + 1) : menu()) : undefined;
    const last = i === LEVELS.length - 1 ? allClear : undefined;
    show(startLevel(root, { level: LEVELS[i]!, number: i + 1, record: true, onExit: menu, onNext: next, onAllClear: last }));
  }
  /** 오늘의 퍼즐 (date 를 주면 그날 퍼즐 — #d=날짜 링크) */
  function openDaily(date?: string) {
    menuSel = LEVELS.length;
    show(
      startDaily(root, {
        date,
        onExit: () => (history.replaceState(null, '', location.pathname + location.search), menu()),
        onPlay: (level, title) => show(startLevel(root, { level, title, record: true, onExit: () => openDaily(date) })),
      }),
    );
  }
  /** 로그라이크 (linkSeed: #r=씨앗 링크) */
  function openRogue(linkSeed?: string) {
    menuSel = LEVELS.length + 1;
    show(
      startRogue(root, {
        linkSeed,
        onExit: () => (history.replaceState(null, '', location.pathname + location.search), menu()),
        play: (opts) => show(startLevel(root, opts)),
        back: () => openRogue(),
      }),
    );
  }
  function sandbox() {
    menuSel = LEVELS.length + 2;
    show(startSandbox(root, sandboxState, menu, (level) => show(startLevel(root, { level, record: false, onExit: sandbox }))));
  }
  /** 친구 풀이 링크(#s=코드)로 들어오면 풀이 보기. 나가면 주소에서 코드를 지운다 */
  const clearHash = () => history.replaceState(null, '', location.pathname + location.search);
  function replay(code: string) {
    show(
      startReplay(root, {
        code,
        onExit: () => (clearHash(), menu()),
        onPlay: (i) => (clearHash(), openLevel(i)),
      }),
    );
  }
  window.addEventListener('keydown', (e) => screen?.key(e));
  window.addEventListener('keyup', (e) => screen?.keyUp?.(e));
  const dailyFromHash = (h: string) => /^#d=(\d{4}-\d{2}-\d{2})$/.exec(h)?.[1];
  const rogueFromHash = (h: string) => {
    const m = /^#r=([A-Za-z0-9_%.-]{1,64})$/.exec(h)?.[1];
    return m ? decodeURIComponent(m) : undefined;
  };
  window.addEventListener('hashchange', () => {
    const c = shareFromHash(location.hash);
    if (c) replay(c);
    const d = dailyFromHash(location.hash);
    if (d) openDaily(d);
    const r = rogueFromHash(location.hash);
    if (r) openRogue(r);
  });
  const code = shareFromHash(location.hash);
  const dHash = dailyFromHash(location.hash);
  const rHash = rogueFromHash(location.hash);
  if (code) replay(code);
  else if (dHash) openDaily(dHash);
  else if (rHash) openRogue(rHash);
  else menu();
}
