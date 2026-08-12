export const LANG_STORAGE_KEY = "kiss-homepage-lang";
export const THEME_STORAGE_KEY = "kiss-homepage-theme";

export const languageOptions = [
  { value: "en", label: "English" },
  { value: "zh_CN", label: "简体中文" },
  { value: "zh_TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "ru", label: "Русский" },
];

const storeLocales = {
  en: { chromium: "en", firefox: "en-US" },
  zh_CN: { chromium: "zh-CN", firefox: "zh-CN" },
  zh_TW: { chromium: "zh-TW", firefox: "zh-TW" },
  ja: { chromium: "ja", firefox: "ja" },
  ko: { chromium: "ko", firefox: "ko" },
  fr: { chromium: "fr", firefox: "fr" },
  de: { chromium: "de", firefox: "de" },
  es: { chromium: "es", firefox: "es" },
  vi: { chromium: "vi", firefox: "vi" },
  ru: { chromium: "ru", firefox: "ru" },
};

const createInstalls = (language, meta = {}) => {
  const locales = storeLocales[language] || storeLocales.en;

  return [
    {
      name: "Chrome",
      meta: meta.extension || "Browser extension",
      href: `https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=${locales.chromium}`,
    },
    {
      name: "Edge",
      meta: meta.extension || "Browser extension",
      href: `https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=${locales.chromium}`,
    },
    {
      name: "Firefox",
      meta: meta.extension || "Browser extension",
      href: `https://addons.mozilla.org/${locales.firefox}/firefox/addon/kiss-translator/`,
    },
    {
      name: "Thunderbird",
      meta: meta.release || "Release package",
      href: "https://github.com/fishjar/kiss-translator/releases",
    },
    {
      name: "Userscript",
      meta: "Tampermonkey / Violentmonkey",
      href: process.env.REACT_APP_USERSCRIPT_DOWNLOADURL,
    },
    {
      name: "iOS Safari",
      meta: "Userscripts Safari",
      href: process.env.REACT_APP_USERSCRIPT_IOS_DOWNLOADURL,
    },
  ];
};

const baseContent = {
  en: {
    navGithub: "GitHub",
    languageLabel: "Language",
    themeLight: "Switch to light mode",
    themeDark: "Switch to dark mode",
    version: "Version",
    eyebrow: "Open-source translation toolkit",
    title:
      "Minimalist. Open-source. An all-scenario geek-style translation tool.",
    subtitle:
      "KISS Translator brings page translation, selection lookup, input-box translation, and YouTube subtitles into one lightweight browser extension and userscript.",
    installExtension: "Install Extension",
    installUserscript: "Install Userscript",
    openOptions: "Open Script Settings",
    github: "GitHub",
    status: ["Extension", "Userscript", "AI APIs", "Rules", "Sync"],
    installTitle: "Install targets",
    installSubtitle: "Pick the client that fits your browser and workflow.",
    videoTitle: "See KISS Translator in action",
    videoSubtitle:
      "Watch these introductions to explore the main features and workflows.",
    videoLabel: "KISS Translator introduction video",
    featureTitle: "Translation workspace",
    featureSubtitle:
      "A compact dashboard for reading, selecting, writing, watching, and building with your preferred translation providers.",
    ecosystemTitle: "Built for control",
    ecosystemSubtitle:
      "Use hosted services, local models, custom API hooks, shared rules, and private sync without turning the project into a heavy platform.",
    features: [
      {
        title: "Webpage bilingual translation",
        body: "Translate page text while keeping the original content readable beside the result.",
      },
      {
        title: "Selection popup",
        body: "Open a compact translation box on any page, compare providers, use dictionary lookup, and save words.",
      },
      {
        title: "Input-box translation",
        body: "Translate what you are writing directly from input fields with shortcuts.",
      },
      {
        title: "Hover translation",
        body: "Translate the paragraph under your pointer without leaving the page.",
      },
      {
        title: "YouTube subtitles",
        body: "Translate subtitles bilingually with merging, sentence breaking, AI segmentation, and custom styling.",
      },
      {
        title: "Custom API hooks",
        body: "Connect traditional services, AI providers, local models, and custom endpoints with request and response hooks.",
      },
      {
        title: "Streaming results",
        body: "Show AI translation output as it arrives and keep context memory for better long-form translation.",
      },
      {
        title: "Rules and terminology",
        body: "Use automatic detection, manual site rules, subscriptions, shared rules, and custom terminology.",
      },
      {
        title: "Private sync",
        body: "Synchronize settings through WebDAV or self-hosted KISS-Worker while keeping data under your control.",
      },
    ],
    providers: [
      "OpenAI",
      "Gemini",
      "Claude",
      "Ollama",
      "DeepSeek",
      "OpenRouter",
      "DeepL",
      "Google",
      "Microsoft",
      "Tencent",
      "Volcengine",
      "BuiltinAI",
    ],
  },
};

const ecosystemProjects = {
  en: [
    {
      name: "kiss-worker",
      description:
        "Private data sync for KISS Translator, deployable to Cloudflare Workers or self-hosted with Docker.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "Collects and generates website compatibility subscription rules for KISS Translator.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  zh_CN: [
    {
      name: "kiss-worker",
      description:
        "KISS Translator 的私有数据同步服务，可部署到 Cloudflare Workers 或通过 Docker 自托管。",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description: "收录并生成 KISS Translator 的网页适配订阅规则。",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  zh_TW: [
    {
      name: "kiss-worker",
      description:
        "KISS Translator 的私有資料同步服務，可部署至 Cloudflare Workers 或透過 Docker 自行架設。",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description: "收錄並產生 KISS Translator 的網站相容性訂閱規則。",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  ja: [
    {
      name: "kiss-worker",
      description:
        "KISS Translator のプライベートデータ同期サービス。Cloudflare Workers または Docker でセルフホストできます。",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "KISS Translator 向けの Web サイト互換サブスクリプションルールを収集・生成します。",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  ko: [
    {
      name: "kiss-worker",
      description:
        "KISS Translator용 비공개 데이터 동기화 서비스로, Cloudflare Workers 또는 Docker에 직접 배포할 수 있습니다.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "KISS Translator의 웹사이트 호환 구독 규칙을 수집하고 생성합니다.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  fr: [
    {
      name: "kiss-worker",
      description:
        "Service privé de synchronisation pour KISS Translator, déployable sur Cloudflare Workers ou auto-hébergeable avec Docker.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "Collecte et génère des règles d'abonnement de compatibilité Web pour KISS Translator.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  de: [
    {
      name: "kiss-worker",
      description:
        "Privater Datensynchronisierungsdienst für KISS Translator, bereitstellbar auf Cloudflare Workers oder selbst gehostet mit Docker.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "Sammelt und erzeugt Website-Kompatibilitätsregeln für KISS Translator-Abonnements.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  es: [
    {
      name: "kiss-worker",
      description:
        "Servicio privado de sincronización para KISS Translator, desplegable en Cloudflare Workers o autoalojado con Docker.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "Recopila y genera reglas de suscripción de compatibilidad web para KISS Translator.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  vi: [
    {
      name: "kiss-worker",
      description:
        "Dịch vụ đồng bộ dữ liệu riêng tư cho KISS Translator, có thể triển khai trên Cloudflare Workers hoặc tự lưu trữ bằng Docker.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "Thu thập và tạo các quy tắc đăng ký tương thích trang web cho KISS Translator.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
  ru: [
    {
      name: "kiss-worker",
      description:
        "Сервис приватной синхронизации данных KISS Translator с развёртыванием в Cloudflare Workers или самостоятельным размещением через Docker.",
      href: "https://github.com/fishjar/kiss-worker",
    },
    {
      name: "kiss-rules",
      description:
        "Собирает и создаёт правила подписки для совместимости сайтов с KISS Translator.",
      href: "https://github.com/fishjar/kiss-rules",
    },
  ],
};

const translations = {
  zh_CN: {
    navGithub: "GitHub",
    languageLabel: "语言",
    themeLight: "切换到亮色模式",
    themeDark: "切换到暗色模式",
    version: "版本",
    eyebrow: "开源翻译工具箱",
    title: "简约。开源。全场景极客式翻译工具。",
    subtitle:
      "KISS Translator 将网页翻译、划词查询、输入框翻译和 YouTube 字幕整合到一个轻量的浏览器扩展与油猴脚本中。",
    installExtension: "安装扩展",
    installUserscript: "安装脚本",
    openOptions: "打开脚本设置",
    github: "GitHub",
    status: ["浏览器扩展", "油猴脚本", "AI 接口", "规则", "同步"],
    installTitle: "安装入口",
    installSubtitle: "选择适合你的浏览器和使用方式的客户端。",
    videoTitle: "视频介绍",
    videoSubtitle:
      "通过这些介绍视频了解 KISS Translator 的主要功能和使用方式。",
    videoLabel: "KISS Translator 介绍视频",
    featureTitle: "翻译工作台",
    featureSubtitle:
      "覆盖阅读、划词、写作、视频字幕和自定义接口的紧凑能力面板。",
    ecosystemTitle: "为可控而设计",
    ecosystemSubtitle:
      "你可以使用在线服务、本地模型、自定义 API Hook、共享规则和私有同步，而不必接受臃肿平台。",
    features: [
      {
        title: "网页双语翻译",
        body: "在保留原文可读性的同时显示译文，尽量不破坏页面结构。",
      },
      {
        title: "划词翻译",
        body: "在任意页面打开翻译框，对比多个服务，查询词典并收藏词汇。",
      },
      {
        title: "输入框翻译",
        body: "通过快捷键直接翻译输入框中的内容，适合写作与回复。",
      },
      {
        title: "悬停翻译",
        body: "鼠标停留在段落上即可翻译，不打断当前阅读。",
      },
      {
        title: "YouTube 字幕",
        body: "支持双语字幕、合并断句、AI 断句和自定义字幕样式。",
      },
      {
        title: "自定义 API Hook",
        body: "接入传统翻译、AI 服务、本地模型和任意自定义接口。",
      },
      {
        title: "流式翻译",
        body: "实时展示 AI 翻译结果，并可利用上下文记忆提升长文效果。",
      },
      {
        title: "规则与术语",
        body: "支持自动识别、站点规则、规则订阅、规则分享和专业术语。",
      },
      {
        title: "私有同步",
        body: "通过 WebDAV 或自部署 KISS-Worker 同步配置，数据自己掌控。",
      },
    ],
  },
  zh_TW: {
    navGithub: "GitHub",
    languageLabel: "語言",
    themeLight: "切換到亮色模式",
    themeDark: "切換到暗色模式",
    version: "版本",
    eyebrow: "開源翻譯工具箱",
    title: "簡約。開源。全場景極客式翻譯工具。",
    subtitle:
      "KISS Translator 將網頁翻譯、劃詞查詢、輸入框翻譯和 YouTube 字幕整合到輕量的瀏覽器擴充套件與使用者腳本中。",
    installExtension: "安裝擴充套件",
    installUserscript: "安裝腳本",
    openOptions: "開啟腳本設定",
    github: "GitHub",
    status: ["瀏覽器擴充", "使用者腳本", "AI 介面", "規則", "同步"],
    installTitle: "安裝入口",
    installSubtitle: "選擇適合你的瀏覽器與工作流程的用戶端。",
    videoTitle: "影片介紹",
    videoSubtitle:
      "透過這些介紹影片瞭解 KISS Translator 的主要功能與使用方式。",
    videoLabel: "KISS Translator 介紹影片",
    featureTitle: "翻譯工作台",
    featureSubtitle: "覆蓋閱讀、劃詞、寫作、影片字幕和自訂介面的緊湊能力面板。",
    ecosystemTitle: "為可控而設計",
    ecosystemSubtitle:
      "使用雲端服務、本地模型、自訂 API Hook、共享規則和私有同步，不必變成沉重平台。",
    features: [
      {
        title: "網頁雙語翻譯",
        body: "在保留原文可讀性的同時顯示譯文，盡量不破壞頁面結構。",
      },
      {
        title: "劃詞翻譯",
        body: "在任意頁面開啟翻譯框，比較多個服務，查詢詞典並收藏詞彙。",
      },
      {
        title: "輸入框翻譯",
        body: "透過快捷鍵直接翻譯輸入框內容，適合寫作與回覆。",
      },
      {
        title: "懸停翻譯",
        body: "游標停留在段落上即可翻譯，不打斷目前閱讀。",
      },
      {
        title: "YouTube 字幕",
        body: "支援雙語字幕、合併斷句、AI 斷句和自訂字幕樣式。",
      },
      {
        title: "自訂 API Hook",
        body: "接入傳統翻譯、AI 服務、本地模型和任意自訂介面。",
      },
      {
        title: "串流翻譯",
        body: "即時顯示 AI 翻譯結果，並可利用上下文記憶提升長文效果。",
      },
      {
        title: "規則與術語",
        body: "支援自動識別、站點規則、規則訂閱、規則分享和專業術語。",
      },
      {
        title: "私有同步",
        body: "透過 WebDAV 或自部署 KISS-Worker 同步設定，資料自己掌控。",
      },
    ],
  },
  ja: {
    navGithub: "GitHub",
    languageLabel: "言語",
    themeLight: "ライトモードに切り替え",
    themeDark: "ダークモードに切り替え",
    version: "Version",
    eyebrow: "オープンソース翻訳ツールキット",
    title: "ミニマル。オープンソース。全シーン対応のギークスタイル翻訳ツール。",
    subtitle:
      "KISS Translator はページ翻訳、選択テキスト翻訳、入力欄翻訳、YouTube 字幕翻訳を軽量な拡張機能とユーザースクリプトにまとめます。",
    installExtension: "拡張機能を入手",
    installUserscript: "スクリプトを入手",
    openOptions: "スクリプト設定を開く",
    github: "GitHub",
    status: ["拡張機能", "Userscript", "AI API", "ルール", "同期"],
    installTitle: "インストール先",
    installSubtitle: "ブラウザと使い方に合うクライアントを選べます。",
    videoTitle: "紹介動画",
    videoSubtitle:
      "紹介動画で KISS Translator の主な機能と使い方をご覧ください。",
    videoLabel: "KISS Translator 紹介動画",
    featureTitle: "翻訳ワークスペース",
    featureSubtitle:
      "読む、選ぶ、書く、見る、作るための翻訳機能をコンパクトにまとめました。",
    ecosystemTitle: "自分で制御できる設計",
    ecosystemSubtitle:
      "クラウドサービス、ローカルモデル、カスタム API Hook、共有ルール、プライベート同期を必要な分だけ使えます。",
    features: [
      {
        title: "Web ページ対訳翻訳",
        body: "原文の読みやすさを残しながら訳文を表示し、ページ構造をできるだけ保ちます。",
      },
      {
        title: "選択ポップアップ",
        body: "任意のページで翻訳ボックスを開き、複数サービスの比較、辞書検索、単語保存ができます。",
      },
      {
        title: "入力欄翻訳",
        body: "ショートカットで入力中の文章をその場で翻訳できます。",
      },
      {
        title: "ホバー翻訳",
        body: "ポインター下の段落を、読書の流れを止めずに翻訳します。",
      },
      {
        title: "YouTube 字幕",
        body: "対訳字幕、字幕結合、文分割、AI 分割、字幕スタイル調整に対応します。",
      },
      {
        title: "カスタム API Hook",
        body: "翻訳サービス、AI、ローカルモデル、任意のエンドポイントを接続できます。",
      },
      {
        title: "ストリーミング結果",
        body: "AI 翻訳を到着順に表示し、文脈メモリで長文翻訳を改善できます。",
      },
      {
        title: "ルールと用語",
        body: "自動検出、サイト別ルール、購読ルール、共有ルール、専門用語に対応します。",
      },
      {
        title: "プライベート同期",
        body: "WebDAV または自前の KISS-Worker で設定を同期し、データを管理できます。",
      },
    ],
  },
  ko: {
    navGithub: "GitHub",
    languageLabel: "언어",
    themeLight: "라이트 모드로 전환",
    themeDark: "다크 모드로 전환",
    version: "Version",
    eyebrow: "오픈 소스 번역 도구",
    title: "미니멀. 오픈 소스. 모든 상황을 위한 긱(Geek) 스타일 번역 도구.",
    subtitle:
      "KISS Translator는 웹페이지 번역, 선택 번역, 입력창 번역, YouTube 자막 번역을 가벼운 브라우저 확장과 유저스크립트로 제공합니다.",
    installExtension: "확장 설치",
    installUserscript: "스크립트 설치",
    openOptions: "스크립트 설정 열기",
    github: "GitHub",
    status: ["확장", "Userscript", "AI API", "규칙", "동기화"],
    installTitle: "설치 대상",
    installSubtitle: "브라우저와 작업 방식에 맞는 클라이언트를 선택하세요.",
    videoTitle: "소개 동영상",
    videoSubtitle:
      "소개 동영상에서 KISS Translator의 주요 기능과 사용 방법을 확인하세요.",
    videoLabel: "KISS Translator 소개 동영상",
    featureTitle: "번역 작업 공간",
    featureSubtitle:
      "읽기, 선택, 작성, 시청, 커스텀 API 구성을 위한 번역 기능을 한곳에 모았습니다.",
    ecosystemTitle: "제어 가능한 설계",
    ecosystemSubtitle:
      "클라우드 서비스, 로컬 모델, 커스텀 API Hook, 공유 규칙, 개인 동기화를 필요한 만큼 사용할 수 있습니다.",
    features: [
      {
        title: "웹페이지 이중 언어 번역",
        body: "원문을 읽기 좋게 유지하면서 번역문을 표시하고 페이지 구조를 최대한 보존합니다.",
      },
      {
        title: "선택 팝업",
        body: "어떤 페이지에서든 번역 박스를 열고 여러 서비스 비교, 사전 검색, 단어 저장을 할 수 있습니다.",
      },
      {
        title: "입력창 번역",
        body: "단축키로 입력 중인 텍스트를 바로 번역합니다.",
      },
      {
        title: "호버 번역",
        body: "마우스가 올라간 문단을 읽기 흐름을 끊지 않고 번역합니다.",
      },
      {
        title: "YouTube 자막",
        body: "이중 언어 자막, 병합, 문장 분리, AI 분할, 자막 스타일 조정을 지원합니다.",
      },
      {
        title: "커스텀 API Hook",
        body: "번역 서비스, AI 제공자, 로컬 모델, 임의의 엔드포인트를 연결합니다.",
      },
      {
        title: "스트리밍 결과",
        body: "AI 번역 결과를 도착하는 대로 보여주고 문맥 메모리로 긴 글 번역을 개선합니다.",
      },
      {
        title: "규칙과 용어",
        body: "자동 감지, 사이트 규칙, 구독 규칙, 공유 규칙, 전문 용어를 지원합니다.",
      },
      {
        title: "개인 동기화",
        body: "WebDAV 또는 자체 KISS-Worker로 설정을 동기화하고 데이터를 직접 관리합니다.",
      },
    ],
  },
  fr: {
    navGithub: "GitHub",
    languageLabel: "Langue",
    themeLight: "Passer au mode clair",
    themeDark: "Passer au mode sombre",
    version: "Version",
    eyebrow: "Boite a outils de traduction open source",
    title:
      "Minimaliste. Open source. Un outil de traduction style geek tout-terrain.",
    subtitle:
      "KISS Translator regroupe traduction de pages, selection de texte, champs de saisie et sous-titres YouTube dans une extension et un userscript legers.",
    installExtension: "Installer l'extension",
    installUserscript: "Installer le script",
    openOptions: "Ouvrir les paramètres du script",
    github: "GitHub",
    status: ["Extension", "Userscript", "API IA", "Regles", "Sync"],
    installTitle: "Cibles d'installation",
    installSubtitle:
      "Choisissez le client adapte a votre navigateur et a votre flux de travail.",
    videoTitle: "Vidéos de présentation",
    videoSubtitle:
      "Découvrez les principales fonctions et méthodes de travail de KISS Translator.",
    videoLabel: "Vidéo de présentation de KISS Translator",
    featureTitle: "Espace de traduction",
    featureSubtitle:
      "Un tableau de bord compact pour lire, selectionner, ecrire, regarder et brancher vos services de traduction.",
    ecosystemTitle: "Concu pour garder le controle",
    ecosystemSubtitle:
      "Services cloud, modeles locaux, hooks d'API, regles partagees et synchronisation privee sans plateforme lourde.",
    features: [
      {
        title: "Traduction bilingue de pages",
        body: "Affiche la traduction tout en gardant le texte original lisible et la structure de la page stable.",
      },
      {
        title: "Popup de selection",
        body: "Ouvrez une boite de traduction sur n'importe quelle page, comparez les services, consultez le dictionnaire et enregistrez des mots.",
      },
      {
        title: "Traduction des champs",
        body: "Traduisez directement le texte que vous saisissez avec des raccourcis.",
      },
      {
        title: "Traduction au survol",
        body: "Traduisez le paragraphe sous le pointeur sans quitter la page.",
      },
      {
        title: "Sous-titres YouTube",
        body: "Sous-titres bilingues avec fusion, decoupage de phrases, segmentation IA et styles personnalises.",
      },
      {
        title: "Hooks d'API personnalisee",
        body: "Connectez services classiques, IA, modeles locaux et endpoints personnalises.",
      },
      {
        title: "Resultats en streaming",
        body: "Affichez la traduction IA au fil de l'arrivee et utilisez la memoire de contexte pour les longs textes.",
      },
      {
        title: "Regles et terminologie",
        body: "Detection automatique, regles de site, abonnements, partage et glossaires personnalises.",
      },
      {
        title: "Synchronisation privee",
        body: "Synchronisez via WebDAV ou KISS-Worker auto-heberge en gardant vos donnees sous controle.",
      },
    ],
  },
  de: {
    navGithub: "GitHub",
    languageLabel: "Sprache",
    themeLight: "Zum hellen Modus wechseln",
    themeDark: "Zum dunklen Modus wechseln",
    version: "Version",
    eyebrow: "Open-Source-Ubersetzungswerkzeug",
    title:
      "Minimalistisch. Open-Source. Ein Allround-Geek-Style-Ubersetzungstool.",
    subtitle:
      "KISS Translator bundelt Seitenubersetzung, Auswahlubersetzung, Eingabefeld-Ubersetzung und YouTube-Untertitel in einer schlanken Erweiterung und einem Userscript.",
    installExtension: "Erweiterung installieren",
    installUserscript: "Script installieren",
    openOptions: "Skripteinstellungen öffnen",
    github: "GitHub",
    status: ["Erweiterung", "Userscript", "KI-APIs", "Regeln", "Sync"],
    installTitle: "Installationsziele",
    installSubtitle:
      "Wahlen Sie den Client fur Ihren Browser und Arbeitsablauf.",
    videoTitle: "Einführungsvideos",
    videoSubtitle:
      "Lernen Sie die wichtigsten Funktionen und Arbeitsabläufe von KISS Translator kennen.",
    videoLabel: "KISS Translator Einführungsvideo",
    featureTitle: "Ubersetzungsarbeitsplatz",
    featureSubtitle:
      "Ein kompaktes Dashboard zum Lesen, Auswahlen, Schreiben, Anschauen und Anbinden Ihrer Ubersetzungsdienste.",
    ecosystemTitle: "Fur Kontrolle gebaut",
    ecosystemSubtitle:
      "Cloud-Dienste, lokale Modelle, eigene API-Hooks, geteilte Regeln und private Synchronisierung ohne schwere Plattform.",
    features: [
      {
        title: "Zweisprachige Seitenubersetzung",
        body: "Zeigt Ubersetzungen an, wahrend Originaltext und Seitenstruktur lesbar bleiben.",
      },
      {
        title: "Auswahl-Popup",
        body: "Offnen Sie auf jeder Seite eine Ubersetzungsbox, vergleichen Sie Dienste, nutzen Sie Worterbuch und Wortliste.",
      },
      {
        title: "Eingabefeld-Ubersetzung",
        body: "Ubersetzen Sie Text direkt beim Schreiben per Tastenkurzel.",
      },
      {
        title: "Hover-Ubersetzung",
        body: "Ubersetzt den Absatz unter dem Mauszeiger, ohne den Lesefluss zu storen.",
      },
      {
        title: "YouTube-Untertitel",
        body: "Zweisprachige Untertitel mit Zusammenfuhrung, Satztrennung, KI-Segmentierung und eigenen Styles.",
      },
      {
        title: "Eigene API-Hooks",
        body: "Verbinden Sie klassische Dienste, KI-Anbieter, lokale Modelle und eigene Endpunkte.",
      },
      {
        title: "Streaming-Ergebnisse",
        body: "Zeigt KI-Ubersetzung live an und nutzt Kontextspeicher fur langere Texte.",
      },
      {
        title: "Regeln und Terminologie",
        body: "Automatische Erkennung, Site-Regeln, Abos, geteilte Regeln und eigene Fachbegriffe.",
      },
      {
        title: "Private Synchronisierung",
        body: "Synchronisieren Sie uber WebDAV oder selbst gehosteten KISS-Worker und behalten Sie die Datenkontrolle.",
      },
    ],
  },
  es: {
    navGithub: "GitHub",
    languageLabel: "Idioma",
    themeLight: "Cambiar a modo claro",
    themeDark: "Cambiar a modo oscuro",
    version: "Version",
    eyebrow: "Kit de traduccion de codigo abierto",
    title:
      "Minimalista. Codigo abierto. Una herramienta de traduccion estilo geek para cualquier situacion.",
    subtitle:
      "KISS Translator une traduccion de paginas, seleccion de texto, campos de entrada y subtitulos de YouTube en una extension y un userscript ligeros.",
    installExtension: "Instalar extension",
    installUserscript: "Instalar script",
    openOptions: "Abrir configuración del script",
    github: "GitHub",
    status: ["Extension", "Userscript", "APIs IA", "Reglas", "Sync"],
    installTitle: "Destinos de instalacion",
    installSubtitle:
      "Elige el cliente que encaje con tu navegador y flujo de trabajo.",
    videoTitle: "Vídeos de introducción",
    videoSubtitle:
      "Descubre las funciones y los flujos de trabajo principales de KISS Translator.",
    videoLabel: "Vídeo de introducción de KISS Translator",
    featureTitle: "Espacio de traduccion",
    featureSubtitle:
      "Un panel compacto para leer, seleccionar, escribir, ver videos y conectar tus proveedores de traduccion.",
    ecosystemTitle: "Hecho para mantener el control",
    ecosystemSubtitle:
      "Servicios en la nube, modelos locales, hooks de API, reglas compartidas y sincronizacion privada sin una plataforma pesada.",
    features: [
      {
        title: "Traduccion bilingue de paginas",
        body: "Muestra la traduccion manteniendo legible el texto original y estable la estructura de la pagina.",
      },
      {
        title: "Popup de seleccion",
        body: "Abre una caja de traduccion en cualquier pagina, compara servicios, usa diccionario y guarda palabras.",
      },
      {
        title: "Traduccion en campos",
        body: "Traduce lo que escribes directamente desde los campos de entrada con atajos.",
      },
      {
        title: "Traduccion al pasar el cursor",
        body: "Traduce el parrafo bajo el puntero sin salir de la pagina.",
      },
      {
        title: "Subtitulos de YouTube",
        body: "Subtitulos bilingues con fusion, corte de frases, segmentacion IA y estilos personalizados.",
      },
      {
        title: "Hooks de API personalizada",
        body: "Conecta servicios tradicionales, IA, modelos locales y endpoints personalizados.",
      },
      {
        title: "Resultados en streaming",
        body: "Muestra traduccion IA a medida que llega y usa memoria de contexto para textos largos.",
      },
      {
        title: "Reglas y terminologia",
        body: "Deteccion automatica, reglas por sitio, suscripciones, reglas compartidas y terminos propios.",
      },
      {
        title: "Sincronizacion privada",
        body: "Sincroniza con WebDAV o KISS-Worker autoalojado manteniendo tus datos bajo control.",
      },
    ],
  },
  vi: {
    navGithub: "GitHub",
    languageLabel: "Ngôn ngữ",
    themeLight: "Chuyển sang chế độ sáng",
    themeDark: "Chuyển sang chế độ tối",
    version: "Phiên bản",
    eyebrow: "Bộ công cụ dịch thuật mã nguồn mở",
    title:
      "Tối giản. Mã nguồn mở. Công cụ dịch thuật phong cách geek cho mọi tình huống.",
    subtitle:
      "KISS Translator kết hợp dịch trang web, tra cứu văn bản được chọn, dịch trong ô nhập và phụ đề YouTube vào một tiện ích trình duyệt cùng userscript gọn nhẹ.",
    installExtension: "Cài đặt tiện ích",
    installUserscript: "Cài đặt userscript",
    openOptions: "Mở cài đặt tập lệnh",
    github: "GitHub",
    status: ["Tiện ích", "Userscript", "API AI", "Quy tắc", "Đồng bộ"],
    installTitle: "Nơi cài đặt",
    installSubtitle:
      "Chọn ứng dụng phù hợp với trình duyệt và cách làm việc của bạn.",
    videoTitle: "Video giới thiệu",
    videoSubtitle:
      "Khám phá các tính năng và quy trình làm việc chính của KISS Translator qua các video này.",
    videoLabel: "Video giới thiệu KISS Translator",
    installMeta: {
      extension: "Tiện ích trình duyệt",
      release: "Gói phát hành",
    },
    featureTitle: "Không gian dịch thuật",
    featureSubtitle:
      "Bảng điều khiển gọn nhẹ để đọc, chọn, viết, xem video và kết nối các dịch vụ dịch thuật bạn ưa dùng.",
    ecosystemTitle: "Được thiết kế để bạn làm chủ",
    ecosystemSubtitle:
      "Sử dụng dịch vụ đám mây, mô hình cục bộ, hook API tùy chỉnh, quy tắc chia sẻ và đồng bộ riêng tư mà không cần một nền tảng cồng kềnh.",
    features: [
      {
        title: "Dịch trang web song ngữ",
        body: "Hiển thị bản dịch trong khi vẫn giữ văn bản gốc dễ đọc và cấu trúc trang ổn định.",
      },
      {
        title: "Cửa sổ dịch vùng chọn",
        body: "Mở hộp dịch trên mọi trang, so sánh dịch vụ, tra từ điển và lưu từ vựng.",
      },
      {
        title: "Dịch trong ô nhập",
        body: "Dịch trực tiếp nội dung bạn đang viết trong ô nhập bằng phím tắt.",
      },
      {
        title: "Dịch khi di chuột",
        body: "Dịch đoạn văn dưới con trỏ mà không rời khỏi trang.",
      },
      {
        title: "Phụ đề YouTube",
        body: "Phụ đề song ngữ với tính năng gộp, ngắt câu, phân đoạn bằng AI và kiểu hiển thị tùy chỉnh.",
      },
      {
        title: "Hook API tùy chỉnh",
        body: "Kết nối dịch vụ truyền thống, nhà cung cấp AI, mô hình cục bộ và endpoint tùy chỉnh.",
      },
      {
        title: "Kết quả dạng luồng",
        body: "Hiển thị bản dịch AI ngay khi nhận được và dùng bộ nhớ ngữ cảnh để cải thiện văn bản dài.",
      },
      {
        title: "Quy tắc và thuật ngữ",
        body: "Sử dụng nhận diện tự động, quy tắc trang, đăng ký, quy tắc chia sẻ và thuật ngữ tùy chỉnh.",
      },
      {
        title: "Đồng bộ riêng tư",
        body: "Đồng bộ cài đặt qua WebDAV hoặc KISS-Worker tự lưu trữ trong khi vẫn làm chủ dữ liệu.",
      },
    ],
  },
  ru: {
    navGithub: "GitHub",
    languageLabel: "Язык",
    themeLight: "Переключить на светлую тему",
    themeDark: "Переключить на тёмную тему",
    version: "Версия",
    eyebrow: "Инструменты перевода с открытым исходным кодом",
    title: "Минимализм. Открытый код. Переводчик в стиле гик для любых задач.",
    subtitle:
      "KISS Translator объединяет перевод веб-страниц, выделенного текста, полей ввода и субтитров YouTube в лёгком браузерном расширении и userscript.",
    installExtension: "Установить расширение",
    installUserscript: "Установить userscript",
    openOptions: "Открыть настройки скрипта",
    github: "GitHub",
    status: ["Расширение", "Userscript", "API ИИ", "Правила", "Синхронизация"],
    installTitle: "Варианты установки",
    installSubtitle:
      "Выберите клиент, подходящий для вашего браузера и рабочего процесса.",
    videoTitle: "Обзорные видео",
    videoSubtitle:
      "Познакомьтесь с основными функциями и сценариями работы KISS Translator.",
    videoLabel: "Обзорное видео KISS Translator",
    installMeta: {
      extension: "Расширение браузера",
      release: "Пакет выпуска",
    },
    featureTitle: "Рабочее пространство перевода",
    featureSubtitle:
      "Компактная панель для чтения, выделения, письма, просмотра видео и подключения предпочитаемых сервисов перевода.",
    ecosystemTitle: "Полный контроль",
    ecosystemSubtitle:
      "Используйте облачные сервисы, локальные модели, собственные API-хуки, общие правила и приватную синхронизацию без громоздкой платформы.",
    features: [
      {
        title: "Двуязычный перевод страниц",
        body: "Показывает перевод, сохраняя читаемость исходного текста и структуру страницы.",
      },
      {
        title: "Перевод выделенного текста",
        body: "Открывайте окно перевода на любой странице, сравнивайте сервисы, пользуйтесь словарём и сохраняйте слова.",
      },
      {
        title: "Перевод в полях ввода",
        body: "Переводите вводимый текст прямо в поле с помощью горячих клавиш.",
      },
      {
        title: "Перевод при наведении",
        body: "Переводите абзац под указателем, не покидая страницу.",
      },
      {
        title: "Субтитры YouTube",
        body: "Двуязычные субтитры с объединением, разбивкой предложений, ИИ-сегментацией и настраиваемыми стилями.",
      },
      {
        title: "Пользовательские API-хуки",
        body: "Подключайте традиционные сервисы, поставщиков ИИ, локальные модели и собственные конечные точки.",
      },
      {
        title: "Потоковые результаты",
        body: "Показывайте перевод ИИ по мере поступления и используйте память контекста для длинных текстов.",
      },
      {
        title: "Правила и терминология",
        body: "Используйте автоопределение, правила сайтов, подписки, общие правила и собственную терминологию.",
      },
      {
        title: "Приватная синхронизация",
        body: "Синхронизируйте настройки через WebDAV или собственный KISS-Worker, сохраняя контроль над данными.",
      },
    ],
  },
};

export const homepageContent = Object.fromEntries(
  languageOptions.map(({ value }) => [
    value,
    {
      ...baseContent.en,
      ...translations[value],
      installs: createInstalls(value, translations[value]?.installMeta),
      ecosystemProjects: ecosystemProjects[value] ?? ecosystemProjects.en,
      providers: translations[value]?.providers ?? baseContent.en.providers,
    },
  ])
);
