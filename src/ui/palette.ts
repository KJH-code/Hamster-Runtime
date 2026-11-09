/**
 * 판 옆 미노 팔레트: 모양 7칸, 칸마다 변형(튜브들 + 빈) 작은 그림과 키 숫자. 고른 것 강조.
 * 아래 줄은 부품 키 (S G M W P).
 */
import { srsCells } from '../core/level';
import { PART_NAMES } from '../core/parts';
import { opposite, sidesOf, type PartType } from '../core/types';
import { MINOS, PIECE_ORDER } from '../data/minos';
import { drawWoodCell, THEME, tubeCell } from './art';
import { el } from './runner';

const KEY_OF: Record<PartType, string> = { sensor: 'S', gear: 'G', motor: 'M', switch: 'W', plug: 'P' };
const MINI = 9;

/** 미노 하나를 작게 (중력 모드 처음 자세) */
function miniMino(defId: string, tone: number, picked: boolean, usable: boolean): HTMLCanvasElement {
  const cells = srsCells(defId, 0);
  const mx = Math.min(...cells.map((c) => c.x));
  const my = Math.min(...cells.map((c) => c.y));
  const w = Math.max(...cells.map((c) => c.x)) - mx + 1;
  const h = Math.max(...cells.map((c) => c.y)) - my + 1;
  const cv = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const W = 4 * MINI + 6;
  const H = 4 * MINI + 6;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  cv.className = 'mini' + (picked ? ' picked' : '') + (usable ? '' : ' unusable');
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const ox = (W - w * MINI) / 2;
  const oy = (H - h * MINI) / 2;
  const wood = THEME.woods[tone % THEME.woods.length]!;
  for (const c of cells) {
    const px = ox + (c.x - mx) * MINI;
    const py = oy + (c.y - my) * MINI;
    drawWoodCell(ctx, THEME, wood, px, py, MINI, c.x * 3 + c.y, c.cell.kind === 'empty');
    if (c.cell.kind === 'tube') {
      const arms = sidesOf(c.cell.inner).map((side) => ({ side, len: 0.5 }));
      if (c.cell.end) arms.push({ side: opposite(c.cell.inner), len: 0.45 });
      tubeCell(ctx, THEME, px + MINI / 2, py + MINI / 2, MINI, arms);
    }
  }
  return cv;
}

export interface PaletteState {
  allowedMinos: string[];
  /** 숫자 키 순서 (이 레벨에서 쓸 수 있는 모양 글자들) */
  keyOrder: string[];
  /** 지금 고른 모양 글자 (없으면 null) */
  letter: string | null;
  /** 지금 고른 미노 id */
  defId: string | null;
  allowedParts: PartType[];
  part: PartType | null;
  partMode: boolean;
}

export function renderPalette(box: HTMLElement, s: PaletteState) {
  box.innerHTML = '';
  const grid = el('div', 'pal7');
  PIECE_ORDER.forEach((letter, i) => {
    const defs = MINOS.filter((d) => d.piece === letter);
    const usable = defs.some((d) => s.allowedMinos.includes(d.id));
    const on = !s.partMode && s.letter === letter;
    const cell = el('div', 'palcell' + (on ? ' on' : '') + (usable ? '' : ' off'));
    const ki = s.keyOrder.indexOf(letter);
    cell.append(el('span', 'palkey', ki >= 0 ? String(ki + 1) : '·'));
    const row = el('div', 'palrow');
    for (const d of defs) row.append(miniMino(d.id, i, on && s.defId === d.id, s.allowedMinos.includes(d.id)));
    cell.append(row);
    grid.append(cell);
  });
  box.append(grid);
  const hint = el('div', 'dim', 'Q / E 로 튜브 ↔ 빈 변형');
  box.append(hint);
  if (s.allowedParts.length) {
    const parts = el('div', 'palparts');
    for (const t of s.allowedParts) {
      const chip = el('span', 'hint' + (s.partMode && s.part === t ? ' on' : ''));
      chip.append(el('kbd', '', KEY_OF[t]), el('span', '', PART_NAMES[t]));
      parts.append(chip);
    }
    box.append(parts);
  }
}
