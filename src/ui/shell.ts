/**
 * 화면 전환: 레벨 목록 ↔ 레벨 플레이 ↔ 샌드박스(에디터). 키 입력은 여기서 현재 화면으로 보낸다.
 */
import { LEVELS } from '../data/levels';
import { startSandbox } from './app';
import { startLevel } from './level';
import { startMenu } from './menu';
import type { Screen } from './runner';
import { isUnlocked } from './storage';
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
  const menu = () => show(startMenu(root, LEVELS, menuSel, openLevel, sandbox, allClear));
  function allClear() {
    show(startAllClear(root, LEVELS, menu));
  }
  function openLevel(i: number) {
    menuSel = i;
    const next = i + 1 < LEVELS.length ? () => (isUnlocked(ids, i + 1) ? openLevel(i + 1) : menu()) : undefined;
    const last = i === LEVELS.length - 1 ? allClear : undefined;
    show(startLevel(root, { level: LEVELS[i]!, number: i + 1, record: true, onExit: menu, onNext: next, onAllClear: last }));
  }
  function sandbox() {
    menuSel = LEVELS.length;
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
  window.addEventListener('hashchange', () => {
    const c = shareFromHash(location.hash);
    if (c) replay(c);
  });
  const code = shareFromHash(location.hash);
  if (code) replay(code);
  else menu();
}
