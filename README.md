# Redrob Office

내 PC에서 도는 온디바이스 오피스 앱. 문서와 데이터는 기기에 남고, 혼자 쓰는 범위는 무료입니다.

하는 일 3가지: **조회 · 처리 · 검토**. 반복되는 일을 스킬로 저장해 같은 방식으로 다시 돌립니다.

## 무엇을 할 수 있나

- **대화**: 채팅으로 일을 시킵니다. 채널을 만들어 주제별로 나눌 수 있습니다.
- **스킬**: 반복 업무를 저장해 두면 매번 같은 절차로 실행됩니다. 스킬이 넘겨주는 단계는 문서 탭에서 채웁니다.
- **PC 작업**: 작성창의 **PC** 토글로 셸·파일·앱 도구를 써서 기기에서 실제 작업을 합니다(기본 켜짐). 결과물은 아티팩트로 채팅에 붙습니다.
- **문서/결과**: 처리 결과를 문서로 편집하고 결과 패널에서 확인합니다.
- **1순위 업무**: 인사·채용(대량 접수, 기준 파일, 공고 대비 순위, 기준별 채점, 증명서 확인, 리포트 발행).

데스크톱 제어(화면·마우스·키보드)는 기본으로 꺼져 있고 설정에서 켭니다. 위험한 도구는 채팅에서 한 번 더 확인을 받습니다.

## 추론 경로

| 경로 | 필요한 것 | 비용 |
| --- | --- | --- |
| 이 기기 | GPU + 로컬 모델 다운로드 | 무료 |
| Redrob Console | `https://console.redrob.ai` 에서 발급한 API 키 | Console 워크스페이스에 과금 |

호스팅 추론은 Redrob Console 키만 받습니다. 다른 벤더 키나 임의의 추론 서버 주소는 제품 옵션이 아닙니다. 모델은 `redrob-ai`이고, API 규격은 [docs/console-api.md](./docs/console-api.md)와 [Console API 문서](https://console.redrob.ai/docs/api-reference)를 따릅니다.

클라우드 대화는 에이전트 런타임에서 돌아갑니다. 런타임은 첫 실행(온보딩)에서 자동으로 설치되며, 기기에 Node가 없으면 전용 Node를 같이 내려받습니다.

## 설치

서명된 Windows x64 설치 파일은 [Releases](https://github.com/redrob-labs/redrob-office/releases)에 있습니다. 설치 후 첫 실행에서 Console 키를 넣고 에이전트 런타임 설치를 마치면 바로 쓸 수 있습니다.

## 개발

Node 22, pnpm 9.15.0, Electron. pnpm + Turborepo 모노레포입니다.

```bash
pnpm install          # postinstall 이 각 앱의 Electron 바이너리를 준비합니다
pnpm dev              # Redrob Office 오피스 스위트 (@genoffice/shell). 표시 장치 필요
pnpm dev:office       # 레거시 채용 앱 (@redrob/office). 표시 장치 필요
pnpm dev:web          # @redrob/office 렌더러만 브라우저에서 (모의 IPC, GPU 불필요)
pnpm typecheck
pnpm test
pnpm dist             # 오피스 스위트 패키징 (dist:office 는 채용 앱)
```

`pnpm install --ignore-scripts` 로 설치했다면 `postinstall` 이 건너뛰어지므로, 이후 **`pnpm ensure:electron`** 을 실행해 각 앱의 고정 Electron 바이너리를 준비해야 합니다. 그렇지 않으면 `pnpm dev` 가 `Error: Electron uninstall` 로 실패합니다. GUI 없이 typecheck/test/dev:web 만 돌리는 헤드리스 환경이라면 `REDROB_SKIP_ELECTRON_ENSURE=1` 로 명시적으로 건너뛸 수 있습니다(기본 `postinstall` 은 바이너리를 준비하지 못하면 0이 아닌 코드로 실패하므로, 설치가 dev 준비 완료를 거짓으로 주장하지 않습니다).

`pnpm dev` 는 셸 앱(`@genoffice/shell`)을 띄웁니다. 하나의 창이 Docs·Sheets·Slides·PDF·Markdown·Hangul 편집기를 `WebContentsView` 자식으로 호스팅하는, 사용자가 보는 기본 화면입니다. `@redrob/office`(채용 앱 + Redrob 엔진)는 함께 유지되며 `pnpm dev:office` 로 따로 실행합니다.

헤드리스(표시 장치 없음) 환경에서 실제 셸을 띄우려면 가상 디스플레이를 씁니다.

```bash
DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 pnpm dev   # @genoffice/shell
```

로컬 모델 가중치는 별도로 내려받습니다.

```bash
pnpm download:models
pnpm download:models -- --role text
```

### 구성

| 위치 | 역할 |
| --- | --- |
| `apps/shell` | 오피스 스위트 셸(`@genoffice/shell`). `pnpm dev` 의 기본 화면. 편집기들을 `WebContentsView` 로 호스팅 |
| `apps/{docs,sheets,slides,pdf,markdown,hangul}` | 편집기 앱(각각 자체 Electron 워크스페이스) |
| `office/` | 레거시 채용 앱(`@redrob/office`) + Redrob 엔진. 도구, 정책, 에이전트 연결. `pnpm dev:office` |
| `packages/kernel` | 추론 경로와 모델 런타임 |
| `packages/extract` | 조회 엔진 |
| `packages/compare` | 처리 엔진(기준 파일, 산출 템플릿) |
| `packages/generate` | 문서 생성 |
| `packages/store` | 로컬 저장소 |
| `packages/registry` | 기준·템플릿·스킬 레지스트리 |
| `packages/ui` | 공용 UI와 다국어 문자열 |
| `packages/telemetry` | 옵트인 텔레메트리 |

### 릴리즈

`v*` 태그를 밀면 두 워크플로가 같은 태그에서 함께 돕니다.

- **Windows 릴리즈** — `.github/workflows/release-desktop.yml`가 Redrob Office 스위트 셸(`@genoffice/shell`)의 Windows 설치본을 서명·패키징해 GitHub Release에 게시합니다.
- **Linux CDN 배포** — `.github/workflows/release-office-cdn.yml`가 서명 없는 Linux 패키지(AppImage/deb/rpm)를 빌드해 CDN에 올립니다. `rpm`(rpmbuild)과 안정 Rust 툴체인을 설치하고 pnpm 9.15 / Node 24로 빌드한 뒤, 각 산출물의 `sha256` 사이드카를 만들어 조직 변수/시크릿 `REDROB_CDN_BUCKET`·`REDROB_CDN_ACCESS_KEY_ID`·`REDROB_CDN_SECRET_ACCESS_KEY`로 `s3://<bucket>/office/<version>/`에 업로드합니다. 업로드 후 모든 공개 CloudFront URL을 HTTP GET으로 받아 로컬 `sha256`과 일치하는지 검증해야 통과합니다.

태그는 `apps/shell/package.json`의 버전과 같아야 합니다(`v0.8.0` ↔ `0.8.0`). CDN 자격 증명이 없는 포크나 미설정 저장소에서는 패키지 빌드만 실행되고 업로드는 일어나지 않으며, 성공을 거짓으로 보고하지 않습니다. 업로드되는 파일은 `electron-builder.cjs`가 정한 정확한 산출물 이름(`Redrob-<version>.AppImage`, `redrob_<version>_amd64.deb`, `redrob-<version>.x86_64.rpm`)과 그 `.sha256`뿐이고, blockmap이나 `latest*.yml`, 언팩 트리는 올리지 않습니다. 레거시 채용 앱(`@redrob/office`)은 이 릴리즈 파이프라인에 포함되지 않습니다.

## 문서

- [docs/setup-policy.md](./docs/setup-policy.md): 첫 실행, 로컬 모델 팩, 추론 라우팅 정책
- [docs/console-api.md](./docs/console-api.md): Redrob Console 추론 API 계약
- [docs/branding-cleanup.md](./docs/branding-cleanup.md): Redrob 브랜딩 규칙과 내부 예외(폰트·패키지·직렬화 키 등) 목록
- [AGENTS.md](./AGENTS.md): 개발·검증 환경과 동작 노트

## 라이선스

Apache-2.0. 자세한 내용은 [LICENSE](./LICENSE)와 [NOTICE](./NOTICE)를 참고하세요.
