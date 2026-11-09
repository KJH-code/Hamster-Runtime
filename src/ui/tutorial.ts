/**
 * 판 위 안내 (인터랙티브 튜토리얼). 글 상자 대신 판 위에 말풍선·빛나는 목표 칸을 띄운다.
 * - 1번 레벨: 처음에 자동 플레이 데모(demo.ts), 그다음 규칙(투입구 → 목표 통)과 조작을 한 단계씩.
 *   몇 번 키를 누를지 정확히 말하고 팔레트 칸을 반짝인다. 해내면 다음 단계
 * - 2번: 가격/예산 말풍선 + 두 미노 잇기
 * - 3·4번: 새 조작(받침대, 끼워 넣기) 말풍선 한 번
 * - 6·7·8번: 새 부품 말풍선 한 번 (부품은 스스로 익힌다)
 * 말풍선 한 번짜리는 아무 키나 누르면 닫힌다. N = 다음 / 다시 보기.
 * 안내가 떠 있는 동안 자동 낙하는 멈춘다.
 * 글 속 {key} 는 빛나는 자리 미노의 숫자 키로 바뀐다.
 */

export type Anchor = 'spawn' | 'active' | 'inlet' | 'glow' | 'top' | 'bin';

/** 가격/예산을 숨기는 입문 레벨 (길 잇기만) */
export const HIDE_PRICE = new Set(['00-first-drop']);
/** 들어가기 전에 자동 플레이 데모를 보여 주는 레벨 */
export const DEMO_LEVEL = '00-first-drop';

const NEXT: [string, string][] = [['아무 키', '다음']];

export interface Step {
  text: string;
  keys: [string, string][];
  /** 이 이벤트 중 하나가 오면 다음 단계. 없으면 아무 키나 누르면 닫힘 */
  on?: string[];
  anchor: Anchor;
  /** 참조 풀이의 몇 번째 미노 자리를 빛낼지 */
  glow?: number;
}

export const LEVEL_TUTORIALS: Record<string, Step[]> = {
  '00-first-drop': [
    { text: '햄스터는 이 투입구에서 나와 아래로 떨어진다', keys: NEXT, anchor: 'inlet' },
    { text: '빛나는 이 목표 통에 넣으면 클리어!', keys: NEXT, anchor: 'bin' },
    { text: '{key} 을 눌러 미노를 꺼낸다 (오른쪽 반짝이는 칸)', keys: [['{key}', '꺼내기']], on: ['spawn'], anchor: 'spawn', glow: 0 },
    { text: '먼저 X 로 돌려 빛나는 모양과 맞춘다', keys: [['X', '돌리기']], on: ['rotate'], anchor: 'active', glow: 0 },
    { text: '← → 로 빛나는 자리 위로 옮긴다', keys: [['← →', '옮기기']], on: ['move'], anchor: 'active', glow: 0 },
    { text: '파란 그림자가 빛나는 자리와 겹치면 Space', keys: [['Space', '떨어뜨리기']], on: ['drop'], anchor: 'active', glow: 0 },
    { text: 'R 로 실행! 햄스터가 튜브를 따라 구른다', keys: [['R', '실행']], on: ['run'], anchor: 'inlet' },
  ],
  '01-first-path': [
    { text: '이제 가격이 있다. 미노마다 값이 붙고, 예산 안에서 풀면 클리어. 적게 쓸수록 좋은 기록 (오른쪽 위)', keys: NEXT, anchor: 'top' },
    { text: '이번엔 미노 두 개. {key} 로 꺼내 첫 번째 빛나는 자리에', keys: [['{key}', '꺼내기'], ['Space', '떨어뜨리기']], on: ['drop'], anchor: 'glow', glow: 0 },
    { text: '튜브 끝끼리 맞닿으면 이어진다 (노란 고리). 두 번째는 {key}', keys: [['{key}', '꺼내기'], ['Space', '떨어뜨리기']], on: ['drop'], anchor: 'glow', glow: 1 },
    { text: 'R 로 실행', keys: [['R', '실행']], on: ['run'], anchor: 'inlet' },
  ],
  '02-tower': [{ text: '미노는 바닥이나 다른 미노 위에만 놓인다. 높은 길은 빈 미노(Q/E)로 받친다', keys: [['Q / E', '튜브 ↔ 빈']], anchor: 'top' }],
  '03-slide-under': [{ text: '↓ 로 한 칸씩 내린 뒤 옆으로 밀면 처마 밑으로 넣을 수 있다', keys: [['↓', '내리기'], ['← →', '밀기']], anchor: 'top' }],
  '05-plug': [{ text: '새 부품 마개: P 를 누르고 튜브 끝 칸에 끼우면 그 끝이 닫힌다', keys: [['P', '마개'], ['Space', '놓기']], anchor: 'top' }],
  '06-switch': [{ text: '새 부품 스위치: 분기점에 끼우는 ㄱ자 관. 흰 점과 직각 갈래 하나를 잇는다', keys: [['W', '스위치'], ['A / B', '시작 방향'], ['X / Z', '흰 점 돌리기']], anchor: 'top' }],
  '07-first-only': [{ text: '새 부품 센서·모터·기어: 센서를 지나면 붙은 모터가 돌고, 맞물린 기어는 서로 반대로 돈다', keys: [['S', '센서'], ['M', '모터 (다시: 방향)'], ['G', '기어']], anchor: 'top' }],
};

export class Tutorial {
  private i = 0;
  constructor(readonly steps: Step[]) {}
  get active(): boolean {
    return this.i < this.steps.length;
  }
  get step(): Step | undefined {
    return this.steps[this.i];
  }
  get index(): number {
    return this.i;
  }
  /** 이 이벤트를 기다리는 단계가 지금이나 뒤에 있으면 그 다음으로 (앞질러 해낸 경우도) */
  event(name: string): void {
    for (let j = this.i; j < this.steps.length; j++)
      if (this.steps[j]!.on?.includes(name)) {
        this.i = j + 1;
        return;
      }
  }
  /** 아무 키: 이벤트를 기다리지 않는 말풍선이면 닫는다 */
  anyKey(): void {
    if (this.step && !this.step.on) this.i++;
  }
  next(): void {
    if (this.active) this.i++;
  }
}
