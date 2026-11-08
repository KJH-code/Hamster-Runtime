/**
 * 단계별 안내 (튜토리얼). 한 단계 = "지금 할 일" 한 줄 + 누를 키. 해내면 다음 단계로.
 * 조작만 가르치고 풀이는 알려주지 않는다. N = 다음 단계 (설명만 있는 단계, 또는 건너뛰기).
 * 화면이 event('spawn') 처럼 알려주면 그 이벤트를 기다리던 단계가 끝난다.
 */
import { el } from './runner';

export interface Step {
  text: string;
  keys: [string, string][];
  /** 이 이벤트 중 하나가 오면 다음 단계. 없으면 N 으로만 넘어간다 */
  on?: string[];
}

export const LEVEL_TUTORIALS: Record<string, Step[]> = {
  '01-first-tube': [
    { text: '햄스터가 ▼왼 투입구에서 떨어진다. 아래 통에 적힌 목표(빨강·파랑 마릿수)대로 담으면 클리어.', keys: [['N', '다음']] },
    { text: '숫자 키로 미노를 꺼낸다. 맨 위 가운데에 나타난다.', keys: [['1~7', '미노 꺼내기'], ['Q / E', '튜브 ↔ 빈 변형']], on: ['spawn'] },
    {
      text: '← → 로 옮기고 X / Z 로 돌린다. 점선 칸 = 떨어질 자리. ↓ 로 한 칸씩 내린 뒤 옆으로 밀면 튀어나온 미노 밑으로도 넣을 수 있다.',
      keys: [['← →', '옮기기'], ['X / Z', '회전'], ['↓', '한 칸 내리기']],
      on: ['move', 'rotate'],
    },
    { text: 'Space 로 떨어뜨린다. 미노는 바닥이나 다른 미노 위에 쌓인다.', keys: [['Space', '떨어뜨리기']], on: ['drop'] },
    {
      text: '튜브 끝이 다른 미노의 끝과 맞닿으면 저절로 이어진다. 위로 열린 끝은 떨어지는 햄스터를 받는다. 투입구에서 목표 통까지 길을 만들어 보자.',
      keys: [['Delete', '마지막 미노 지우기'], ['Ctrl+Z', '되돌리기'], ['N', '다음']],
    },
    { text: 'R 로 실행. 햄스터가 길을 따라 굴러간다.', keys: [['R', '실행']], on: ['run'] },
    { text: '통 목표가 다 맞고 가격이 예산 안이면 클리어. 안 맞으면 R 로 리셋하고 고친다.', keys: [['R', '리셋'], ['N', '안내 닫기']], on: ['clear'] },
  ],
  '02-junction-plug': [
    { text: '주황 테두리 칸 = 분기점(3갈래 이상). 스위치 없는 분기점에 오면 햄스터가 멈춘다.', keys: [['N', '다음']] },
    { text: 'Shift 를 눌렀다 떼면 부품 모드가 된다.', keys: [['Shift', '부품 모드']], on: ['mode:part'] },
    { text: '방향키로 칸 커서(점선 네모)를 옮긴다.', keys: [['방향키', '커서']], on: ['cursor'] },
    { text: '마개는 튜브의 끝 칸에만 끼운다. 그 끝은 닫혀서 아무 데도 이어지지 않는다.', keys: [['1', '마개'], ['Space', '놓기'], ['Delete', '지우기']], on: ['part:plug'] },
    { text: 'R 로 실행해서 확인한다.', keys: [['R', '실행']], on: ['run'] },
  ],
  '03-switch-start': [
    { text: '스위치 = 분기점에 끼우는 ㄱ자 관. 흰 점(공통 갈래)과 그 직각 갈래 하나만 잇는다.', keys: [['N', '다음']] },
    { text: '부품 모드에서 스위치를 골라 분기점(주황 테두리)에 놓는다.', keys: [['Shift', '부품 모드'], ['2', '스위치'], ['Space', '놓기']], on: ['part:switch'] },
    { text: '커서를 스위치 위에 두고 처음 방향을 고른다. A = 흰 점에서 반시계 쪽, B = 시계 쪽.', keys: [['A / B', '시작 방향']], on: ['switchStart'] },
    { text: '4갈래 분기점에서는 X / Z 로 흰 점을 돌릴 수 있다. R 로 실행.', keys: [['R', '실행']], on: ['run'] },
  ],
  '04-sensor-motor': [
    { text: '센서: 햄스터가 센서 칸을 지나가면 상하좌우에 붙은 모터가 한 칸 돈다. 튜브 칸에 놓는다.', keys: [['Shift', '부품 모드'], ['1', '센서'], ['Space', '놓기']], on: ['part:sensor'] },
    {
      text: '모터는 튜브 없는 빈 미노 칸에만. 미노 모드에서 Q / E 로 "빈" 변형을 골라 쌓고, 모터 ↻ 또는 ↺ 를 놓는다.',
      keys: [['Q / E', '빈 변형'], ['3 / 4', '모터 ↻ / ↺']],
      on: ['part:motor'],
    },
    { text: '기어는 아무 미노 칸에. 맞물린 기어·모터·스위치는 서로 반대로 돈다. 모터에서 스위치까지 기어로 잇는다.', keys: [['2', '기어'], ['Space', '놓기']], on: ['part:gear'] },
    {
      text: '기어가 시계로 돌면 스위치 관도 시계로 90° (A→B). 갈 수 없는 쪽으로 밀면 거부되고 그 기어 줄 전체가 빨갛게 잠긴다. R 로 실행.',
      keys: [['R', '실행']],
      on: ['run'],
    },
  ],
};

export const SANDBOX_TUTORIAL: Step[] = [
  { text: '샌드박스: 중력 없이 자유롭게 놓아 보는 곳. 숫자로 모양을 고르고 방향키로 옮겨 Space 로 놓는다.', keys: [['1~7', '모양'], ['방향키', '옮기기'], ['Space', '놓기']], on: ['drop'] },
  { text: 'Shift 를 눌렀다 떼면 부품 모드. 다시 누르면 미노 모드.', keys: [['Shift', '부품 모드']], on: ['mode:part'] },
  { text: 'Tab 으로 대기열 모드: 햄스터의 색과 투입구를 정한다.', keys: [['Tab', '대기열 모드']], on: ['mode:queue'] },
  { text: 'R 로 실행해 본다. 다시 R 이면 리셋.', keys: [['R', '실행']], on: ['run'] },
  { text: 'L = 레벨 에디터. 판 크기·통 목표를 정하고 P 로 지금 배치를 참조 풀이로 저장하면 레벨 JSON 이 된다.', keys: [['L', '레벨 에디터'], ['N', '안내 닫기']], on: ['mode:level'] },
];

export class Tutorial {
  private i = 0;
  constructor(
    readonly steps: Step[],
    private onFinish: () => void = () => {},
  ) {}
  get active(): boolean {
    return this.i < this.steps.length;
  }
  event(name: string): void {
    const s = this.steps[this.i];
    if (s?.on?.includes(name)) this.next();
  }
  next(): void {
    if (!this.active) return;
    this.i++;
    if (!this.active) this.onFinish();
  }
  restart(): void {
    this.i = 0;
  }
  render(box: HTMLElement): void {
    box.innerHTML = '';
    box.hidden = !this.active;
    const s = this.steps[this.i];
    if (!s) return;
    box.append(el('div', 'tut-n', `안내 ${this.i + 1} / ${this.steps.length}`), el('div', 'tut-text', s.text));
    const keys = el('div', 'tut-keys');
    for (const [k, what] of s.keys) {
      const chip = el('span', 'hint');
      chip.append(el('kbd', '', k), el('span', '', what));
      keys.append(chip);
    }
    if (s.on && !s.keys.some(([k]) => k === 'N')) keys.append(el('span', 'dim', 'N 건너뛰기'));
    box.append(keys);
  }
}
