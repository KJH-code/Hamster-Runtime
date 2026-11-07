# Hamster Runtime

DevVault: Projects/Hamster Runtime

테트로미노 튜브·기어로 햄스터를 굴리는 웹 퍼즐. 현재는 레벨 없는 샌드박스(MVP 0단계).

## 스택
TypeScript + Canvas 2D + Vite. 프레임워크 없음. 테스트 Vitest.

## 명령
- `npm run dev` 개발 서버 / `npm run build` 빌드 / `npm test` 단위 테스트 / `npm run typecheck`

## 구조
- `src/data/minos.ts` 미노 목록(데이터). 모양·칸 요소·열린 변. 재혁이 직접 수정
- `src/core/` 순수 로직. DOM·Canvas import 금지. `gears.ts`(기어), `hamster.ts`(햄스터 상태머신)
- `src/ui/` Canvas 렌더링·입력·컨트롤
- `tests/` 단위 테스트. 기대값은 손으로 계산한 값을 쓴다 (구현과 같은 로직으로 계산 금지)

## 코드 규칙
- 규칙 문서에 없는 메커니즘을 임의로 추가하지 않는다. 애매하면 멈추고 묻는다
- 미노는 회전만, 거울 없음. 샌드박스는 중력 없음
- 기능 단위로 커밋
