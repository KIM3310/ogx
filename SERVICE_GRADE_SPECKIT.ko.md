# ogx Service-Grade SPECKIT

Last updated: 2026-03-08

## S - Scope
- 대상: Gemini 기반 multi-agent orchestration CLI
- baseline 목표: CLI transcript, failure handling, reproducible agent workflow를 서비스 수준으로 정리

## P - Product Thesis
- ogx는 데모용 스크립트가 아니라 `operator-grade multi-agent CLI`로 보여야 한다.
- 사용자와 리뷰어가 입력 -> orchestration -> output trace를 빠르게 검증할 수 있어야 한다.

## E - Execution
- CLI happy-path와 failure-path를 테스트/문서로 고정
- setup, auth, transcript surface를 단순하게 유지
- GitHub Actions 기준 build/test green 유지
- 이번 iteration에서 Cloud Run wrapper에 runtime brief + doctor schema surface를 추가

## C - Criteria
- `npm test`, `npm run build` green
- README 첫 화면에서 사용 대상과 실행 절차가 명확함
- 대표 transcript나 example session이 재현 가능함
- `/health`, `/meta`, `/v1/runtime-brief`, `/v1/schema/doctor-report`만 봐도 operator posture가 보임

## K - Keep
- CLI-first product shape
- orchestration 결과를 짧고 검증 가능한 형태로 남기는 방식

## I - Improve
- transcript export 기능 강화
- agent role별 failure replay 추가
- local CLI transcript와 Cloud Run doctor evidence를 하나의 review pack으로 묶기

## T - Trace
- `README.md`
- `src/`
- `tests/`
- `.github/workflows/ci.yml`
