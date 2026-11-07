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

export function startShell(root: HTMLElement) {
  let screen: Screen | null = null;
  let menuSel = 0;
  const ids = LEVELS.map((l) => l.id);
  const sandboxState = newSandboxState();
  const show = (s: Screen) => {
    screen?.dispose();
    screen = s;
  };
  const menu = () => show(startMenu(root, LEVELS, menuSel, openLevel, sandbox));
  function openLevel(i: number) {
    menuSel = i;
    const next = i + 1 < LEVELS.length ? () => (isUnlocked(ids, i + 1) ? openLevel(i + 1) : menu()) : undefined;
    show(startLevel(root, { level: LEVELS[i]!, number: i + 1, record: true, onExit: menu, onNext: next }));
  }
  function sandbox() {
    menuSel = LEVELS.length;
    show(startSandbox(root, sandboxState, menu, (level) => show(startLevel(root, { level, record: false, onExit: sandbox }))));
  }
  window.addEventListener('keydown', (e) => screen?.key(e));
  window.addEventListener('keyup', (e) => screen?.keyUp?.(e));
  menu();
}
