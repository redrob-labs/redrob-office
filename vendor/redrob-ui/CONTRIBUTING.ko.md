# 기여 안내

English: [CONTRIBUTING.md](./CONTRIBUTING.md)

조직 전체 규칙은
[redrob-labs/.github](https://github.com/redrob-labs/.github)에 있습니다. 이
문서는 **이 저장소**에만 해당하는 것, 즉 상속으로 대신할 수 없는 부분을 적습니다.

## 준비

Node.js 20.x, Yarn 1.x입니다.

```bash
yarn install
yarn build && yarn test
```

## 브랜치

기본 브랜치는 `develop`이고 모든 변경이 먼저 여기로 들어옵니다. `main`은 릴리스된 상태이며
승격 풀 리퀘스트로만 움직입니다.

작업 브랜치는 `<type>/<짧은-슬러그>`입니다. `gitflow` 워크플로가 실제로 검사하는 이
저장소의 타입 목록은 다음과 같습니다.

```
feat fix chore docs test refactor perf hotfix release
```

`sync` 타입은 없습니다. 이 저장소는 포크가 아니라 상류에서 받아올 것이 없습니다.

타입 목록은 조직 안에서도 저장소마다 다르고, 검사는 추측을 통과시키지 않습니다. 게이트는
`.github/workflows/gitflow.yml`의 `ALLOWED_TYPES`이고 위 목록은 그 설명입니다. 둘이
어긋나면 워크플로가 맞고 이 문서가 낡은 것입니다.

브랜치 이름은 무엇을 바꾸는지를 말하며, 누가·무엇이 만들었는지를 말하지 않습니다. 에이전트
이름이나 도구 이름은 타입이 아닙니다.

검사가 이미 실패했다면 브랜치 이름만 바꿔서는 부족합니다. 실패한 실행이 커밋에 묶여 남으므로
커밋도 amend해야 합니다. 그러지 않으면 새 풀 리퀘스트가 스스로 머지 가능하다고 보고하면서
예전 빨간 X를 그대로 보여줍니다.

## 머지

| 상황 | 방식 |
|---|---|
| 작업 브랜치 -> `develop` | squash |
| `develop` -> `main` 승격 | 머지 커밋 |
| 핫픽스 -> `main` | 머지 커밋 |

rebase 머지는 쓰지 않습니다. 승격을 squash하면 두 브랜치의 관계가 사라지고 `back-merged`
검사가 비교할 실체를 잃습니다.

## 변경 검증

`yarn test`가 게이트입니다. 모든 컴포넌트를 디자인 시스템 배포물의 `preview.html` 케이스로
두 번 렌더합니다. 한 번은 원본 번들로, 한 번은 우리가 빌드한 `dist`로. 그리고 마크업을 비교합니다.

```bash
yarn build       # tsc 후 styles·fonts 복사
yarn test        # 모든 컴포넌트를 원본 번들과 비교
yarn test:self   # 원본을 원본과 비교. 깨진 하네스가 통과로 보이지 않게
```

빌드의 종료 코드를 따로 보세요. `tsc`에 `noEmitOnError`가 없어서 **오류를 보고하면서도 출력을
씁니다.** 패리티 러너는 그 깨진 출력을 읽고 태연히 통과합니다. 이 레포에서 두 번 일어났습니다.
**빌드가 빨간데 패리티가 초록이면 통과가 아닙니다.**

무언가를 통과시키려고 하네스를 약화시키거나 건너뛰거나 예외를 두지 마세요. 원본과 우리 구현이
정말로 달라야 한다면, 이유를 풀 리퀘스트에 적으세요. 조용히 만든 예외 하나가 그 뒤의 모든
컴포넌트에 대해 게이트를 무의미하게 만듭니다.

## 컴포넌트 추가

1. 원본을 먼저 읽습니다. `sed -n '/^  function <Name>(/,/^  }$/p' reference/components/bundle.js`,
   프롭 계약은 `reference/components/index.d.ts`. 동작을 옮겨 적고, 개선하지 않습니다.
   게이트가 마크업을 비교하기 때문입니다.
2. `src/components/<Name>/<Name>.tsx`. 원본의 호출 모양을 유지하려고 JSX 대신
   `React.createElement`로 씁니다.
3. 타입이 붙은 props 인터페이스와, **왜**를 말하는 문서 주석. 무엇에 쓰는 것인지, 무엇에 쓰지
   말아야 하는지, 그 프롭이 무엇을 막는지. 코드를 다시 말하는 주석은 쓰지 않습니다.
4. `src/index.ts`의 그룹 제목 아래에서 타입까지 내보냅니다. 이 파일이 공개 표면 전부이며,
   여기서 내보내지 않은 컴포넌트는 사용자에게 존재하지 않습니다.
5. `yarn build && yarn test <Name>`이 통과할 때까지 돌리고, 그 다음 `yarn test`로 전체를 돌려
   앞선 것이 퇴행하지 않았는지 확인합니다.

스타일은 토큰 위의 순수 CSS입니다. 클래스 이름은 배포물 스타일시트(`src/styles/system.css`)에서
옵니다. Tailwind도, 추가할 유틸리티 클래스도 없습니다.

`src/icons/index.tsx`는 생성된 파일입니다. 파일이 아니라 `tools/generate/icons.js`를 고치세요.
CI가 `yarn icons:check`로 검사합니다.

예시 데이터에는 `example.com`을 씁니다. 실제 사람과 내부 도메인은 쓰지 않습니다.
픽스처의 사람은 정해진 가명에서 고릅니다. `John Doe`, `Jane Doe`, `Richard Roe`, `Mary Major`,
`John Stiles`, `Richard Miles`, 그리고 한글 `홍길동`, `김철수`, `이영희`, `박영수`입니다.
문자 체계는 그대로 둡니다. 한글 이름은 한 음절 이니셜과 CJK 줄바꿈을 검사하므로, 로마자 이름으로
바꾸면 그 검사가 조용히 사라집니다.

## 릴리스

버전은 `v<major>.<minor>.<patch>`입니다.

1. `develop`에서 `package.json`의 `version`을 올립니다.
2. `develop` -> `main` 승격 풀 리퀘스트를 열고 머지 커밋으로 머지합니다.
3. 그 커밋에 `main` 태그를 달고, 태그에서 GitHub Release를 만듭니다.

발행은 푸시가 아니라 `release: published`에서 돕니다. 태그가 `main`의 조상이 아니거나
`package.json`이 태그와 어긋나면 발행을 거부하고, 레지스트리에 이미 있는 버전은 건너뛰어
재시도가 안전합니다. 발행은 되돌릴 수 없습니다. 버전 번호는 올라간 순간 소진됩니다.

발행 없이 예행하려면 `publish` 워크플로를 수동 실행하고 `dry_run`을 켠 채로 둡니다.

## 풀 리퀘스트

조직 풀 리퀘스트 템플릿을 씁니다. 이 저장소에서 특히 빠지는 두 줄입니다.

- 설명에 쓰는 개수·크기·버전은 같은 자리에서 빌드 산출물로 다시 측정하고, 어느 표면에서
  나온 수치인지 밝힙니다.
- diff에 자격증명·토큰·`.env` 파일을 넣지 않습니다. `.npmrc`가 gitignore된 이유이니 그대로
  둡니다.

## 취약점 신고

이슈에 쓰지 않습니다. 조직
[보안 정책](https://github.com/redrob-labs/.github/blob/main/SECURITY.md)을 봅니다.
