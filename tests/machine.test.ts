import { describe, expect, it } from 'vitest';
import { buildFixed, applyLayout } from '../src/core/level';
import { machinePreview } from '../src/core/machine';
import { LEVELS } from '../src/data/levels';

const boardOf = (id: string) => {
  const lv = LEVELS.find((l) => l.id.startsWith(id))!;
  const b = buildFixed(lv);
  expect(applyLayout(lv, b, lv.solution!)).toBeNull();
  return b.board;
};

describe('부품 동작 미리보기', () => {
  it('9번 토글: 센서 둘이 같은 기어 줄로 스위치를 서로 반대쪽으로 민다', () => {
    // 줄: 모터(1,5)↺ - 기어(2,5) - 기어(3,5) - 모터(4,5)↺, 기어(3,5) 아래 스위치(3,6)
    // 센서1 (1,6): 모터(1,5) 반시계 → (2,5) 시계 → (3,5) 반시계 → 스위치 시계 = B 쪽
    // 센서2 (4,6): 모터(4,5) 반시계 → (3,5) 시계 → 스위치 반시계 = A 쪽
    const m = machinePreview(boardOf('08'));
    expect(m.meshes.length).toBe(4);
    expect(m.sensors.map((s) => [s.n, s.x, s.y])).toEqual([[1, 1, 6], [2, 4, 6]]);
    expect(m.sensors[0]!.motors).toEqual([{ x: 1, y: 5 }]);
    expect(m.sensors[0]!.switches).toEqual([{ x: 3, y: 6, start: 'A', push: 'B' }]);
    expect(m.sensors[1]!.switches).toEqual([{ x: 3, y: 6, start: 'A', push: 'A' }]);
    expect(m.sensors[0]!.turns).toContainEqual({ x: 2, y: 5, dir: 1 });
    expect(m.sensors[0]!.locks).toBe(false);
  });
  it('부품 없는 판: 아무것도 없음', () => {
    expect(machinePreview(boardOf('01'))).toEqual({ sensors: [], meshes: [] });
  });
});
