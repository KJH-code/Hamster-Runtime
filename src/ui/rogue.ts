/**
 * 로그라이크 화면 — 키보드 전용. 시작 / 층 사이(허브) / 보상 고르기 / 끝. 층 풀기는 레벨 화면을 빌려 쓴다.
 * 런은 매 걸음 storage 에 저장된다 (브라우저를 닫아도 이어하기).
 */
import { kstDate } from '../core/daily';
import { verifyLayout } from '../core/level';
import { PART_NAMES } from '../core/parts';
import { clearFloor, floorLevel, newRun, parseRun, pickReward, runPrices, skipFloor, weeklySeed, type Reward, type RunState } from '../core/rogue';
import { MINOS } from '../data/minos';
import { PRICES } from '../data/prices';
import { RELICS } from '../data/relics';
import type { LevelScreenOpts } from './level';
import { copyLink, el, renderHints, type Screen } from './runner';
import { bestFloor, recordFloor, saveRun, savedRun } from './storage';

export interface RogueOpts {
  /** #r=씨앗 링크로 들어왔으면 그 씨앗 */
  linkSeed?: string;
  onExit: () => void;
  /** 층 풀기: 레벨 화면 열기 (돌아오면 startRogue 를 다시 부른다) */
  play: (opts: Omit<LevelScreenOpts, 'onExit'> & { onExit: () => void }) => void;
  back: () => void;
}

const minoName = (id: string) => MINOS.find((d) => d.id === id)?.name ?? id;
const relicOf = (id: string) => RELICS.find((r) => r.id === id);
const weekOf = (st: RunState) => (st.seed.startsWith('week-') ? st.seed : undefined);
const seedUrl = (seed: string) => `${location.origin}${location.pathname}#r=${encodeURIComponent(seed)}`;

function rewardText(r: Reward): [string, string, string] {
  if (r.kind === 'mino') return ['미노', minoName(r.id), '이 모양을 덱에 (개수 제한 없음)'];
  if (r.kind === 'part') return ['부품', PART_NAMES[r.type], r.type === 'plug' ? '튜브 끝 막기' : '기계 부품 (넷을 다 모으면 3층마다 기계 층)'];
  const rl = relicOf(r.id);
  return ['유물', rl?.name ?? r.id, rl?.desc ?? ''];
}

export function startRogue(root: HTMLElement, o: RogueOpts): Screen {
  let run = parseRun(savedRun());
  let view: 'start' | 'hub' | 'reward' | 'over' = o.linkSeed || !run ? 'start' : run.phase === 'reward' ? 'reward' : run.phase === 'over' ? 'over' : 'hub';
  let sel = 0;
  let message = '';
  let busy = false;
  root.innerHTML = '';
  root.className = 'app menu';
  const box = el('div', 'menubox');
  root.append(box);

  const save = () => saveRun(run);
  function begin(seed: string) {
    run = newRun(seed);
    save();
    view = 'hub';
  }

  function playFloor() {
    if (!run || busy) return;
    busy = true;
    message = `${run.floor}층을 만드는 중…`;
    refresh();
    setTimeout(() => {
      const st = run!;
      const { level, floorBudget, machine } = floorLevel(st, PRICES);
      const prices = runPrices(st, PRICES);
      const ref = verifyLayout(level, level.solution!, prices).judgement?.price;
      let cleared = false;
      o.play({
        level,
        title: `🎲 ${st.floor}층${machine ? ' · 기계' : ''} · ♥${st.lives} · 💰${st.wallet} (+${floorBudget})`,
        record: false,
        prices,
        refPrice: ref,
        share: false,
        nextLabel: '보상 고르기',
        onCleared: (price) => {
          if (cleared) return;
          cleared = true;
          run = clearFloor(st, price, level.budget);
          recordFloor(run.cleared, weekOf(run));
          save();
        },
        onNext: () => o.back(),
        onSkip: () => {
          run = skipFloor(st);
          if (run.phase === 'over') recordFloor(run.cleared, weekOf(run));
          save();
          o.back();
        },
        // Esc: 이 층은 그대로 두고 허브로 (다시 들어오면 같은 층)
        onExit: () => o.back(),
      });
    }, 30);
  }

  function refresh() {
    box.innerHTML = '';
    const head = el('div', 'titlehead');
    head.append(el('h1', 'bigtitle', '🎲 로그라이크'), el('div', 'dim', '끝없는 층 · 가진 미노로만 · 남긴 돈은 다음 층으로 · 목숨 3'));
    box.append(head);
    const help = el('div', 'hints');
    const card = el('div', 'card');
    box.append(card);
    if (view === 'start') {
      const week = weeklySeed(kstDate(Date.now()));
      if (o.linkSeed) card.append(el('h2', '', '친구가 보낸 씨앗'), el('div', '', `씨앗 ${o.linkSeed} — 같은 층·같은 보상이 나온다`));
      if (run && run.phase !== 'over') card.append(el('div', '', `이어하기: ${run.floor}층 · ♥${run.lives} · 💰${run.wallet}`));
      card.append(el('div', 'dim', `최고 기록: ${bestFloor()}층 깸 · 이번 주(${week.slice(5)}) ${bestFloor(week)}층`));
      card.append(el('div', 'dim', '시작 덱: I·L·J 튜브 + O 빈. 층을 깨면 미노·부품·유물 중 하나를 고른다. K 두 번 = 층 포기 (목숨 -1)'));
      const pairs: [string, string][] = [];
      if (o.linkSeed) pairs.push(['Enter', '이 씨앗으로 새 런']);
      else if (run && run.phase !== 'over') pairs.push(['Enter', '이어하기'], ['N', '새 런']);
      else pairs.push(['Enter', '새 런']);
      pairs.push(['W', `주간 런 (${week.slice(5)})`], ['Esc', '목록']);
      renderHints(help, pairs);
    } else if (run && (view === 'hub' || view === 'reward')) {
      const stats = el('div', 'rstats');
      stats.append(el('span', 'rbig', `${run.floor}층`), el('span', 'rbig', `${'♥'.repeat(Math.max(0, run.lives))}`), el('span', 'rbig', `💰 ${run.wallet}`));
      card.append(stats);
      card.append(el('div', 'dim', `미노: ${run.minos.map(minoName).join(' · ')}`));
      card.append(el('div', 'dim', `부품: ${run.parts.map((t) => PART_NAMES[t]).join(' · ') || '없음'}`));
      card.append(el('div', 'dim', `유물: ${run.relics.map((id) => relicOf(id)?.name ?? id).join(' · ') || '없음'}`));
      card.append(el('div', 'dim', `씨앗 ${run.seed}`));
      if (view === 'reward') {
        const grid = el('div', 'dgrid rgrid');
        run.offer.forEach((r, i) => {
          const [kind, name, desc] = rewardText(r);
          const c = el('div', 'lcard dcard' + (i === sel ? ' pick' : ''));
          c.append(el('div', 'dim', kind), el('div', 'lname', name), el('div', 'lbest', desc));
          grid.append(c);
        });
        box.append(el('h2', '', `${run.cleared}층 클리어! 보상 하나를 고른다`), grid);
        renderHints(help, [['← →', '고르기'], ['Enter', '가져가기']]);
      } else renderHints(help, [['Enter', `${run.floor}층 풀기`], ['C', '씨앗 링크 복사'], ['Esc', '목록 (저장됨)']]);
    } else if (run && view === 'over') {
      const week = weekOf(run);
      card.append(el('h2', '', '런 끝'), el('div', 'rbig', `${run.cleared}층 깸`), el('div', 'dim', `최고 ${bestFloor()}층${week ? ` · 이번 주 ${bestFloor(week)}층` : ''} · 씨앗 ${run.seed}`));
      renderHints(help, [['C', '씨앗 링크 복사 (친구도 같은 런)'], ['Enter', '처음으로'], ['Esc', '목록']]);
    }
    box.append(help);
    const status = el('div', 'status', message || ' ');
    status.hidden = !message;
    box.append(status);
  }

  function key(e: KeyboardEvent) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const done = (f: () => void) => {
      e.preventDefault();
      message = '';
      f();
      refresh();
    };
    if (busy) return;
    if (k === 'Escape') return done(o.onExit);
    if (view === 'start') {
      if (k === 'w') return done(() => begin(weeklySeed(kstDate(Date.now()))));
      if (k === 'n' && !o.linkSeed) return done(() => begin(`r-${Date.now().toString(36)}`));
      if (k === 'Enter' || k === ' ')
        return done(() => {
          if (o.linkSeed) begin(o.linkSeed);
          else if (run && run.phase !== 'over') view = run.phase === 'reward' ? 'reward' : 'hub';
          else begin(`r-${Date.now().toString(36)}`);
        });
      return;
    }
    if (!run) return;
    if (k === 'c')
      return done(() => {
        void copyLink(seedUrl(run!.seed)).then((how) => {
          message = how === 'copied' ? '씨앗 링크를 복사했다 — 친구도 같은 층·같은 보상' : '링크 창에서 Ctrl+C';
          refresh();
        });
      });
    if (view === 'hub' && (k === 'Enter' || k === ' ')) return done(playFloor);
    if (view === 'reward') {
      const n = run.offer.length;
      if (k === 'ArrowLeft') return done(() => (sel = (sel - 1 + n) % n));
      if (k === 'ArrowRight') return done(() => (sel = (sel + 1) % n));
      if (k === 'Enter' || k === ' ')
        return done(() => {
          run = pickReward(run!, sel);
          save();
          sel = 0;
          view = 'hub';
        });
    }
    if (view === 'over' && (k === 'Enter' || k === ' '))
      return done(() => {
        run = null;
        save();
        view = 'start';
      });
  }

  refresh();
  (window as unknown as { __hamster: unknown }).__hamster = { screen: 'rogue', get view() { return view; }, get run() { return run; } };
  return { key, dispose() {} };
}
