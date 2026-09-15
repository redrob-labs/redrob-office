# Redrob Office (레드롭 오피스)

[English](./README.md) · **한국어**

레드롭 오피스는 Docs, Sheets, Slides, PDF, Markdown, Hangul 편집기를 하나의 Electron
창에서 호스팅하는 데스크톱 오피스 스위트입니다. 각 편집기의 AI 패널은 편집 방법을
설명하는 대신 열려 있는 문서를 직접 편집합니다. Windows와 Linux에서 실행되며,
[GenOffice](https://github.com/genspark-ai/genoffice)를 Apache License 2.0으로 이식한
제품이고, 영어와 한국어를 지원합니다.

## 기능

- **Docs** — `.docx` 작성·서식·검토, AI 패널이 초안을 쓰고 문서를 직접 수정합니다.
- **Sheets** — `.xlsx` 편집과 시트 대상 AI 도구.
- **Slides** — `.pptx` 편집과 도형·레이아웃 대상 AI 도구.
- **PDF** — 읽기·변환과 문서 대상 AI 도구.
- **Markdown·Hangul** — Markdown 편집기, 그리고 내장 rhwp 편집기로 `.hwp`/`.hwpx` 편집.
- **하나의 Home 화면** — 모든 편집기를 단일 셸과 공용 프로젝트 저장소에서 실행합니다.

AI 편집은 `packages/agent-core`의 도구 실행 루프와 `packages/ai-provider`의 고정 Redrob
Console 전송 계층을 사용합니다. 다른 벤더 키를 쓰거나 임의의 서버 주소를 지정하는 것은
의도적으로 제품 옵션이 아닙니다.

## 설치

사용 중인 시스템에 맞는 빌드를 내려받습니다.

| 시스템 | 파일 |
| --- | --- |
| Windows x64 | `https://cdn.redrob.ai/office/latest/redrob-office-x64-setup.exe` |
| Linux AppImage | `https://cdn.redrob.ai/office/latest/redrob-office-x64.AppImage` |
| Linux deb | `https://cdn.redrob.ai/office/latest/redrob-office-x64.deb` |
| Linux rpm | `https://cdn.redrob.ai/office/latest/redrob-office-x64.rpm` |

모든 파일에는 `.sha256`이 함께 게시됩니다. macOS 빌드는 없습니다.

## Redrob 연결

AI 패널은 [Redrob Console](https://console.redrob.ai)에서 발급한 워크스페이스 키가
필요합니다. 콘솔의 **API keys**에서 키를 만들고 앱의 **설정 → AI**에 붙여 넣습니다.
다른 곳에서 발급한 키는 거부되며, 키가 비어 있으면 조용히 실패하지 않고 실패 사유를
표시합니다.

콘솔의 원클릭 **Connect Redrob** 장치 연결 흐름(앱이 짧은 코드를 보여주고 콘솔에서
승인하는 방식)은 이 앱에 아직 배선되지 않았습니다. 현재 Redrob Code와 Redrob Cowork만
사용하며 Office는 사용하지 않습니다.

## 로컬 개발

Node 22, pnpm 9.15.0, Electron, Turborepo를 사용합니다.

```bash
pnpm install
pnpm dev              # @genoffice/shell
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

`pnpm install --ignore-scripts`로 설치했다면 `pnpm ensure:electron`을 실행합니다. GUI가
필요 없는 typecheck·test 환경에서는 `REDROB_SKIP_ELECTRON_ENSURE=1`로 Electron 다운로드를
명시적으로 건너뜁니다.

## 저장소 구조

| 위치 | 역할 |
| --- | --- |
| `apps/shell` | 레드롭 오피스 셸과 Home 화면 |
| `apps/{docs,sheets,slides,pdf,markdown,hangul}` | 각 편집기와 AI 패널 |
| `packages/agent-core` | 편집 도구를 실행하는 공용 agent loop |
| `packages/ai-provider` | 고정 Redrob Console 전송 계층 |
| `packages/{docx-engine,pptx-engine,pptx-render,rhwp-editor}` | 문서 포맷 엔진 |
| `packages/{genoffice-ui,i18n,electron-utils,project-store}` | 스위트 공용 UI·런타임 |

패키지 이름은 여전히 `@genoffice/*`입니다. 제품 표면이 아니라 import 경로이므로, 이름을
바꾸면 사용자에게 보이는 이득 없이 모든 import를 다시 써야 합니다.

## 릴리즈

`v*` 태그를 밀면 같은 태그에서 두 워크플로가 함께 돕니다. `release-desktop.yml`은
Windows 설치본을 서명·패키징해 GitHub Release에 게시하고 그 **서명된 같은 바이트**를 CDN에
올립니다. `release-office-cdn.yml`은 서명 없는 Linux 패키지(AppImage/deb/rpm)를 빌드해
올립니다. 태그는 `apps/shell/package.json`의 버전과 같아야 합니다(`v0.8.3` ↔ `0.8.3`).

업로드 계약 — 불변 버전 경로, `latest/` 승격 전 체크섬 검증, CDN 자격 증명이 없는 포크가
빌드만 하고 업로드하지 않는 이유 — 은 [docs/RELEASE.md](./docs/RELEASE.md)에 있습니다.

## 문서

- [docs/UPSTREAM.md](./docs/UPSTREAM.md) — 이 포크가 무엇을 이식했는지, 상류 변경을 가져오는 방법
- [docs/RELEASE.md](./docs/RELEASE.md) — 릴리즈와 CDN 배포 계약
- [docs/console-api.md](./docs/console-api.md) — Redrob Console 추론 API 계약
- [docs/branding-cleanup.md](./docs/branding-cleanup.md) — 브랜딩 규칙과 의도적인 내부 예외 목록
- [AGENTS.md](./AGENTS.md) — 개발·검증 환경과 동작 노트

## 기여하기

브랜치 이름 규칙, 커밋 규약, 풀 리퀘스트 전에 돌릴 검사, CI가 강제하는 포크 규칙 두 가지는
[CONTRIBUTING.ko.md](./CONTRIBUTING.ko.md)에 있습니다.

## 상류 프로젝트

레드롭 오피스는 git 포크가 아니라 이식본입니다. 상류와 커밋 이력을 공유하지 않으므로 상류
변경은 파일 단위로 가져옵니다. 이 트리가 어느 상류 커밋을 기준으로 측정됐는지, 측정 방법,
동기화 절차는 [docs/UPSTREAM.md](./docs/UPSTREAM.md)에 있고 기계가 읽는 기록은
[upstream-base.json](./upstream-base.json)입니다.

## 라이선스와 출처 표기

Apache-2.0입니다. 오피스 편집기 애플리케이션과 지원 패키지는 Mainfunc, Inc.의
[GenOffice](https://github.com/genspark-ai/genoffice)를 이식한 것이며 같은 라이선스를
유지합니다. 상류의 저작권 표기는 Apache-2.0 4항이 요구하는 대로 [NOTICE](./NOTICE)에 그대로
남겨 두었고, 이 이식본에서 추가·수정한 부분의 저작권은 이장훈(레드롭)과 기여자들에게 있으며
같은 조건으로 배포합니다.

저작권 표기 줄은 법적 식별자이므로 번역하지 않고 원문 그대로 씁니다:
`Copyright 2026 Mainfunc, Inc.` / `Copyright 2026 Janghoon Lee (Redrob)`

`pnpm check:upstream-boundary`는 그 표기가 사라지면 빌드를 실패시킵니다.

한글(HWP/HWPX) 편집 기능은 [rhwp](https://github.com/edwardkim/rhwp)(MIT)가 제공하며
저장소에 포함해 오프라인으로 제공합니다. 번들 폰트와 서드파티 구성요소는
[NOTICE](./NOTICE)에 정리돼 있고, 전체 서드파티 고지 파일은 패키징 시점에 생성돼 애플리케이션
번들 안에 함께 출하됩니다.

라이선스는 소프트웨어를 다루고 브랜드는 다루지 않습니다. Redrob 이름과 로고는 이 라이선스로
허여되지 않습니다.
