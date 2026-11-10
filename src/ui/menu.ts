/**
 * 첫 화면 · 레벨 목록 — 키보드 전용. 방향키로 카드 고르기, Enter 열기. 순서대로 해금.
 */
import type { Level } from '../core/level';
import { E, W } from '../core/types';
import { drawHamster, THEME, tubeCell, tubeText } from './art';
import { copyLink, el, shareUrl, sizeCanvas, type Screen } from './runner';
import { bestCode, bestHinted, bestPrice, bestTime, bestTimeHinted, isUnlocked } from './storage';
import { formatTime } from '../core/share';
import { HIDE_PRICE } from './tutorial';

const COLS = 5;

export function startMenu(root: HTMLElement, levels: Level[], selected: number, onOpen: (i: number) => void, onSandbox: () => void, onAllClear?: () => void, onDaily?: () => void): Screen {
  const ids = levels.map((l) => l.id);
  const allDone = levels.every((l) => bestPrice(l.id) !== undefined);
  // 레벨 카드들 다음 = 오늘의 퍼즐, 샌드박스, (다 깼으면) 그다음 = 완주 기록
  const D = levels.length; // 오늘의 퍼즐
  const SB = D + 1; // 샌드박스
  const n = SB + 1 + (allDone && onAllClear ? 1 : 0);
  const dailyOpen = () => bestPrice(levels[0]?.id ?? '') !== undefined;
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
  const TW = 620;
  const TH = 200;
  const tctx = sizeCanvas(title, TW, TH);
  const head = el('div', 'titlehead');
  // 제목 글자는 캔버스가 그린다 (화면 읽기용으로만 h1 을 남긴다)
  head.append(el('h1', 'sronly', 'Hamster Runtime'));
  const cleared = levels.filter((l) => bestPrice(l.id) !== undefined).length;
  const term = [`$ hamster run --levels ${levels.length}`, `▸ ${cleared} / ${levels.length} cleared · 튜브 미노를 떨어뜨려 햄스터를 통으로`, '▸ press Enter'];
  const t0 = performance.now();
  const grid = el('div', 'lgrid');
  const daily = el('div', 'lcard sandbox');
  const sandbox = el('div', 'lcard sandbox');
  const trophy = el('div', 'lcard sandbox');
  const status = el('div', 'status');
  const help = el('div', 'hints');
  box.append(title, head, grid, daily, sandbox, trophy, help, status);

  /** 타이틀: 투명 튜브 글자 로고 + 밑줄 튜브를 구르는 햄스터 + 타이핑되는 터미널 줄 */
  function drawTitle(t: number) {
    tctx.fillStyle = THEME.bg;
    tctx.fillRect(0, 0, TW, TH);
    tctx.fillStyle = THEME.dot;
    for (let y = 10; y < TH; y += 24) for (let x = 10; x < TW; x += 24) {
      tctx.beginPath();
      tctx.arc(x, y, 1.3, 0, Math.PI * 2);
      tctx.fill();
    }
    tubeText(tctx, 'Hamster Runtime', TW / 2, 58, 68, t);
    // 밑줄 튜브 + 이음매 고리
    const s = 30;
    const n = Math.floor((TW - 60) / s);
    const x0 = (TW - n * s) / 2;
    const ry = 118;
    for (let i = 0; i < n; i++) {
      tubeCell(tctx, THEME, x0 + i * s + s / 2, ry, s, [{ side: W }, { side: E }]);
      if (i % 3 === 0 && i) {
        tctx.strokeStyle = THEME.coupler;
        tctx.lineWidth = 3;
        tctx.beginPath();
        tctx.moveTo(x0 + i * s, ry - s * 0.32);
        tctx.lineTo(x0 + i * s, ry + s * 0.32);
        tctx.stroke();
      }
    }
    const period = 7000;
    const hx = x0 + ((t % period) / period) * n * s;
    const hop = Math.abs(Math.sin(t / 140)) * 2;
    drawHamster(tctx, THEME, hx, ry - hop, s * 1.2, Math.floor(t / period) % 2, Math.sin(t / 140) * 0.05);
    // 터미널 줄: 처음 열 때 한 번 타이핑, 마지막 줄 커서 깜빡
    tctx.font = `500 13px 'JetBrains Mono', ui-monospace, monospace`;
    tctx.textAlign = 'left';
    tctx.textBaseline = 'alphabetic';
    let left = Math.floor((t - t0) / 28);
    term.forEach((ln, i) => {
      const k = Math.max(0, Math.min(ln.length, left));
      left -= ln.length;
      const cursor = i === term.length - 1 && k === ln.length && Math.floor(t / 500) % 2 ? '_' : '';
      tctx.fillStyle = i === 0 ? '#ffe14a' : '#9be7c4';
      tctx.fillText(ln.slice(0, k) + cursor, 30, 152 + i * 18);
    });
  }

  function refresh() {
    grid.innerHTML = '';
    levels.forEach((lv, i) => {
      const open = isUnlocked(ids, i);
      const best = bestPrice(lv.id);
      const c = el('div', 'lcard' + (i === sel ? ' pick' : '') + (open ? '' : ' locked') + (best !== undefined ? ' cleared' : ''));
      c.append(el('div', 'lnum', open ? String(i + 1) : '🔒'), el('div', 'lname', open ? lv.name : '잠김'));
      const noPrice = HIDE_PRICE.has(lv.id);
      const bulb = best !== undefined && bestHinted(lv.id) ? ' 💡' : '';
      const bt = bestTime(lv.id);
      if (bt !== undefined) c.append(el('div', 'ltime', `⏱ ${formatTime(bt)}${bestTimeHinted(lv.id) ? ' 💡' : ''}`));
      c.append(el('div', 'lbest', best !== undefined ? (noPrice ? `★ 클리어${bulb}` : `★ ${best} / ${lv.budget}${bulb}`) : open ? (noPrice ? '처음 해 보기' : `예산 ${lv.budget}`) : ''));
      grid.append(c);
    });
    daily.className = 'lcard sandbox daily' + (sel === D ? ' pick' : '') + (dailyOpen() ? '' : ' locked');
    daily.innerHTML = '';
    daily.append(el('div', 'lname', dailyOpen() ? '☀ 오늘의 퍼즐' : '🔒 오늘의 퍼즐'), el('div', 'lbest', dailyOpen() ? '매일 쌓기 하나 + 기계 하나 · 연속 기록' : '1번을 깨면 열린다'));
    sandbox.className = 'lcard sandbox' + (sel === SB ? ' pick' : '');
    sandbox.innerHTML = '';
    sandbox.append(el('div', 'lname', '샌드박스 · 레벨 에디터'), el('div', 'lbest', '자유 배치, 직접 레벨 만들기'));
    trophy.hidden = n === SB + 1;
    trophy.className = 'lcard sandbox trophy' + (sel === SB + 1 ? ' pick' : '');
    trophy.innerHTML = '';
    trophy.append(el('div', 'lname', '🏆 완주 기록'), el('div', 'lbest', '레벨별 최저 가격 모아 보기'));
    help.innerHTML = '';
    const canShare = sel < levels.length && bestCode(levels[sel]!.id) !== undefined;
    for (const [k, w] of [['← → ↑ ↓', '고르기'], ['Enter', '열기'], ...(canShare ? ([['C', '내 최저 풀이 링크 복사']] as const) : [])] as const) {
      const chip = el('span', 'hint');
      chip.append(el('kbd', '', k), el('span', '', w));
      help.append(chip);
    }
    help.append(el('span', 'dim', '앞 레벨을 깨면 다음 레벨이 열린다 · 💡 = 힌트를 보고 낸 기록'));
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
        if (sel === D) return dailyOpen() ? onDaily?.() : void (message = '1번을 먼저 깨면 오늘의 퍼즐이 열린다');
        if (sel === SB) return onSandbox();
        if (sel === SB + 1) return onAllClear?.();
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
