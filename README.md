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
pnpm install
pnpm dev              # Electron 앱 (표시 장치 필요)
pnpm dev:web          # 렌더러만 브라우저에서 (모의 IPC, GPU 불필요)
pnpm typecheck
pnpm test
pnpm dist             # Windows 패키징
```

로컬 모델 가중치는 별도로 내려받습니다.

```bash
pnpm download:models
pnpm download:models -- --role text
```

### 구성

| 위치 | 역할 |
| --- | --- |
| `office/` | Electron 앱(메인·프리로드·렌더러). 도구, 정책, 에이전트 연결 |
| `packages/kernel` | 추론 경로와 모델 런타임 |
| `packages/extract` | 조회 엔진 |
| `packages/compare` | 처리 엔진(기준 파일, 산출 템플릿) |
| `packages/generate` | 문서 생성 |
| `packages/store` | 로컬 저장소 |
| `packages/registry` | 기준·템플릿·스킬 레지스트리 |
| `packages/ui` | 공용 UI와 다국어 문자열 |
| `packages/telemetry` | 옵트인 텔레메트리 |

### 릴리즈

태그를 밀면 GitHub Actions가 서명·패키징·게시까지 합니다. 태그는 `office/package.json`의 버전과 같아야 합니다(`v0.0.5` ↔ `0.0.5`).

## 문서

- [docs/setup-policy.md](./docs/setup-policy.md): 첫 실행, 로컬 모델 팩, 추론 라우팅 정책
- [docs/console-api.md](./docs/console-api.md): Redrob Console 추론 API 계약
- [AGENTS.md](./AGENTS.md): 개발·검증 환경과 동작 노트

## 라이선스

Apache-2.0. 자세한 내용은 [LICENSE](./LICENSE)와 [NOTICE](./NOTICE)를 참고하세요.
