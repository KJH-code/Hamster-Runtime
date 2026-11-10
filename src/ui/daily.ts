/**
 * 오늘의 퍼즐 화면 — 키보드 전용. 쉬움(쌓기) · 어려움(기계) 두 카드, 연속 기록, 결과 공유 문구.
 * 퍼즐은 날짜(한국 시간)로 만든다 (core/daily.ts). 같은 날짜면 누구나 같은 퍼즐.
 */
import { dailyId, dailyLevel, kstDate, streakFrom, type DailyKind } from '../core/daily';
import type { Level } from '../core/level';
import { formatTime } from '../core/share';
import { PRICES } from '../data/prices';
import { copyLink, el, renderHints, type Screen } from './runner';
import { bestHinted, bestPrice, bestTime } from './storage';

const KINDS: DailyKind[] = ['easy', 'hard'];
const KIND_NAME: Record<DailyKind, string> = { easy: '쉬움 · 쌓기', hard: '어려움 · 기계' };

/** 그날 둘 중 하나라도 깼는가 */
const clearedOn = (date: string) => KINDS.some((k) => bestPrice(dailyId(date, k)) !== undefined);

/** 연속 기록: 오늘 깼으면 오늘부터, 아니면 어제부터 거꾸로 센다 */
export function streak(today: string): number {
  return streakFrom(today, clearedOn);
}

/** 별 셋: 클리어 · 만든 사람 풀이 가격 이하 · 힌트 없이 */
function stars(lv: Level): string {
  const p = bestPrice(lv.id);
  if (p === undefined) return '☆☆☆';
  const ref = Math.ceil(lv.budget / 2);
  return `★${p <= ref ? '★' : '☆'}${bestHinted(lv.id) ? '☆' : '★'}`;
}

/** 공유 문구 (워들처럼): 날짜, 두 퍼즐 별·가격·시간, 연속 기록, 링크 */
export function resultText(date: string, levels: Record<DailyKind, Level>, today: string): string {
  const lines = [`🐹 Hamster Runtime 데일리 ${date}`];
  for (const k of KINDS) {
    const lv = levels[k];
    const p = bestPrice(lv.id);
    const t = bestTime(lv.id);
    lines.push(`${k === 'easy' ? '쉬움' : '어려움'} ${stars(lv)} ${p !== undefined ? `${p}/${lv.budget}` : '—'}${t !== undefined ? ` ⏱ ${formatTime(t)}` : ''}`);
  }
  if (date === today) lines.push(`🔥 ${streak(today)}일 연속`);
  lines.push(`${location.origin}${location.pathname}#d=${date}`);
  return lines.join('\n');
}

export interface DailyOpts {
  /** 보여 줄 날짜 (없으면 오늘) */
  date?: string;
  onExit: () => void;
  onPlay: (level: Level, title: string) => void;
}

/** 같은 접속 안에서는 한 번 만든 퍼즐을 다시 쓴다 */
const cache = new Map<string, Level>();
export function getDaily(date: string, kind: DailyKind): Level {
  const id = dailyId(date, kind);
  let lv = cache.get(id);
  if (!lv) {
    lv = dailyLevel(date, kind, PRICES);
    cache.set(id, lv);
  }
  return lv;
}

export function startDaily(root: HTMLElement, o: DailyOpts): Screen {
  const today = kstDate(Date.now());
  const date = o.date ?? today;
  let sel = 0;
  let message = '';
  let levels: Record<DailyKind, Level> | null = null;
  root.innerHTML = '';
  root.className = 'app menu';
  const box = el('div', 'menubox');
  root.append(box);
  const head = el('div', 'titlehead');
  head.append(el('h1', 'bigtitle', '☀ 오늘의 퍼즐'), el('div', 'dim', `${date}${date === today ? ' (오늘)' : ''} · 한국 시간 자정에 바뀐다 · 누구나 같은 퍼즐`));
  const grid = el('div', 'dgrid');
  const info = el('div', 'dim');
  const help = el('div', 'hints');
  const status = el('div', 'status');
  box.append(head, grid, info, help, status);

  function refresh() {
    grid.innerHTML = '';
    if (!levels) {
      grid.append(el('div', 'dim', '퍼즐을 만드는 중…'));
      return;
    }
    KINDS.forEach((k, i) => {
      const lv = levels![k];
      const p = bestPrice(lv.id);
      const t = bestTime(lv.id);
      const c = el('div', 'lcard dcard' + (i === sel ? ' pick' : '') + (p !== undefined ? ' cleared' : ''));
      c.append(el('div', 'lname', KIND_NAME[k]), el('div', 'dstars', stars(lv)));
      c.append(el('div', 'lbest', p !== undefined ? `★ ${p} / ${lv.budget}${bestHinted(lv.id) ? ' 💡' : ''}` : `예산 ${lv.budget} · 햄스터 ${lv.queue.length}`));
      if (t !== undefined) c.append(el('div', 'ltime', `⏱ ${formatTime(t)}`));
      grid.append(c);
    });
    info.textContent = `🔥 ${streak(today)}일 연속 (둘 중 하나만 깨도 이어진다)`;
    renderHints(help, [['← →', '고르기'], ['Enter', '풀기'], ['C', '결과 공유 문구 복사'], ['Esc', '목록']]);
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
    if (e.key === 'Escape') return done(o.onExit);
    if (!levels) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return done(() => (sel = 1 - sel));
    if (e.key === 'Enter' || e.key === ' ') return done(() => o.onPlay(levels![KINDS[sel]!], `☀ ${date} ${KIND_NAME[KINDS[sel]!]}`));
    if (e.key === 'c' || e.key === 'C')
      return done(() => {
        const text = resultText(date, levels!, today);
        void copyLink(text).then((how) => {
          message = how === 'copied' ? '결과 문구를 복사했다 — 카톡 등에 붙여 넣기' : '창에서 Ctrl+C 로 복사';
          refresh();
        });
      });
  }

  refresh();
  // 화면을 먼저 그린 뒤 만든다 (1초 안팎)
  setTimeout(() => {
    levels = { easy: getDaily(date, 'easy'), hard: getDaily(date, 'hard') };
    refresh();
  }, 30);
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'daily', get levels() { return levels; } };
  return {
    key,
    dispose() {},
  };
}
