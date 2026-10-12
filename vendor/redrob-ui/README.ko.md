# redrob-ui

English: [README.md](./README.md)

**Redrob Group Design System 2026**을 타입이 붙은 React 컴포넌트로 옮긴 라이브러리입니다.
컴포넌트 133개, 아이콘 260개. TypeScript로 작성하고, 디자인 토큰 위에 순수 CSS로 스타일을 입혔습니다.

`@redrob-labs/ui`

## 설치

```bash
yarn add @redrob-labs/ui
# 또는
npm install @redrob-labs/ui
```

공개 npm 레지스트리에 올라갑니다. 인증도, `.npmrc` 설정도 필요하지 않습니다. 이전 배포는 GitHub
Packages를 썼는데, 공개 패키지를 설치하는 데도 쓰는 쪽이 토큰을 들고 있어야 했습니다.

`react`와 `react-dom`은 peer dependency입니다(`^18.2.0 || ^19.0.0`). 쓰는 쪽 프로젝트가 제공합니다.

## 사용

스타일시트를 앱 진입점에서 한 번만 불러옵니다. Tailwind 설정도, PostCSS 단계도, 빌드 플러그인도
없습니다. 커스텀 프로퍼티 위에 올린 순수 CSS입니다.

```javascript
import '@redrob-labs/ui/tokens.css';
import '@redrob-labs/ui/styles.css';
import '@redrob-labs/ui/preflight.css'; // 페이지 전체를 이 시스템이 맡을 때만 — 아래 참고
```

```jsx
import { Button, Hero, Display } from '@redrob-labs/ui';

function Landing() {
  return (
    <Hero
      lede="이 페이지의 모든 숫자는 무엇을 기준으로 잰 것인지 함께 말합니다."
      action={<Button tone="primary">측정 방법 보기</Button>}
      secondary="데이터 보기"
      secondaryHref="/data"
    >
      <Display>검증할 수 있는 채용 판단.</Display>
    </Hero>
  );
}
```

`src/index.ts`가 단일 진입점입니다. 모든 export가 시스템 그룹별로, 프롭 타입과 함께 거기 적혀 있습니다.

폰트 18종은 `dist/fonts/`에 들어가고 `system.css`가 상대 경로로 참조하므로, 패키지를 어디서 서빙해도
경로가 맞습니다.

### 페이지 배경은 라이브러리가 아니라 앱이 칠합니다

`system.css`도, 디자인 시스템 원본 번들도 `html`이나 `body` 규칙을 선언하지 않습니다. 일부러입니다.
페이지를 칠하는 라이브러리는 그것을 쓰는 앱의 결정을 빼앗고, 자기 셸을 가진 앱은 그걸 다시 되돌려야
합니다.

대가는 함정 하나입니다. `data-theme="dark"`를 켜면 컴포넌트는 어두워지는데 그 뒤 페이지는 브라우저
기본 흰색으로 남습니다. `preflight.css`를 불러오거나, 직접 적으십시오.

```css
html, body { background: var(--surface-base); color: var(--ink-primary); }
[data-theme='dark'] { color-scheme: dark; }
```

`preflight.css`에는 `color-scheme`도 들어 있습니다. 스크롤바와 네이티브 `<select>` 팝업이 테마를
따르게 하는 유일한 방법입니다. `:lang(ko)`의 한국어 폰트 스택과 `prefers-reduced-motion` 블록도
같이 들어 있습니다. 제품 화면에서는 불러오고, 남의 페이지 안에 얹는 위젯에서는 넣지 않습니다.

## React 없이 쓰기

React 컴포넌트는 세 층 중 맨 위 한 층입니다. React를 못 돌리는 Redrob 제품도 눈으로는 같은 제품이
될 수 있습니다.

| 층 | 무엇인가 | 누가 쓰나 |
| --- | --- | --- |
| `@redrob-labs/ui` | 타입 붙은 컴포넌트 133개 | Next·Electron 렌더러: 웹사이트, 콘솔, 챗, 오피스 |
| `tokens.css` + `styles.css` + `fonts/` | 클래스 블록 149개, 셀렉터 1,239개, React 없음 | Vue, Solid, 크로미움 WebUI, 순수 HTML |
| `tokens.json` + `native/*` | 리터럴로 해석된 토큰 332개 | C++ 창 크롬, 안드로이드, iOS |

### CSS만 — Vue, Solid, 크로미움 WebUI, 순수 HTML

스타일시트 둘과 폰트만 가져가면 됩니다. 클래스 이름이 계약이고 JavaScript는 관여하지 않습니다.

```javascript
import '@redrob-labs/ui/tokens.css';
import '@redrob-labs/ui/styles.css';
```

```html
<button class="rr-btn rr-btn--primary rr-btn--md"><span>Go</span></button>
```

생성된 문서의 모든 렌더링이 컴포넌트가 실제로 뱉는 마크업을 그대로 보여 줍니다. 어떤 컴포넌트의
클래스 조합이든 짐작하지 않고 문서에서 읽어 오면 됩니다.

### 네이티브 — CSS를 해석할 수 없는 화면

`var(--surface-base)`는 CSS 기능입니다. 브라우저 창 크롬은 C++로, 안드로이드 앱은 Kotlin으로 그리고,
둘 다 그것을 읽지 못합니다. 그래서 `var()` 사슬을 여기서 테마별로 풀어 리터럴로 넘깁니다.

```
@redrob-labs/ui/tokens.json        토큰 332개, 두 테마, 각 토큰이 지나온 사슬까지
@redrob-labs/ui/native/redrob_tokens.h    색 89개 × 두 테마, SkColor용 0xAARRGGBB
@redrob-labs/ui/native/RedrobTokens.kt    같은 값, Kotlin Long
```

```cpp
#include "redrob_tokens.h"

// 빌드 플래그가 아니라 지금 켜진 테마로 고릅니다. OS가 밝아도 브라우저는 어두울 수 있습니다.
SkColor page = dark_mode ? redrob::tokens::dark::kSurfaceBase   // 0xFF0A0B0C
                         : redrob::tokens::light::kSurfaceBase; // 0xFFFFFFFF
```

알파는 버리지 않고 함께 넘깁니다. 이 집합에서 두 토큰은 실제로 반투명하고, 그걸 불투명으로 다루면
디자인이 베일을 의도한 자리에 색 덩어리가 찍힙니다.

`yarn tokens`가 `tokens.css`에서 셋을 다시 만들고, `tokens:check`는 커밋된 `tokens.json`이 뒤처지면
CI를 떨어뜨립니다. 두 언어에 손으로 적어 두면 첫 색 변경에서 갈라지고, 그 갈라짐은 누가 창과 웹
페이지를 나란히 찍어 볼 때까지 보이지 않습니다.

### 여기에 해당하지 않는 것

React Native는 `div`와 CSS 클래스가 아니라 네이티브 뷰로 그립니다. 그래서 컴포넌트도 스타일시트도
거기서는 쓸 수 없고, 토큰 층만 쓸 수 있습니다. WebView 안이나 PWA로 만든 모바일 앱은 세 층을 그대로
다 씁니다.

토큰 332개 중 29개는 안에 `var()`가 남은 CSS `font` 축약형입니다. 텍스트 스타일은 모두
`600 21px/28px var(--font-sans)` 꼴이고, 값 전체가 별칭일 때만 더 따라갈 수 있습니다. `tokens.json`에
`containsVar`로 표시해 뒀습니다. 색은 하나도 여기 없으므로 네이티브 헤더는 영향받지 않습니다.

**힌디는 폰트가 연결돼 있지 않고, 이 구멍은 배포물 쪽 것을 그대로 옮긴 결과입니다.** 디자인 시스템
타이포그래피 규격은 `--font-sans-hi`를 이름 붙이고 힌디 타입 스케일 전체를 지정합니다 — `hi-display-1`
72/94, 최소 13px, 이탤릭 대신 weight 600. 그런데 배포물 자기 `tokens.css`가 그중 아무것도 선언하지
않고, 우리 것도 마찬가지입니다. 양쪽 다 힌디 토큰 0개이고, 우리 `@font-face` 경로 수정 말고는 바이트가
같습니다. `NotoSansDevanagari-Variable.woff2`와 `Newsreader-Display.woff2`는 `dist/fonts/`에 들어가지만
어떤 `@font-face`도 참조하지 않으며, 배포물에서도 그렇습니다. 이걸 연결하려면 행간 값을 정해야 하고,
규격 자기 문서가 그 숫자들은 힌디 독자의 검토를 아직 못 받았다고 적어 뒀습니다. 그래서 조용히 한 줄
넣을 일이 아니라 의식적으로 내릴 결정입니다.

## 모듈 형식 두 가지

CommonJS와 ESM을 둘 다 내고 `exports` 표로 골라 줍니다. 형식만 갖춘 게 아닙니다.

```
Button 하나만 import, minify, react는 external
  dist/index.js      (CommonJS)   405,590 바이트
  dist/esm/index.js  (ESM)          1,143 바이트
```

CommonJS 모듈의 export는 실행 시점에 정해지므로, 번들러는 배럴 파일이 이름을 부른 컴포넌트를 전부
남겨 둬야 합니다. `yarn exports:check`가 두 쪽을 각각 별도 Node 프로세스에서 불러 export 목록을
맞춰 봅니다. 번들러는 깨진 ESM 지정자를 덮어 주지만 Node는 덮어 주지 않기 때문입니다.

## 패리티 하네스

이 라이브러리는 디자인 시스템 원본 번들을 옮겨 적은 것입니다. 그래서 "보기에 맞다"는 기준이 아닙니다.
게이트는 마크업이 정확히 같은지입니다.

```bash
yarn test        # 모든 컴포넌트를 원본 번들과 비교
yarn test:self   # 원본을 원본과 비교. 하네스가 아직 실제로 비교하는지 확인
```

`node tools/parity/run.js [이름들]`은 각 컴포넌트를 두 번 렌더합니다. 한 번은 원본 번들로, 한 번은
우리가 빌드한 `dist`로. 기준이 되는 케이스는 원본 배포물의 `preview.html`이고, 우리 것이 아니므로
검사 대상 구현 쪽으로 끌려갈 수 없습니다.

`reference/`에는 141MB 배포물에서 2MB만 떼어낸 사본이 들어 있습니다. `bundle.js`, 스타일시트,
프롭 계약, 프리뷰 케이스 148개. CI에서 게이트가 실제로 돌게 하려고 커밋했습니다. 갱신하거나 새 배포물을
시험하려면 `REDROB_DS_DIR`를 전체 배포물 경로로 지정하면 됩니다.

사람 눈으로는 못 잡고 이 하네스가 잡은 것 두 가지:

- 원 하나의 인라인 스타일이 `height;width` 순서인 원본과 달리 `width;height`로 나갔습니다.
  화면으로는 똑같고, DOM은 다릅니다.
- 전에는 `tsc`가 **오류를 보고하면서도 출력을 썼습니다.** 타입 오류가 있는 컴포넌트가 그대로 렌더되고,
  깨진 출력 위에서 패리티가 통과했습니다. 두 가지로 막았습니다. `noEmitOnError`를 켰고, `yarn build`가
  `dist/`를 먼저 지워서 실패한 빌드가 낡았지만 유효한 트리를 남기지 못하게 했습니다. **빌드가 빨간데
  패리티가 초록이면 여전히 통과가 아닙니다.** 빌드 종료 코드를 따로 봐야 합니다.

## 개발

Node.js 20.x, Yarn 1.x (`yarn.lock`이 v1이고 CI는 `--frozen-lockfile`로 설치합니다).

```bash
git clone https://github.com/redrob-labs/redrob-ui.git
cd redrob-ui
yarn install
yarn build && yarn test
```

| 명령 | 하는 일 |
|---|---|
| `yarn build` | `tsc`로 `dist/` 생성 후 `src/styles/*.css`와 `src/fonts/*.woff2` 복사. |
| `yarn test` | 원본 번들과 패리티 비교. 이게 게이트입니다. |
| `yarn test:self` | 원본을 원본과 비교. 하네스가 멀쩡한지 확인. |
| `yarn icons` | 배포물의 아이콘 표에서 `src/icons/index.tsx` 재생성. |
| `yarn icons:check` | 커밋된 아이콘 모듈이 낡았으면 실패. |
| `yarn docs` | `site/`를 만들고 `llms.txt`·`llms-full.txt`를 재생성. |
| `yarn docs:check` | 커밋된 에이전트용 문서가 코드와 어긋나면 실패. |

## 문서

두 가지 표면을, 같은 소스를 한 번 훑어 함께 만듭니다. 그래서 서로 어긋날 수가 없습니다.

**사람용:** [컴포넌트 문서](https://redrob-labs.github.io/redrob-ui) — 컴포넌트마다 한 페이지씩,
실제로 렌더된 화면과 프롭 표와 import 한 줄이 있습니다. 페이지의 렌더는 배포물 자기 프리뷰 케이스를
이 패키지 빌드로 돌린 것이고, 패리티 게이트가 원본 번들과 비교하는 바로 그 렌더입니다. 따라서 문서의
예시가 따로 틀릴 수 없습니다.

**에이전트용:** [`llms.txt`](https://redrob-labs.github.io/redrob-ui/llms.txt)가 목록이고,
[`llms-full.txt`](https://redrob-labs.github.io/redrob-ui/llms-full.txt)에 컴포넌트 설명과 프롭
전체가 한 파일로 들어 있습니다. 둘 다 저장소 루트에도 커밋돼 있어서, 사이트가 아니라 소스를 읽는
에이전트도 같은 내용을 봅니다.

사이트는 `main`에서 배포합니다. `main`이 릴리스 상태입니다 — `publish.yml`이 `main`의 조상이 아닌
태그를 거부합니다. 그래서 사이트가 말하는 버전이 실제로 설치되는 버전이고, 승격이 있을 때까지 사이트는
움직이지 않습니다. 아직 내지 않은 트리를 설명하는 문서는 뒤처진 문서보다 나쁩니다. 읽는 사람이 둘을
구분할 수 없기 때문입니다.

두 표면 어디에도 손으로 쓴 설명이 없습니다. 묶음과 순서는 `src/index.ts`, 설명은 각 export 위의
JSDoc, 프롭은 `<Name>Props` 인터페이스를 TypeScript AST로 읽은 것, 렌더는 `dist/`에서 나옵니다.
타입에 없는 프롭이 문서에 적힐 수 없습니다. `yarn docs:check`가 CI에 있는 이유는, 커밋된 `llms.txt`가
낡으면 에이전트가 읽는 것이 바로 그 낡은 내용이고 다른 어떤 검사도 그것을 알아채지 못하기 때문입니다.

`src/icons/index.tsx`는 **생성된 파일**입니다. 파일이 아니라 생성기를 고치세요. 손으로 고친 내용은
다음 `yarn icons`에서 경고도 없이 덮어써집니다. CI가 검사하는 이유입니다.

컴포넌트는 JSX가 아니라 `React.createElement`로 씁니다. 의도한 것입니다. 이 포팅은 원본의 `h()` 호출을
옮겨 적는 일이고 게이트가 마크업을 정확히 비교하므로, 호출 모양을 그대로 두면 차이가 난 자리를 찾기 쉽습니다.

Storybook은 없습니다. 배포물의 `preview.html` 케이스 148개가 이미 갤러리이고, 패리티 하네스가 모든
컴포넌트를 그 케이스 전부로 렌더합니다. 손으로 쓴 스토리는 같은 케이스의 세 번째 사본이 되고, 원본과
구현 양쪽에서 따로 낡습니다.

## 기여

[CONTRIBUTING.ko.md](./CONTRIBUTING.ko.md) — 브랜치 이름, 풀 리퀘스트 경로, 릴리스 방법.
브랜치 전략은 조직의
[gitflow 표준](https://github.com/mckinley-and-rice/.github/blob/main/docs/GITFLOW.md)을 따릅니다.
`develop`이 기본 브랜치, `main`이 릴리스된 상태입니다.

## 지원

- 버그와 기능 요청: [issues](https://github.com/redrob-labs/redrob-ui/issues).
- 보안 취약점: 이슈에 쓰지 마세요. 조직의
  [보안 정책](https://github.com/redrob-labs/.github/blob/main/SECURITY.md)을 따릅니다.

## 라이선스

MIT. [LICENSE](./LICENSE) 참고.
