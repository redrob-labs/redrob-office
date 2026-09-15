/**
 * Renderer UI strings for the Hangul editor chrome (the thin GenOffice frame
 * around the embedded rhwp-studio iframe). Locale set matches the other editor
 * apps for key parity; en and ko are authored, the rest mirror the same keys.
 */
export const strings = {
  zh: {
    save: '保存',
    saving: '正在保存…',
    saved: '已保存',
    saveFailed: '保存失败：{error}',
    resolvingStudio: '正在准备 Hangul 编辑器…',
    offlineUnavailable: '此版本未配置离线 Hangul 编辑器。为保持离线运行，公共编辑器 CDN 已停用。',
    loadFailed: '无法打开文档：{error}',
    poweredBy: '由 rhwp 提供 HWP/HWPX 编辑（MIT）',
  },
  en: {
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved',
    saveFailed: 'Save failed: {error}',
    resolvingStudio: 'Preparing the Hangul editor...',
    offlineUnavailable:
      'The offline Hangul editor is not configured in this build. The public editor CDN is disabled to keep the app offline.',
    loadFailed: 'Could not open the document: {error}',
    poweredBy: 'HWP/HWPX editing by rhwp (MIT)',
  },
  ja: {
    save: '保存',
    saving: '保存中…',
    saved: '保存しました',
    saveFailed: '保存に失敗しました：{error}',
    resolvingStudio: 'Hangul エディターを準備しています…',
    offlineUnavailable:
      'このビルドにはオフライン Hangul エディターが設定されていません。オフライン動作を保つため、公開エディター CDN は無効です。',
    loadFailed: 'ドキュメントを開けませんでした：{error}',
    poweredBy: 'HWP/HWPX 編集は rhwp（MIT）',
  },
  ko: {
    save: '저장',
    saving: '저장 중…',
    saved: '저장됨',
    saveFailed: '저장 실패: {error}',
    resolvingStudio: '한글 편집기를 준비하는 중…',
    offlineUnavailable:
      '이 빌드에는 오프라인 한글 편집기가 구성되어 있지 않습니다. 오프라인 상태를 유지하기 위해 공개 편집기 CDN은 사용하지 않습니다.',
    loadFailed: '문서를 열 수 없습니다: {error}',
    poweredBy: 'HWP/HWPX 편집: rhwp (MIT)',
  },
  fr: {
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    saveFailed: "Échec de l'enregistrement : {error}",
    resolvingStudio: "Préparation de l'éditeur Hangul…",
    offlineUnavailable:
      "L'éditeur Hangul hors ligne n'est pas configuré dans cette version. Le CDN public de l'éditeur est désactivé pour rester hors ligne.",
    loadFailed: "Impossible d'ouvrir le document : {error}",
    poweredBy: 'Édition HWP/HWPX par rhwp (MIT)',
  },
  de: {
    save: 'Speichern',
    saving: 'Wird gespeichert…',
    saved: 'Gespeichert',
    saveFailed: 'Speichern fehlgeschlagen: {error}',
    resolvingStudio: 'Hangul-Editor wird vorbereitet…',
    offlineUnavailable:
      'Der Offline-Hangul-Editor ist in diesem Build nicht konfiguriert. Das öffentliche Editor-CDN ist deaktiviert, um die App offline zu halten.',
    loadFailed: 'Dokument konnte nicht geöffnet werden: {error}',
    poweredBy: 'HWP/HWPX-Bearbeitung durch rhwp (MIT)',
  },
  es: {
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado',
    saveFailed: 'Error al guardar: {error}',
    resolvingStudio: 'Preparando el editor Hangul…',
    offlineUnavailable:
      'El editor Hangul sin conexión no está configurado en esta versión. El CDN público del editor está desactivado para mantener la app sin conexión.',
    loadFailed: 'No se pudo abrir el documento: {error}',
    poweredBy: 'Edición HWP/HWPX por rhwp (MIT)',
  },
  th: {
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
    saved: 'บันทึกแล้ว',
    saveFailed: 'บันทึกไม่สำเร็จ: {error}',
    resolvingStudio: 'กำลังเตรียมตัวแก้ไข Hangul…',
    offlineUnavailable:
      'บิลด์นี้ยังไม่ได้ตั้งค่าตัวแก้ไข Hangul แบบออฟไลน์ CDN ตัวแก้ไขสาธารณะถูกปิดเพื่อให้แอปทำงานแบบออฟไลน์',
    loadFailed: 'ไม่สามารถเปิดเอกสารได้: {error}',
    poweredBy: 'แก้ไข HWP/HWPX โดย rhwp (MIT)',
  },
  id: {
    save: 'Simpan',
    saving: 'Menyimpan…',
    saved: 'Tersimpan',
    saveFailed: 'Gagal menyimpan: {error}',
    resolvingStudio: 'Menyiapkan editor Hangul…',
    offlineUnavailable:
      'Editor Hangul luring tidak dikonfigurasi pada build ini. CDN editor publik dinonaktifkan agar aplikasi tetap luring.',
    loadFailed: 'Tidak dapat membuka dokumen: {error}',
    poweredBy: 'Penyuntingan HWP/HWPX oleh rhwp (MIT)',
  },
  ru: {
    save: 'Сохранить',
    saving: 'Сохранение…',
    saved: 'Сохранено',
    saveFailed: 'Не удалось сохранить: {error}',
    resolvingStudio: 'Подготовка редактора Hangul…',
    offlineUnavailable:
      'Автономный редактор Hangul не настроен в этой сборке. Публичный CDN редактора отключён, чтобы приложение оставалось автономным.',
    loadFailed: 'Не удалось открыть документ: {error}',
    poweredBy: 'Редактирование HWP/HWPX через rhwp (MIT)',
  },
  ar: {
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ',
    saveFailed: 'فشل الحفظ: {error}',
    resolvingStudio: 'يتم تحضير محرر Hangul…',
    offlineUnavailable:
      'لم يتم تكوين محرر Hangul دون اتصال في هذا الإصدار. تم تعطيل شبكة CDN العامة للمحرر للحفاظ على عمل التطبيق دون اتصال.',
    loadFailed: 'تعذّر فتح المستند: {error}',
    poweredBy: 'تحرير HWP/HWPX بواسطة rhwp (MIT)',
  },
  pt: {
    save: 'Salvar',
    saving: 'Salvando…',
    saved: 'Salvo',
    saveFailed: 'Falha ao salvar: {error}',
    resolvingStudio: 'Preparando o editor Hangul…',
    offlineUnavailable:
      'O editor Hangul offline não está configurado nesta versão. O CDN público do editor está desativado para manter o app offline.',
    loadFailed: 'Não foi possível abrir o documento: {error}',
    poweredBy: 'Edição HWP/HWPX pelo rhwp (MIT)',
  },
  it: {
    save: 'Salva',
    saving: 'Salvataggio…',
    saved: 'Salvato',
    saveFailed: 'Salvataggio non riuscito: {error}',
    resolvingStudio: "Preparazione dell'editor Hangul…",
    offlineUnavailable:
      "L'editor Hangul offline non è configurato in questa build. Il CDN pubblico dell'editor è disattivato per mantenere l'app offline.",
    loadFailed: 'Impossibile aprire il documento: {error}',
    poweredBy: 'Modifica HWP/HWPX tramite rhwp (MIT)',
  },
  pl: {
    save: 'Zapisz',
    saving: 'Zapisywanie…',
    saved: 'Zapisano',
    saveFailed: 'Zapis nie powiódł się: {error}',
    resolvingStudio: 'Przygotowywanie edytora Hangul…',
    offlineUnavailable:
      'Edytor Hangul offline nie jest skonfigurowany w tej kompilacji. Publiczny CDN edytora jest wyłączony, aby aplikacja działała offline.',
    loadFailed: 'Nie można otworzyć dokumentu: {error}',
    poweredBy: 'Edycja HWP/HWPX przez rhwp (MIT)',
  },
  nl: {
    save: 'Opslaan',
    saving: 'Opslaan…',
    saved: 'Opgeslagen',
    saveFailed: 'Opslaan mislukt: {error}',
    resolvingStudio: 'Hangul-editor wordt voorbereid…',
    offlineUnavailable:
      'De offline Hangul-editor is niet geconfigureerd in deze build. De openbare editor-CDN is uitgeschakeld om de app offline te houden.',
    loadFailed: 'Kan het document niet openen: {error}',
    poweredBy: 'HWP/HWPX-bewerking door rhwp (MIT)',
  },
  ms: {
    save: 'Simpan',
    saving: 'Menyimpan…',
    saved: 'Disimpan',
    saveFailed: 'Gagal menyimpan: {error}',
    resolvingStudio: 'Menyediakan editor Hangul…',
    offlineUnavailable:
      'Editor Hangul luar talian tidak dikonfigurasikan dalam binaan ini. CDN editor awam dilumpuhkan supaya aplikasi kekal luar talian.',
    loadFailed: 'Tidak dapat membuka dokumen: {error}',
    poweredBy: 'Penyuntingan HWP/HWPX oleh rhwp (MIT)',
  },
  he: {
    save: 'שמירה',
    saving: 'שומר…',
    saved: 'נשמר',
    saveFailed: 'השמירה נכשלה: {error}',
    resolvingStudio: 'מכין את עורך ה-Hangul…',
    offlineUnavailable:
      'עורך ה-Hangul הלא מקוון אינו מוגדר בגרסה זו. רשת ה-CDN הציבורית של העורך מושבתת כדי לשמור על היישום במצב לא מקוון.',
    loadFailed: 'לא ניתן לפתוח את המסמך: {error}',
    poweredBy: 'עריכת HWP/HWPX באמצעות rhwp (MIT)',
  },
  hi: {
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'सहेजा गया',
    saveFailed: 'सहेजना विफल: {error}',
    resolvingStudio: 'Hangul संपादक तैयार किया जा रहा है…',
    offlineUnavailable:
      'इस बिल्ड में ऑफ़लाइन Hangul संपादक कॉन्फ़िगर नहीं है। ऐप को ऑफ़लाइन रखने के लिए सार्वजनिक संपादक CDN अक्षम है।',
    loadFailed: 'दस्तावेज़ नहीं खोला जा सका: {error}',
    poweredBy: 'HWP/HWPX संपादन rhwp द्वारा (MIT)',
  },
  'zh-TW': {
    save: '儲存',
    saving: '正在儲存…',
    saved: '已儲存',
    saveFailed: '儲存失敗：{error}',
    resolvingStudio: '正在準備 Hangul 編輯器…',
    offlineUnavailable: '此版本未設定離線 Hangul 編輯器。為維持離線運行，公用編輯器 CDN 已停用。',
    loadFailed: '無法開啟文件：{error}',
    poweredBy: '由 rhwp 提供 HWP/HWPX 編輯（MIT）',
  },
} as const
