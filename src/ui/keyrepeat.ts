/**
 * 키 꾹 누르기 자동 반복 (테트리스식 DAS/ARR). 브라우저의 키 반복 대신 직접 반복한다.
 * 누른 순간 한 번 → DAS 뒤부터 ARR 마다 한 번. 뗄 때 멈춤.
 */
export const DAS_MS = 150;
export const ARR_MS = 40;

export class KeyRepeat {
  private held = new Map<string, { fn: () => void; next: number }>();

  /** 처음 눌렀을 때: 바로 한 번 실행하고 반복 등록 */
  press(key: string, now: number, fn: () => void): void {
    fn();
    this.held.set(key, { fn, next: now + DAS_MS });
  }

  /** 반복 대상 키인지 (브라우저 반복 이벤트는 무시하려고) */
  has(key: string): boolean {
    return this.held.has(key);
  }

  release(key: string): void {
    this.held.delete(key);
  }

  clear(): void {
    this.held.clear();
  }

  /** 프레임마다: 반복할 때가 된 키를 실행. 실행했으면 true */
  update(now: number): boolean {
    let fired = false;
    for (const h of this.held.values()) {
      // 프레임이 늦어도 한 번에 너무 많이 몰아치지 않게 최대 3번
      for (let k = 0; k < 3 && now >= h.next; k++) {
        h.fn();
        h.next += ARR_MS;
        fired = true;
      }
      if (now >= h.next) h.next = now + ARR_MS;
    }
    return fired;
  }
}
