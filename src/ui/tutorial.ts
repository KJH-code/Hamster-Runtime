/**
 * 판 위 안내 (인터랙티브 튜토리얼). 글 상자 대신 판 위에 말풍선·빛나는 목표 칸을 띄운다.
 * - 1번 레벨: 조작만 단계별로 (꺼내기 → 옮기기/돌리기 → 떨어뜨리기 → 두 번째 미노 → 실행). 해내면 다음 단계
 * - 2·3번: 새 조작(받침대, 끼워 넣기) 말풍선 한 번
 * - 5·6·7번: 새 부품 말풍선 한 번 (부품은 스스로 익힌다)
 * 말풍선 한 번짜리는 아무 키나 누르면 닫힌다. N = 다음 / 다시 보기.
 */

export type Anchor = 'spawn' | 'active' | 'inlet' | 'glow' | 'top';

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
  '01-first-path': [
    { text: '숫자 키로 미노를 꺼낸다', keys: [['1~7', '꺼내기']], on: ['spawn'], anchor: 'spawn', glow: 0 },
    { text: '저절로 천천히 내려온다. 빛나는 자리로 옮기고 돌린다', keys: [['← →', '옮기기 (꾹)'], ['X', '돌리기']], on: ['move', 'rotate'], anchor: 'active', glow: 0 },
    { text: 'Space 로 떨어뜨려 고정한다', keys: [['Space', '고정']], on: ['drop'], anchor: 'active', glow: 0 },
    { text: '튜브 끝끼리 맞닿으면 이어진다 (노란 고리)', keys: [['숫자', '꺼내기'], ['Space', '떨어뜨리기']], on: ['drop'], anchor: 'glow', glow: 1 },
    { text: '실행! 햄스터가 길을 따라 구른다', keys: [['R', '실행']], on: ['run'], anchor: 'inlet' },
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
  event(name: string): void {
    if (this.step?.on?.includes(name)) this.i++;
  }
  /** 아무 키: 이벤트를 기다리지 않는 말풍선이면 닫는다 */
  anyKey(): void {
    if (this.step && !this.step.on) this.i++;
  }
  next(): void {
    if (this.active) this.i++;
  }
}
