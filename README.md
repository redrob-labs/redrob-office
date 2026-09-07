# Redrob Office

Redrob Office는 Docs, Sheets, Slides, PDF, Markdown, Hangul 편집기를 한 Electron 창에서
호스팅하는 데스크톱 오피스 스위트입니다. 기본 제품과 릴리즈 대상은 `@genoffice/shell`
(`apps/shell`) 하나입니다.

기존 채용·로컬 추론 제품은 메인 소스에서 제거했습니다. 보존본은
`legacy-office-v0.0.0` 태그와 `cursor/legacy-office-v0-0-0-8171` 브랜치에만 있으며,
새 기능이나 릴리즈 대상으로 사용하지 않습니다.

## 기능

- Docs: DOCX 작성·서식·검토, AI 패널을 통한 초안 작성과 문서 편집
- Sheets: XLSX 편집과 AI 도구
- Slides: PPTX 편집과 AI 도구
- PDF: 읽기·변환·AI 도구
- Markdown·Hangul 편집기
- 하나의 Home 화면과 프로젝트 저장소에서 모든 편집기를 실행

AI 편집은 `@genoffice/agent-core`의 도구 실행 루프와 `@genoffice/ai-provider`의 고정
Redrob Console 경로를 사용합니다. 다른 벤더 키나 임의 서버 주소는 제품 옵션이 아닙니다.

## 개발

Node 22, pnpm 9.15.0, Electron, Turborepo를 사용합니다.

```bash
pnpm install
pnpm dev              # @genoffice/shell
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

`pnpm install --ignore-scripts`로 설치했다면 `pnpm ensure:electron`을 실행합니다. GUI가 필요
없는 typecheck/test 환경에서는 `REDROB_SKIP_ELECTRON_ENSURE=1`로 Electron 다운로드를
명시적으로 건너뛸 수 있습니다.

### 구성

| 위치 | 역할 |
| --- | --- |
| `apps/shell` | 통합 Redrob Office 셸과 Home |
| `apps/{docs,sheets,slides,pdf,markdown,hangul}` | 각 문서 편집기와 AI 패널 |
| `packages/agent-core` | 편집 도구를 실행하는 공용 agent loop |
| `packages/ai-provider` | 고정 Redrob Console AI 전송 계층 |
| `packages/{docx-engine,pptx-engine,pptx-render,rhwp-editor}` | 문서 포맷 엔진 |
| `packages/{genoffice-ui,i18n,electron-utils,project-store}` | 스위트 공용 UI·런타임 |

### 릴리즈

`v*` 태그를 밀면 두 워크플로가 같은 태그에서 함께 돕니다.

- **Windows 릴리즈** — `.github/workflows/release-desktop.yml`가 Redrob Office 스위트 셸(`@genoffice/shell`)의 Windows 설치본을 서명·패키징해 GitHub Release에 게시하고, 같은 워크플로의 CDN 잡이 **서명 잡이 만든 그 바이트**(다시 빌드하면 서명이 없으므로 아티팩트를 그대로 씁니다)를 CDN에도 올립니다. Linux와 같은 두 단계 계약을 따르며, GitHub Release는 CDN 잡을 기다리지 않으므로 CDN 장애가 업데이터 피드를 막지 않습니다.
- **Linux CDN 배포** — `.github/workflows/release-office-cdn.yml`가 서명 없는 Linux 패키지(AppImage/deb/rpm)를 빌드해 CDN에 올립니다. `rpm`(rpmbuild)과 안정 Rust 툴체인을 설치하고 pnpm 9.15 / Node 24로 빌드한 뒤, 각 산출물의 `sha256` 사이드카를 만들어 조직 변수/시크릿 `REDROB_CDN_BUCKET`·`REDROB_CDN_ACCESS_KEY_ID`·`REDROB_CDN_SECRET_ACCESS_KEY`로 업로드합니다. 배포는 두 단계로, 정해진 순서로만 진행됩니다.
  1. **불변 버전 경로** `s3://<bucket>/office/<version>/`에 세 산출물과 `.sha256`을 올립니다. 이 객체는 다시 덮어쓰지 않으므로 `Cache-Control: public, max-age=31536000, immutable`로 캐시합니다. 올린 뒤 모든 공개 버전 URL을 HTTP GET으로 받아 로컬 `sha256`과 일치하는지 검증합니다.
  2. 버전 검증이 전부 통과한 **뒤에만** 같은 로컬 파일을 `office/latest/`에 다시 업로드해 승격합니다. CDN 자격 증명은 PutObject 전용(Head/Get/List 불가)이라 `s3://.../office/<version>/`에서 `s3://.../office/latest/`로의 서버 측 복사(`aws s3 cp s3:// s3://`)는 원본 HeadObject에서 403으로 실패합니다. 그래서 방금 공개 검증까지 마친 것과 같은 로컬 바이트를 버전 없는 이름으로(`cdn-latest/`) 그대로 업로드하며, 바이트 동일성은 승격 뒤 `latest` URL과 체크섬을 다시 검증해 보장합니다. `.sha256` 사이드카는 복사하지 않고 이름별로 다시 만들어, 어느 이름을 받았든 `sha256sum -c`가 그대로 통합니다. `latest`는 포인터가 바뀌면 즉시 최신본을 받아야 하므로 `Cache-Control: no-cache, max-age=0, must-revalidate`로 매번 재검증합니다.

공개 URL은 다음과 같습니다(버전 `<version>` 예: `0.8.2`). 버전 경로는 파일 이름에 버전을 박아 내려받은 파일이 스스로를 식별하게 하고, `latest/`는 버전 없는 이름을 씁니다. `latest/`에 버전이 들어가면 다음 릴리즈가 나온 순간 그 URL은 최신이 아닌 빌드를 최신이라고 주장하게 되고, 그 주소를 링크한 Console 제품 페이지가 낡은 빌드를 계속 내주게 됩니다.

```
https://cdn.redrob.ai/office/<version>/Redrob-Setup-<version>.exe        (+ .sha256)
https://cdn.redrob.ai/office/<version>/Redrob-<version>.AppImage        (+ .sha256)
https://cdn.redrob.ai/office/<version>/redrob_<version>_amd64.deb        (+ .sha256)
https://cdn.redrob.ai/office/<version>/redrob-<version>.x86_64.rpm       (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64-setup.exe          (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64.AppImage           (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64.deb                (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64.rpm                (+ .sha256)
```

태그는 `apps/shell/package.json`의 버전과 같아야 합니다(`v0.8.2` ↔ `0.8.2`). `office/latest/`는 **성공한 실제 `v*` 태그 푸시에서만** 이동합니다. 프리뷰 실행(`workflow_dispatch`)은 버전 경로를 검사용으로 올릴 수 있으나 `latest`는 건드리지 않고, CDN 자격 증명이 없는 포크나 미설정 저장소에서는 패키지 빌드만 실행되고 업로드는 전혀 없으며 성공을 거짓으로 보고하지 않습니다. 버전 검증이 하나라도 실패하면 승격 단계에 도달하지 않으므로 `latest`는 부분 실패로 절대 이동하지 않습니다. 업로드되는 파일은 `electron-builder.cjs`가 정한 정확한 산출물(`Redrob-<version>.AppImage`, `redrob_<version>_amd64.deb`, `redrob-<version>.x86_64.rpm`)과 그 `.sha256`, 그리고 `latest/`용 버전 없는 사본뿐이고, blockmap이나 `latest*.yml`, 언팩 트리는 올리지 않습니다.

## 문서

- [docs/console-api.md](./docs/console-api.md): Redrob Console 추론 API 계약
- [docs/branding-cleanup.md](./docs/branding-cleanup.md): Redrob 브랜딩 규칙과 내부 예외(폰트·패키지·직렬화 키 등) 목록
- [AGENTS.md](./AGENTS.md): 개발·검증 환경과 동작 노트

## 라이선스

Apache-2.0. 자세한 내용은 [LICENSE](./LICENSE)와 [NOTICE](./NOTICE)를 참고하세요.
