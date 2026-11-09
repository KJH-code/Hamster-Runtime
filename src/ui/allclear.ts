/**
 * 끝 화면 — 모든 레벨을 다 깨면. 레벨별 내 최저 / 예산, 총합, 가벼운 축하. 키보드 전용.
 */
import type { Level } from '../core/level';
import { burst, drawCelebration, drawHamster, THEME, type Particle } from './art';
import { el, renderHints, sizeCanvas, type Screen } from './runner';
import { bestHinted, bestPrice } from './storage';

export function startAllClear(root: HTMLElement, levels: Level[], onExit: () => void): Screen {
  let alive = true;
  root.innerHTML = '';
  root.className = 'app menu';
  const box = el('div', 'menubox');
  root.append(box);
  const W = 600;
  const H = 170;
  const cv = document.createElement('canvas');
  cv.className = 'titlecv';
  const ctx = sizeCanvas(cv, W, H);
  const head = el('div', 'titlehead');
  head.append(el('h1', 'bigtitle', '모든 레벨 클리어!'), el('div', 'dim', '햄스터들이 전부 제 통에 들어갔다'));

  const table = el('div', 'card');
  const rows = el('div', 'clearrows');
  let total = 0;
  let totalBudget = 0;
  let under = 0;
  levels.forEach((lv, i) => {
    const best = bestPrice(lv.id);
    total += best ?? 0;
    totalBudget += lv.budget;
    // 참조 풀이 가격 = 예산의 절반 (예산 = 참조 × 2). 참조 이하면 별
    const ref = Math.ceil(lv.budget / 2);
    const star = best !== undefined && best <= ref;
    if (star) under++;
    const r = el('div', 'crow');
    r.append(el('span', 'cn', String(i + 1)), el('span', 'cname', lv.name), el('span', 'cbest' + (star ? ' star' : ''), best !== undefined ? `${star ? '★ ' : ''}${best}${bestHinted(lv.id) ? ' 💡' : ''}` : '—'), el('span', 'cbud', `/ ${lv.budget}`));
    rows.append(r);
  });
  const sum = el('div', 'csum');
  sum.append(el('span', '', '합계'), el('span', 'pricebig', `${total} / ${totalBudget}`));
  table.append(el('h2', '', '내 최저 가격 / 예산'), rows, sum, el('div', 'dim', `★ = 만든 사람 풀이 가격 이하 (${under}/${levels.length}) · 💡 = 힌트를 보고 낸 기록. 더 싸게 풀 수 있는지 다시 도전해 보자`));
  const help = el('div', 'hints');
  renderHints(help, [['Enter / Esc', '레벨 목록']]);
  help.append(el('span', 'dim', '레벨 카드에서 C 로 내 풀이 링크를 복사해 친구와 비교'));
  box.append(cv, head, table, help);

  let ps: Particle[] = [];
  let t0 = 0;
  function frame(t: number) {
    if (!alive) return;
    if (!ps.length || t - t0 > 3200) {
      t0 = t;
      ps = burst(W / 2, H * 0.55, t, 30);
    }
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      const hop = Math.abs(Math.sin(t / 220 + i)) * 14;
      drawHamster(ctx, THEME, 90 + i * 105, 120 - hop, 70, i % 2, Math.sin(t / 220 + i) * 0.06);
    }
    drawCelebration(ctx, ps, -1e9, t, W, H);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'allclear', total };
  return {
    key(e) {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        onExit();
      }
    },
    dispose() {
      alive = false;
    },
  };
}
