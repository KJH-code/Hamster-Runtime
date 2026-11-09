/**
 * 판 위 가벼운 연출 (칸 좌표로 받는다). 퍼즐 집중을 해치지 않게 짧고 작게.
 * - dust: 미노가 떨어진 바닥 칸 아래로 먼지
 * - flash: 방금 놓인 칸이 잠깐 하얗게
 * - spark: 튜브가 새로 이어진 이음매 · 스위치 넘어감 · 통 들어감에 반짝
 * - shake: 판 흔들림 (캔버스 CSS 이동, 1~4px)
 */
import { CELL, TOP } from './art';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  color: string;
  size: number;
}
interface Flash {
  cells: { x: number; y: number }[];
  t0: number;
  life: number;
}
interface Ring {
  x: number;
  y: number;
  t0: number;
  life: number;
  color: string;
  r: number;
}

export class Fx {
  private ps: Particle[] = [];
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private shakeUntil = 0;
  private shakeAmp = 0;

  /** 칸 좌표 → 캔버스 픽셀 (칸 가운데) */
  private px(x: number, y: number): [number, number] {
    return [(x + 0.5) * CELL, (TOP + y + 0.5) * CELL];
  }

  dust(cells: { x: number; y: number }[], now: number): void {
    for (const c of cells) {
      const [cx, cy] = this.px(c.x, c.y);
      for (let k = 0; k < 4; k++)
        this.ps.push({ x: cx + (Math.random() - 0.5) * CELL * 0.8, y: cy + CELL * 0.48, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30, t0: now, life: 380, color: 'rgba(230,220,200,', size: 2 + Math.random() * 2.5 });
    }
  }

  flash(cells: { x: number; y: number }[], now: number): void {
    this.flashes.push({ cells, t0: now, life: 200 });
  }

  /** 반짝: 칸 좌표 (소수 가능 — 이음매는 두 칸 사이) */
  spark(x: number, y: number, now: number, color = '#ffe14a', r = 14): void {
    const [cx, cy] = this.px(x, y);
    this.rings.push({ x: cx, y: cy, t0: now, life: 420, color, r });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.random() * 0.4;
      this.ps.push({ x: cx, y: cy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, t0: now, life: 320, color: color === '#ffe14a' ? 'rgba(255,225,74,' : 'rgba(155,231,255,', size: 2.2 });
    }
  }

  shake(amp: number, ms: number, now: number): void {
    this.shakeAmp = Math.max(amp, now < this.shakeUntil ? this.shakeAmp : 0);
    this.shakeUntil = Math.max(this.shakeUntil, now + ms);
  }

  /** 캔버스에 줄 흔들림 이동 (px) */
  offset(now: number): [number, number] {
    if (now >= this.shakeUntil) return [0, 0];
    const k = this.shakeAmp;
    return [Math.round((Math.random() - 0.5) * 2 * k), Math.round((Math.random() - 0.5) * 2 * k)];
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const s = CELL;
    this.flashes = this.flashes.filter((f) => now - f.t0 < f.life);
    for (const f of this.flashes) {
      const a = 1 - (now - f.t0) / f.life;
      ctx.fillStyle = `rgba(255,255,255,${0.45 * a})`;
      for (const c of f.cells) ctx.fillRect(c.x * s, (TOP + c.y) * s, s, s);
    }
    this.rings = this.rings.filter((r) => now - r.t0 < r.life);
    for (const r of this.rings) {
      const e = (now - r.t0) / r.life;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - e;
      ctx.lineWidth = 3 * (1 - e) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.4 + e), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.ps = this.ps.filter((p) => now - p.t0 < p.life);
    for (const p of this.ps) {
      const e = (now - p.t0) / p.life;
      const tt = (now - p.t0) / 1000;
      ctx.fillStyle = `${p.color}${(1 - e).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x + p.vx * tt, p.y + p.vy * tt + 60 * tt * tt, p.size * (1 - e * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clear(): void {
    this.ps = [];
    this.flashes = [];
    this.rings = [];
    this.shakeUntil = 0;
  }
}
