# Hamster Runtime

DevVault: Projects/Hamster Runtime

테트로미노 튜브 경로 + 부품(센서·기어·모터·스위치·마개)으로 햄스터를 굴리는 웹 퍼즐. 2차: 레벨(통 조건·가격/예산) + 샌드박스 레벨 에디터 (키보드 전용).

## 스택
TypeScript + Canvas 2D + Vite. 프레임워크 없음. 테스트 Vitest.

## 명령
- `npm run dev` 개발 서버 / `npm run build` 빌드 / `npm test` 단위 테스트 / `npm run typecheck`

## 구조
- `src/data/minos.ts` 미노 목록(데이터). 칸마다 튜브/빈칸, 숫자 = 경로 순서. 재혁이 직접 수정
- `src/data/prices.ts` 가격표, `src/data/levels/*.json` 레벨. 재혁이 직접 조정 (가격을 바꾸면 `tests/levels.test.ts` 가 예산 어긋남을 알려줌)
- `src/core/` 순수 로직. DOM·Canvas import 금지. `links.ts`(자동 연결), `parts.ts`(부품 규칙), `gears.ts`(기어), `hamster.ts`(햄스터·대기열), `editor.ts`(샌드박스 편집), `srs.ts`·`stack.ts`(레벨 모드 중력), `price.ts`, `level.ts`(형식·판정), `play.ts`(레벨 플레이), `solution.ts`(샌드박스 → 레벨)
- `src/ui/` Canvas 렌더링, 키보드 입력 (마우스 없음). localStorage 는 `storage.ts` 에서만 (try/catch)
- `tests/` 단위 테스트. 기대값은 손으로 계산한 값을 쓴다 (구현과 같은 로직으로 계산 금지). 규칙 테스트는 `tests/fixtures/minos.ts` 를 쓴다

## 코드 규칙
- 규칙 문서에 없는 메커니즘을 임의로 추가하지 않는다. 애매하면 멈추고 묻는다
- 미노는 회전만, 거울 없음. 샌드박스는 중력 없음, 레벨 모드는 중력. 조작은 키보드만
- 스위치 = ㄱ자 관 (A = 공통의 반시계 쪽 직각, B = 시계 쪽, 기어 시계 = A→B). 일자·C 상태 없음
- 레벨은 케이스 목록을 쓰지 않는다 (대기열 하나 + 통별 개수 조건). 레벨마다 참조 풀이를 저장하고 테스트로 검증
- 기능 단위로 커밋
