# 기여 가이드

[English](./CONTRIBUTING.md) · **한국어**

레드롭 오피스 작업에 참여해 주셔서 감사합니다. 이 문서는 변경이 이 저장소에 들어오는
경로를 짧게 정리한 것입니다.

## 포크 규칙 두 가지

레드롭 오피스는 GenOffice(Apache-2.0)의 이식본입니다. 다음 두 규칙이 그 관계를
보호하며, 어느 쪽을 어겨도 스타일 문제가 아니라 라이선스 문제입니다.

1. **자기 저작권 줄은 추가하되 상류의 것은 절대 지우지 않습니다.** Apache-2.0 4항은 상류
   표기가 모든 복제본에 함께 가도록 요구합니다. `NOTICE`는 GenOffice와 Mainfunc, Inc.를
   계속 명시해야 합니다.
2. **상류에서 가져온 것은 기록합니다.** 상류 코드를 가져왔으면 `upstream-base.json`의
   `lastSyncedUpstream`을 멈춘 커밋으로 갱신합니다. 이 저장소는 상류와 이력을 공유하지
   않으므로, 우리가 얼마나 뒤처졌는지 아는 것은 그 파일뿐입니다.

`pnpm check:upstream-boundary`가 1번을 기계적으로 강제합니다. 2번은 리뷰에서 확인합니다.
정직한 핀과 낡은 핀을 구별할 수 있는 스크립트는 없습니다.

## 브랜치 흐름

- `main`이 트렁크입니다. 모든 변경은 풀 리퀘스트로 들어옵니다.
- 작업 브랜치는 `<type>/<short-slug>` 형식이며 type은 `feat`, `fix`, `chore`, `docs`,
  `test`, `refactor`, `perf` 중 하나입니다.
- 상류 동기화는 `sync/upstream-<date>`입니다.
- 릴리즈 태그는 `main`에서 `v<major>.<minor>.<patch>`로 자르며 `apps/shell/package.json`의
  버전과 같아야 합니다.

이제 `.github/workflows/gitflow.yml`이 위 두 줄을 검사합니다. 아무도 검사하지 않는 규칙은
규칙이 아니라 취향일 뿐이고, 실제로 이 문서가 정의하지 않은 `kiro/` 접두사 브랜치가 이미
생겼습니다. `branch name follows the convention` 잡은 헤드 브랜치가 `feat`, `fix`, `chore`,
`docs`, `test`, `refactor`, `perf`, `sync` 중 하나로 시작하지 않으면 풀 리퀘스트를 실패시키고,
`develop`과 `main`은 통과시킵니다. 승격이나 백머지 브랜치는 type으로 이름 붙이는 대상이
아니기 때문입니다. `main is contained in develop` 잡은 `main`이 움직인 뒤에 돌면서 `main`에만
있는 커밋이 남아 있으면 실패합니다. 그 백머지를 빠뜨려 형제 저장소의 기본 브랜치가 한 달 동안
설치조차 되지 않았습니다. 이 목록은 설명이고 실제 관문은 그 워크플로의 `ALLOWED_TYPES`이므로
둘을 함께 고쳐야 합니다.

## 커밋

관용 접두사, 명령형, 소문자 제목, 도움이 될 때 범위를 붙입니다.

```
fix(sheets): reject out-of-grid Go To references at validation
```

커밋 메시지와 PR 본문은 영어로 씁니다. 다른 사람이 읽는 영구 기록입니다.

## 풀 리퀘스트 전에 돌릴 것

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check:upstream-boundary    # 포크 규칙
pnpm check:licenses             # 의존성 라이선스 허용목록
```

사용자에게 보이는 문자열을 건드렸다면 컴포넌트에 영어나 한국어를 하드코딩하지 말고
`packages/i18n`의 두 로케일에 모두 추가합니다.

## 지금 CI가 검사하는 것과 하지 않는 것

| 워크플로 | 실행 시점 | 상태 |
| --- | --- | --- |
| `CI` (Linux: typecheck, build, test, 포크 경계, 라이선스) | 풀 리퀘스트, `main` 푸시 | 필수 |
| `CI` (Windows + macOS 매트릭스) | 주간 스케줄, 수동 실행 | 풀 리퀘스트에서는 안 돎 |
| `release-desktop.yml`, `release-linux.yml` | `v*` 태그, 수동 실행 | 릴리즈 전용 |

네이티브 매트릭스는 비용이 커서 풀 리퀘스트에서는 돌지 않습니다. 플랫폼에 특정한 변경이면
PR에 그렇게 적고 매트릭스를 수동으로 실행하세요.

## 리뷰

PR 하나에 관심사 하나입니다. 작업 브랜치는 squash 병합해 `main`에 커밋 하나로 남기고,
상류 동기화는 가져온 범위가 이력에 남도록 merge 커밋으로 병합합니다. 단독 관리자는 CI가
초록이면 자기 PR을 병합할 수 있습니다.

## 버그 신고와 기능 요청

버그·기능 템플릿으로 이슈를 엽니다. 버그는 설명만큼 버전과 시스템이 중요합니다. Windows와
Linux 패키지는 서로 다른 워크플로가 빌드합니다.

## 보안

취약점은 공개 이슈로 올리지 마세요. 발견한 내용과 재현 방법을 `packages@redrob.ai`로
보내 주세요.

## 기여물의 라이선스

기여하시면 그 기여물이 저장소의 나머지와 같은 Apache-2.0 조건으로 배포되는 데 동의하는
것으로 봅니다. 자기 기여분의 저작권은 그대로 보유합니다.
