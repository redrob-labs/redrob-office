/**
 * setup-copy.ts — SINGLE SOURCE OF TRUTH for every string the Setup / Uninstall
 * prototype shows.
 *
 * WHY THIS FILE EXISTS (porting contract):
 * This in-app prototype exists only to try out the LOOK and WORDING of the real
 * Redrob Office installer/uninstaller before we spend effort wiring it into the
 * actual packaging layer. The real installer is defined in
 *   office-src/apps/shell/electron-builder.cjs
 * as an NSIS assisted installer (Windows) + a drag-to-Applications DMG (macOS).
 *
 * Every key below is named after the REAL installer field it will eventually
 * populate, so porting is mechanical: once the copy is approved here, each value
 * is lifted into its mapped electron-builder / NSIS / DMG destination. See
 * PORTING.md in this folder for the exact key -> destination table.
 *
 * VOICE (07-voice.md): in the product the subject is "the product, and you" —
 * second person, imperative, present tense, no "we", one beat per surface, and
 * none of the refused words (AI-powered, seamless, effortless, unlock, …). The
 * progress lines are the ONE playful exception Felix asked for (SimCity's
 * "Reticulating splines…"), kept dry and short so they read as the system
 * talking, not as marketing. The feature list names the real Office
 * capabilities (05-mission.md): inside Office the model-ranking feature is
 * "Redrob Auto" (never "Expert Match"), and cross-check is "Cross-check".
 *
 * NOTHING in this module touches backend/infra. It is pure React + strings.
 *
 * Locale shape: `en` defines the key set; `zh` and `ko` are type-checked to
 * match it exactly (the `Copy` interface + the typed `copy` map enforce parity).
 */

/** Facts pinned to the real electron-builder config — do not invent values. */
export const PRODUCT = {
  /** productName in electron-builder.cjs */
  displayName: 'Redrob Office',
  /** appId in electron-builder.cjs */
  appId: 'com.redrob.app',
  /** executableName in electron-builder.cjs (same on every platform) */
  binaryName: 'redrob',
  /** nsis.artifactName pattern (version filled at build time) */
  windowsInstallerName: 'Redrob-Setup-${version}.exe',
  /** mac.artifactName pattern */
  macInstallerName: 'Redrob-${version}-${arch}.dmg',
} as const

/** One highlighted capability on the welcome screen. */
export interface Feature {
  /** short noun label, e.g. "Offline" */
  title: string
  /** one line, no superlatives, carries a fact not an adjective */
  body: string
}

export interface Copy {
  /** NSIS MUI welcome page / DMG window title area */
  welcome: {
    eyebrow: string
    title: string
    /** the one welcome beat (07-voice.md: one per surface) */
    body: string
    /** the real Office capabilities, shown as an honest short list */
    features: Feature[]
    cta: string
  }
  /** NSIS license page (MUI_PAGE_LICENSE) — body is the repo LICENSE text */
  license: {
    title: string
    intro: string
    agree: string
    back: string
    next: string
  }
  /** NSIS directory page (allowToChangeInstallationDirectory: true) */
  location: {
    title: string
    body: string
    label: string
    /** cosmetic default path shown; the real page reads $INSTDIR */
    defaultHintWin: string
    defaultHintMac: string
    change: string
    back: string
    install: string
  }
  /** NSIS install-progress page */
  progress: {
    title: string
    /** playful-but-dry lines shown as the fake progress advances */
    steps: string[]
  }
  /** NSIS finish page (MUI_FINISHPAGE_RUN text + title) */
  finish: {
    title: string
    body: string
    runApp: string
    close: string
  }
  /** NSIS uninstaller confirm page + Add/Remove Programs display name */
  uninstall: {
    confirmTitle: string
    confirmBody: string
    keepDataNote: string
    cancel: string
    confirm: string
    /** optional feedback step — MOCK ONLY, no transport (see PORTING.md) */
    feedbackTitle: string
    feedbackBody: string
    /** the reason chips above the free-text box (mock, local-only) */
    feedbackReasons: string[]
    feedbackPlaceholder: string
    feedbackSkip: string
    feedbackSend: string
    /** playful-but-dry lines shown while removing */
    removingTitle: string
    removingSteps: string[]
    doneTitle: string
    doneBody: string
    doneClose: string
  }
}

/** en defines the key set; zh and ko are type-checked to match it exactly. */
export const copy: { en: Copy; zh: Copy; ko: Copy } = {
  en: {
    welcome: {
      eyebrow: 'Welcome',
      title: 'Install Redrob Office',
      body: 'The whole office, on your own machine. Docs, Sheets, Slides, Markdown, PDF and Hangul in one window.',
      features: [
        {
          title: 'Runs offline',
          body: 'Open, edit and save without a connection. Your files stay on your machine.',
        },
        {
          title: 'Redrob Auto',
          body: 'Sends each task to the model that does it best. You never have to know which.',
        },
        {
          title: 'Memory',
          body: 'Carries one context across Claude, GPT, Gemini and your projects. Switch models, not context.',
        },
        {
          title: 'Cross-check',
          body: 'Runs important work past several models and shows where they disagree.',
        },
      ],
      cta: 'Get started',
    },
    license: {
      title: 'License',
      intro: 'Read the terms before you continue.',
      agree: 'I accept the terms in the License',
      back: 'Back',
      next: 'Next',
    },
    location: {
      title: 'Choose where it goes',
      body: 'Redrob Office installs in this folder. Pick another with Change.',
      label: 'Destination folder',
      defaultHintWin: 'C:\\Program Files\\Redrob Office',
      defaultHintMac: '/Applications',
      change: 'Change…',
      back: 'Back',
      install: 'Install',
    },
    progress: {
      title: 'Installing Redrob Office',
      // The one playful surface (Felix): SimCity energy, kept dry and true.
      steps: [
        'Unfolding the documents…',
        'Lining up the spreadsheet cells…',
        'Teaching the slides to stay still…',
        'Waking the Hangul engine…',
        'Introducing the models to each other…',
        'Tidying up…',
      ],
    },
    finish: {
      title: 'Done',
      body: 'Redrob Office is on your machine. Open it and start with a blank page.',
      runApp: 'Open Redrob Office',
      close: 'Finish',
    },
    uninstall: {
      confirmTitle: 'Uninstall Redrob Office',
      confirmBody: 'This removes Redrob Office from your machine.',
      keepDataNote: 'Your documents are not deleted — they stay where they are.',
      cancel: 'Keep it',
      confirm: 'Uninstall',
      feedbackTitle: 'Sorry to see you go',
      feedbackBody: 'If you have a moment: what sent you off? It helps, and it is optional.',
      feedbackReasons: [
        'Missing a feature',
        'Too slow',
        'Found something else',
        'Just trying it out',
      ],
      feedbackPlaceholder: 'Anything else you want to tell us…',
      feedbackSkip: 'Skip',
      feedbackSend: 'Send and uninstall',
      removingTitle: 'Removing Redrob Office',
      removingSteps: ['Folding the documents away…', 'Clearing the shortcuts…', 'Leaving your files alone…'],
      doneTitle: 'Uninstalled',
      doneBody: 'Redrob Office is gone, your files are not. Hope to see you back soon.',
      doneClose: 'Close',
    },
  },

  zh: {
    welcome: {
      eyebrow: '欢迎',
      title: '安装 Redrob Office',
      body: '整个办公套件，装进你自己的电脑。文档、表格、幻灯片、Markdown、PDF 与 Hangul，同在一个窗口。',
      features: [
        {
          title: '离线可用',
          body: '无需联网也能打开、编辑和保存。文件始终留在你的电脑上。',
        },
        {
          title: 'Redrob Auto',
          body: '把每项任务交给最擅长它的模型。你不必知道是哪一个。',
        },
        {
          title: 'Memory',
          body: '在 Claude、GPT、Gemini 和各个项目之间，延续同一份工作脉络。换模型，不换脉络。',
        },
        {
          title: 'Cross-check',
          body: '把重要的工作交给多个模型，并指出它们意见相左的地方。',
        },
      ],
      cta: '开始',
    },
    license: {
      title: '许可协议',
      intro: '继续之前请阅读条款。',
      agree: '我接受许可协议中的条款',
      back: '上一步',
      next: '下一步',
    },
    location: {
      title: '选择安装位置',
      body: 'Redrob Office 将安装到此文件夹。点击“更改”可另选位置。',
      label: '安装文件夹',
      defaultHintWin: 'C:\\Program Files\\Redrob Office',
      defaultHintMac: '/Applications',
      change: '更改…',
      back: '上一步',
      install: '安装',
    },
    progress: {
      title: '正在安装 Redrob Office',
      steps: [
        '正在摊开文档…',
        '正在对齐表格单元…',
        '正在让幻灯片站稳…',
        '正在唤醒 Hangul 引擎…',
        '正在让各个模型相互认识…',
        '正在收尾…',
      ],
    },
    finish: {
      title: '完成',
      body: 'Redrob Office 已在你的电脑上。打开它，从一页空白开始。',
      runApp: '打开 Redrob Office',
      close: '完成',
    },
    uninstall: {
      confirmTitle: '卸载 Redrob Office',
      confirmBody: '这会从你的电脑中移除 Redrob Office。',
      keepDataNote: '你的文档不会被删除——它们仍留在原处。',
      cancel: '仍然保留',
      confirm: '卸载',
      feedbackTitle: '很遗憾你要离开',
      feedbackBody: '如果有空：是什么让你离开的？这对我们有帮助，当然也可以不填。',
      feedbackReasons: ['缺少某项功能', '太慢了', '找到了别的', '只是随便试试'],
      feedbackPlaceholder: '还有什么想告诉我们的…',
      feedbackSkip: '跳过',
      feedbackSend: '发送并卸载',
      removingTitle: '正在移除 Redrob Office',
      removingSteps: ['正在收起文档…', '正在清理快捷方式…', '正在保留你的文件…'],
      doneTitle: '已卸载',
      doneBody: 'Redrob Office 已离开，你的文件仍在。希望很快再见。',
      doneClose: '关闭',
    },
  },

  ko: {
    welcome: {
      eyebrow: '환영해요',
      title: 'Redrob Office 설치',
      body: '사무 작업 전체를 내 컴퓨터에. 문서, 시트, 슬라이드, 마크다운, PDF, 한글이 한 창에 모여요.',
      features: [
        {
          title: '오프라인에서도',
          body: '연결 없이도 열고, 고치고, 저장해요. 파일은 내 컴퓨터에 그대로 남아요.',
        },
        {
          title: 'Redrob Auto',
          body: '각 작업을 가장 잘하는 모델에게 보내요. 어떤 모델인지 몰라도 돼요.',
        },
        {
          title: 'Memory',
          body: 'Claude, GPT, Gemini와 여러 프로젝트를 오가도 하나의 맥락으로 이어져요. 모델은 바꿔도, 맥락은 그대로.',
        },
        {
          title: 'Cross-check',
          body: '중요한 일은 여러 모델로 검토해서 어디서 엇갈리는지 보여 줘요.',
        },
      ],
      cta: '시작하기',
    },
    license: {
      title: '라이선스',
      intro: '계속하기 전에 약관을 읽어 주세요.',
      agree: '라이선스 약관에 동의해요',
      back: '이전',
      next: '다음',
    },
    location: {
      title: '설치 위치 선택',
      body: 'Redrob Office를 이 폴더에 설치해요. 다른 곳에 두려면 변경을 눌러요.',
      label: '설치 폴더',
      defaultHintWin: 'C:\\Program Files\\Redrob Office',
      defaultHintMac: '/Applications',
      change: '변경…',
      back: '이전',
      install: '설치',
    },
    progress: {
      title: 'Redrob Office 설치 중',
      steps: [
        '문서를 펼치는 중…',
        '시트 칸을 맞추는 중…',
        '슬라이드를 가만히 두는 중…',
        '한글 엔진을 깨우는 중…',
        '모델끼리 인사시키는 중…',
        '마무리하는 중…',
      ],
    },
    finish: {
      title: '완료',
      body: 'Redrob Office가 내 컴퓨터에 준비됐어요. 열어서 빈 페이지부터 시작해요.',
      runApp: 'Redrob Office 열기',
      close: '마침',
    },
    uninstall: {
      confirmTitle: 'Redrob Office 제거',
      confirmBody: '내 컴퓨터에서 Redrob Office를 지워요.',
      keepDataNote: '문서는 지워지지 않아요. 있던 자리에 그대로 남아요.',
      cancel: '그대로 둘게요',
      confirm: '제거',
      feedbackTitle: '떠난다니 아쉬워요',
      feedbackBody: '잠깐 시간이 되면: 무엇 때문에 떠나시나요? 도움이 되고, 안 적으셔도 괜찮아요.',
      feedbackReasons: ['필요한 기능이 없어서', '너무 느려서', '다른 걸 찾아서', '그냥 둘러보는 중'],
      feedbackPlaceholder: '더 하고 싶은 말이 있으면…',
      feedbackSkip: '건너뛰기',
      feedbackSend: '보내고 제거',
      removingTitle: 'Redrob Office 제거 중',
      removingSteps: ['문서를 접어 두는 중…', '바로가기를 치우는 중…', '파일은 그대로 두는 중…'],
      doneTitle: '제거됨',
      doneBody: 'Redrob Office는 떠났지만, 파일은 그대로예요. 곧 다시 만나길 바라요.',
      doneClose: '닫기',
    },
  },
}

export type Lang = keyof typeof copy
