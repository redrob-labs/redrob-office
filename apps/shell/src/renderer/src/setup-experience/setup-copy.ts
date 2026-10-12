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
 * NOTHING in this module touches backend/infra. It is pure React + strings.
 *
 * Locale shape mirrors apps/shell/src/renderer/src/strings.ts: `zh` defines the
 * key set and `en` must match it (enforced by the `Copy` type below).
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

export interface Copy {
  /** NSIS MUI welcome page / DMG window title area */
  welcome: {
    eyebrow: string
    title: string
    body: string
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
    /** steps shown as the fake progress advances (purely visual) */
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
    feedbackPlaceholder: string
    feedbackSkip: string
    feedbackSend: string
    removingTitle: string
    doneTitle: string
    doneBody: string
    doneClose: string
  }
}

/** zh defines the key set; en is type-checked to match it exactly. */
export const copy: { zh: Copy; en: Copy } = {
  zh: {
    welcome: {
      eyebrow: '欢迎',
      title: '安装 Redrob Office',
      body: 'Redrob Office 是一款在本地运行、离线优先的办公套件——文档、表格、幻灯片、Markdown、PDF 与 Hangul 编辑器集于一窗，内置 Redrob AI 助手。',
      cta: '开始',
    },
    license: {
      title: '许可协议',
      intro: '继续前请阅读以下许可条款。',
      agree: '我接受协议中的条款',
      back: '上一步',
      next: '下一步',
    },
    location: {
      title: '选择安装位置',
      body: 'Redrob Office 将安装到以下文件夹。如需安装到其他文件夹，请点击“更改”。',
      label: '安装文件夹',
      defaultHintWin: 'C:\\Program Files\\Redrob Office',
      defaultHintMac: '/Applications',
      change: '更改…',
      back: '上一步',
      install: '安装',
    },
    progress: {
      title: '正在安装 Redrob Office',
      steps: ['正在准备文件…', '正在复制应用程序…', '正在注册文件关联…', '正在创建快捷方式…', '即将完成…'],
    },
    finish: {
      title: '安装完成',
      body: 'Redrob Office 已安装到您的电脑。',
      runApp: '启动 Redrob Office',
      close: '完成',
    },
    uninstall: {
      confirmTitle: '卸载 Redrob Office',
      confirmBody: '确定要从电脑中移除 Redrob Office 吗？',
      keepDataNote: '您的文档不会被删除——它们仍保留在原来的位置。',
      cancel: '取消',
      confirm: '卸载',
      feedbackTitle: '告别之前',
      feedbackBody: '能否告诉我们卸载的原因？（可选）',
      feedbackPlaceholder: '您的反馈…',
      feedbackSkip: '跳过',
      feedbackSend: '发送反馈',
      removingTitle: '正在移除 Redrob Office',
      doneTitle: '已卸载',
      doneBody: 'Redrob Office 已从您的电脑中移除。感谢您的使用。',
      doneClose: '关闭',
    },
  },
  en: {
    welcome: {
      eyebrow: 'Welcome',
      title: 'Install Redrob Office',
      body: 'Redrob Office is an on-device, offline-first office suite — Docs, Sheets, Slides, Markdown, PDF, and Hangul editors in one window, with the Redrob AI assistant built in.',
      cta: 'Get started',
    },
    license: {
      title: 'License Agreement',
      intro: 'Please review the license terms before continuing.',
      agree: 'I accept the terms in the License Agreement',
      back: 'Back',
      next: 'Next',
    },
    location: {
      title: 'Choose Install Location',
      body: 'Redrob Office will be installed in the following folder. To install in a different folder, click Change.',
      label: 'Destination folder',
      defaultHintWin: 'C:\\Program Files\\Redrob Office',
      defaultHintMac: '/Applications',
      change: 'Change…',
      back: 'Back',
      install: 'Install',
    },
    progress: {
      title: 'Installing Redrob Office',
      steps: [
        'Preparing files…',
        'Copying application…',
        'Registering file associations…',
        'Creating shortcuts…',
        'Almost done…',
      ],
    },
    finish: {
      title: 'Installation Complete',
      body: 'Redrob Office has been installed on your computer.',
      runApp: 'Launch Redrob Office',
      close: 'Finish',
    },
    uninstall: {
      confirmTitle: 'Uninstall Redrob Office',
      confirmBody: 'Are you sure you want to remove Redrob Office from your computer?',
      keepDataNote: 'Your documents will not be deleted — they stay where they are.',
      cancel: 'Cancel',
      confirm: 'Uninstall',
      feedbackTitle: 'Before you go',
      feedbackBody: 'Could you tell us why you are uninstalling? (optional)',
      feedbackPlaceholder: 'Your feedback…',
      feedbackSkip: 'Skip',
      feedbackSend: 'Send feedback',
      removingTitle: 'Removing Redrob Office',
      doneTitle: 'Uninstalled',
      doneBody: 'Redrob Office has been removed from your computer. Thank you for trying it.',
      doneClose: 'Close',
    },
  },
}

export type Lang = keyof typeof copy
