/**
 * 첫 화면 · 레벨 목록 — 키보드 전용. 방향키로 카드 고르기, Enter 열기. 순서대로 해금.
 */
import type { Level } from '../core/level';
import { E, W } from '../core/types';
import { drawHamster, THEME, tubeCell } from './art';
import { copyLink, el, shareUrl, sizeCanvas, type Screen } from './runner';
import { bestCode, bestPrice, isUnlocked } from './storage';

const COLS = 5;

export function startMenu(root: HTMLElement, levels: Level[], selected: number, onOpen: (i: number) => void, onSandbox: () => void, onAllClear?: () => void): Screen {
  const ids = levels.map((l) => l.id);
  const allDone = levels.every((l) => bestPrice(l.id) !== undefined);
  // 레벨 카드들 다음 = 샌드박스, (다 깼으면) 그다음 = 완주 기록
  const n = levels.length + 1 + (allDone && onAllClear ? 1 : 0);
  let sel = Math.max(0, Math.min(selected, n - 1));
  let message = '';
  let alive = true;
  root.innerHTML = '';
  root.className = 'app menu';
  const box = el('div', 'menubox');
  root.append(box);

  // 제목: 투명 튜브 속을 굴러가는 햄스터
  const title = document.createElement('canvas');
  title.className = 'titlecv';
  const TW = 600;
  const TH = 90;
  const tctx = sizeCanvas(title, TW, TH);
  const head = el('div', 'titlehead');
  head.append(el('h1', 'bigtitle', 'Hamster Runtime'), el('div', 'dim', '튜브 미노를 떨어뜨려 쌓아 햄스터를 통으로'));
  const grid = el('div', 'lgrid');
  const sandbox = el('div', 'lcard sandbox');
  const trophy = el('div', 'lcard sandbox');
  const status = el('div', 'status');
  const help = el('div', 'hints');
  box.append(title, head, grid, sandbox, trophy, help, status);

  function drawTitle(t: number) {
    tctx.fillStyle = THEME.bg;
    tctx.fillRect(0, 0, TW, TH);
    const s = 40;
    const cy = 48;
    const cells = Math.floor(TW / s);
    for (let i = 0; i < cells; i++) {
      // 나무 받침 + 튜브
      const wood = THEME.woods[i % THEME.woods.length]!;
      tctx.fillStyle = wood[1];
      tctx.fillRect(i * s, cy - s / 2, s, s);
      tctx.strokeStyle = 'rgba(255,255,255,0.8)';
      tctx.lineWidth = 1.5;
      tctx.strokeRect(i * s + 0.75, cy - s / 2 + 0.75, s - 1.5, s - 1.5);
      tubeCell(tctx, THEME, i * s + s / 2, cy, s, [{ side: W }, { side: E }]);
    }
    const period = 7000;
    const x = ((t % period) / period) * (TW + 80) - 40;
    const hop = Math.abs(Math.sin(t / 160)) * 3;
    drawHamster(tctx, THEME, x, cy - hop, s * 1.2, Math.floor(t / period) % 2, Math.sin(t / 160) * 0.04);
  }

  function refresh() {
    grid.innerHTML = '';
    levels.forEach((lv, i) => {
      const open = isUnlocked(ids, i);
      const best = bestPrice(lv.id);
      const c = el('div', 'lcard' + (i === sel ? ' pick' : '') + (open ? '' : ' locked') + (best !== undefined ? ' cleared' : ''));
      c.append(el('div', 'lnum', open ? String(i + 1) : '🔒'), el('div', 'lname', open ? lv.name : '잠김'));
      c.append(el('div', 'lbest', best !== undefined ? `★ ${best} / ${lv.budget}` : open ? `예산 ${lv.budget}` : ''));
      grid.append(c);
    });
    sandbox.className = 'lcard sandbox' + (sel === levels.length ? ' pick' : '');
    sandbox.innerHTML = '';
    sandbox.append(el('div', 'lname', '샌드박스 · 레벨 에디터'), el('div', 'lbest', '자유 배치, 직접 레벨 만들기'));
    trophy.hidden = n === levels.length + 1;
    trophy.className = 'lcard sandbox trophy' + (sel === levels.length + 1 ? ' pick' : '');
    trophy.innerHTML = '';
    trophy.append(el('div', 'lname', '🏆 완주 기록'), el('div', 'lbest', '레벨별 최저 가격 모아 보기'));
    help.innerHTML = '';
    const canShare = sel < levels.length && bestCode(levels[sel]!.id) !== undefined;
    for (const [k, w] of [['← → ↑ ↓', '고르기'], ['Enter', '열기'], ...(canShare ? ([['C', '내 최저 풀이 링크 복사']] as const) : [])] as const) {
      const chip = el('span', 'hint');
      chip.append(el('kbd', '', k), el('span', '', w));
      help.append(chip);
    }
    help.append(el('span', 'dim', '앞 레벨을 깨면 다음 레벨이 열린다'));
    status.textContent = message || ' ';
    status.hidden = !message;
  }

  function key(e: KeyboardEvent) {
    const done = (f: () => void) => {
      e.preventDefault();
      message = '';
      f();
      refresh();
    };
    const L = levels.length;
    if (e.key === 'ArrowLeft') return done(() => (sel = (sel - 1 + n) % n));
    if (e.key === 'ArrowRight') return done(() => (sel = (sel + 1) % n));
    if (e.key === 'ArrowUp') return done(() => (sel = sel > L ? sel - 1 : sel === L ? Math.min(L - 1, (Math.ceil(L / COLS) - 1) * COLS) : Math.max(0, sel - COLS)));
    if (e.key === 'ArrowDown') return done(() => (sel = sel < L ? (sel + COLS < L ? sel + COLS : L) : Math.min(n - 1, sel + 1)));
    if (e.key === 'c' || e.key === 'C')
      return done(() => {
        const code = sel < L ? bestCode(levels[sel]!.id) : undefined;
        if (!code) return void (message = '이 레벨은 공유할 풀이가 없다 (깨면 생긴다)');
        void copyLink(shareUrl(code)).then((how) => {
          message = how === 'copied' ? `${sel + 1}번 최저 풀이 링크를 복사했다` : '링크 창에서 Ctrl+C 로 복사';
          refresh();
        });
      });
    if (e.key === 'Enter' || e.key === ' ')
      return done(() => {
        if (sel === L) return onSandbox();
        if (sel === L + 1) return onAllClear?.();
        if (!isUnlocked(ids, sel)) return void (message = '잠긴 레벨 — 앞 레벨을 먼저 클리어');
        onOpen(sel);
      });
  }

  function frame(t: number) {
    if (!alive) return;
    drawTitle(t);
    requestAnimationFrame(frame);
  }
  refresh();
  requestAnimationFrame(frame);
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'menu', get sel() { return sel; } };
  return {
    key,
    dispose() {
      alive = false;
    },
  };
}
