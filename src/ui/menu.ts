/**
 * 레벨 목록 — 키보드 전용. ↑↓ 고르기, Enter 열기. 순서대로 해금.
 */
import type { Level } from '../core/level';
import { el, type Screen } from './runner';
import { bestPrice, isUnlocked } from './storage';

export function startMenu(root: HTMLElement, levels: Level[], selected: number, onOpen: (i: number) => void, onSandbox: () => void): Screen {
  const ids = levels.map((l) => l.id);
  const n = levels.length + 1; // 마지막 줄 = 샌드박스
  let sel = Math.max(0, Math.min(selected, n - 1));
  let message = '';
  root.innerHTML = '';
  root.className = 'app menu';
  const box = el('div', 'menubox');
  root.append(box);

  function refresh() {
    box.innerHTML = '';
    box.append(el('h1', '', 'Hamster Runtime'), el('div', 'dim', '↑↓ 고르기 · Enter 열기 · 앞 레벨을 깨면 다음 레벨이 열린다'));
    const list = el('div', 'levels');
    levels.forEach((lv, i) => {
      const open = isUnlocked(ids, i);
      const best = bestPrice(lv.id);
      const row = el('div', 'lrow' + (i === sel ? ' sel' : '') + (open ? '' : ' locked'));
      row.append(
        el('span', 'ln', `${i + 1}`),
        el('span', 'lname', open ? lv.name : '🔒 잠김'),
        el('span', 'lbest', best !== undefined ? `★ 최저 ${best} / 예산 ${lv.budget}` : open ? `예산 ${lv.budget}` : ''),
      );
      list.append(row);
    });
    const sb = el('div', 'lrow' + (sel === levels.length ? ' sel' : ''));
    sb.append(el('span', 'ln', '·'), el('span', 'lname', '샌드박스 · 레벨 에디터'), el('span', 'lbest', ''));
    list.append(sb);
    box.append(list, el('div', 'status', message || ' '));
  }

  function key(e: KeyboardEvent) {
    const done = (f: () => void) => {
      e.preventDefault();
      f();
      refresh();
    };
    if (e.key === 'ArrowUp') return done(() => (sel = (sel - 1 + n) % n));
    if (e.key === 'ArrowDown') return done(() => (sel = (sel + 1) % n));
    if (e.key === 'Enter' || e.key === ' ')
      return done(() => {
        if (sel === levels.length) return onSandbox();
        if (!isUnlocked(ids, sel)) return void (message = '잠긴 레벨 — 앞 레벨을 먼저 클리어');
        onOpen(sel);
      });
  }

  refresh();
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'menu', get sel() { return sel; } };
  return { key, dispose() {} };
}
