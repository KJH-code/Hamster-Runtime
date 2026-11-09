/**
 * 효과음 — 파일 없이 Web Audio 로 짧게 합성한다. V 로 끄고 켠다 (기록은 storage.ts).
 * 브라우저는 사용자가 키를 누른 뒤에야 소리를 허락하므로 처음 소리 낼 때 AudioContext 를 만든다.
 */
import { isMuted } from './storage';

export type Sfx = 'drop' | 'connect' | 'rotate' | 'spawn' | 'sensor' | 'gear' | 'switch' | 'lock' | 'bin' | 'clear' | 'fail' | 'place' | 'hint';

let ac: AudioContext | null = null;
let master: GainNode | null = null;

function ctx(): AudioContext | null {
  if (ac) return ac;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
  } catch {
    ac = null;
  }
  return ac;
}

/** 음 하나: 파형, 시작·끝 주파수, 길이, 크기 */
function tone(a: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** 짧은 잡음 (철컥, 쿵의 질감) */
function noise(a: AudioContext, dur: number, vol: number, freq: number, delay = 0) {
  const t0 = a.currentTime + delay;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(master!);
  s.start(t0);
}

export function sfx(name: Sfx): void {
  if (isMuted()) return;
  const a = ctx();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  switch (name) {
    case 'drop':
      tone(a, 'sine', 140, 55, 0.16, 0.7);
      noise(a, 0.08, 0.35, 300);
      break;
    case 'connect':
      tone(a, 'triangle', 1320, 1320, 0.12, 0.25);
      tone(a, 'triangle', 1980, 1980, 0.16, 0.15, 0.05);
      break;
    case 'rotate':
      tone(a, 'square', 600, 700, 0.03, 0.05);
      break;
    case 'spawn':
      tone(a, 'sine', 440, 660, 0.07, 0.15);
      break;
    case 'place':
      tone(a, 'triangle', 520, 380, 0.08, 0.25);
      break;
    case 'sensor':
      tone(a, 'square', 880, 880, 0.05, 0.12);
      break;
    case 'gear':
      noise(a, 0.03, 0.4, 2400);
      noise(a, 0.03, 0.3, 2400, 0.06);
      break;
    case 'switch':
      noise(a, 0.06, 0.6, 900);
      tone(a, 'square', 220, 160, 0.06, 0.12);
      break;
    case 'lock':
      tone(a, 'sawtooth', 180, 90, 0.25, 0.2);
      noise(a, 0.1, 0.5, 600);
      break;
    case 'bin':
      tone(a, 'sine', 660, 990, 0.12, 0.35);
      break;
    case 'clear':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, 'triangle', f, f, 0.22, 0.3, i * 0.09));
      break;
    case 'fail':
      tone(a, 'sawtooth', 260, 110, 0.35, 0.18);
      break;
    case 'hint':
      tone(a, 'sine', 990, 1320, 0.1, 0.15);
      break;
  }
}
