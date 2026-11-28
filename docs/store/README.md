# 插件市场多语言介绍文案（Store Listings）

本目录维护 **Chrome Web Store**、**Microsoft Edge Add-ons** 与 **Firefox Add-ons (AMO)** 的 11 种语言商店介绍文案，与 `public/_locales/` 保持 1:1 严格对齐。

每个 `<locale>.txt` 文件均为**零 Markdown 的纯文本正文**，可直接全选复制并粘贴到各插件市场后台的「详细描述（Detailed Description）」输入框中。

## 平台限制与审核规范

| 平台                       | 简短描述上限 | 详细描述上限       | 格式要求                        | 审核红线                                               |
| :------------------------- | :----------- | :----------------- | :------------------------------ | :----------------------------------------------------- |
| **Chrome Web Store**       | 132 字符     | 16,000 字符        | 纯文本（不渲染 Markdown）       | 禁止文末关键词堆砌（Keyword Stuffing）、禁止蹭竞品名称 |
| **Microsoft Edge Add-ons** | 132 字符     | 10,000 字符        | 纯文本（支持换行与 `•` 列表符） | 长度上限最严格（≤ 10,000 字符）                        |
| **Firefox Add-ons (AMO)**  | 250 字符     | 建议 ≤ 10,000 字符 | 纯文本通用性最佳                | 避免未声明功能的夸大宣传                               |

## 维护原则

- **自然语义**：在首段前两句自然融入该语言核心搜索词（双语对照翻译、网页翻译、YouTube 双语字幕、PDF/EPUB/图片翻译、AI 翻译、本地离线 AI、开源免费），不单独附带标签云或关键词列表。
- **零 Markdown 约束**：`.txt` 文件严禁包含 `#`、`**`、`[text](url)`、`` ` ``、` ``` ` 等 Markdown 标记。
- **与代码保持一致**：新增核心能力或调整默认快捷键时，同步更新对应 `.txt`、下表简短描述以及 `public/_locales/*/messages.json` 中的 `app_description`。

## 11 语种文案索引与简短描述（严格 ≤ 132 字符）

| 语言代码 | 语言       | 详细描述（纯文本）     | 简短描述（Short Description，≤ 132 字符）                                                                                 |
| :------- | :--------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `zh_CN`  | 简体中文   | [zh_CN.txt](zh_CN.txt) | 开源双语对照翻译扩展，支持网页、YouTube双语字幕、划词、图片截图、PDF/EPUB文档及本地离线AI翻译。                           |
| `zh_TW`  | 繁體中文   | [zh_TW.txt](zh_TW.txt) | 開源雙語對照翻譯擴充功能，支援網頁、YouTube雙語字幕、劃詞、圖片截圖、PDF/EPUB文件及本機離線AI翻譯。                       |
| `en`     | English    | [en.txt](en.txt)       | Open-source bilingual translator for webpages, YouTube subtitles, PDF/EPUB, screenshots, and offline Local AI.            |
| `ja`     | 日本語     | [ja.txt](ja.txt)       | ウェブ対訳、YouTube対訳字幕、選択辞書、画像・スクショ、PDF/EPUB、ローカルAI対応のオープンソース翻訳拡張。                 |
| `ko`     | 한국어     | [ko.txt](ko.txt)       | 웹페이지, YouTube 이중 자막, 선택 단어, 이미지·스크린샷, PDF/EPUB, 로컬 AI를 지원하는 오픈소스 번역 확장.                 |
| `de`     | Deutsch    | [de.txt](de.txt)       | Open-Source-Übersetzer für Webseiten, YouTube-Untertitel, PDF/EPUB, Screenshots und lokale Offline-KI.                    |
| `es`     | Español    | [es.txt](es.txt)       | Traductor bilingüe open source para webs, subtítulos de YouTube, PDF/EPUB, capturas e IA local sin conexión.              |
| `fr`     | Français   | [fr.txt](fr.txt)       | Traducteur bilingue open source pour pages web, sous-titres YouTube, PDF/EPUB, captures et IA locale hors ligne.          |
| `ru`     | Русский    | [ru.txt](ru.txt)       | Открытый двуязычный переводчик веб-страниц, субтитров YouTube, PDF/EPUB, скриншотов и локального ИИ.                      |
| `tr`     | Türkçe     | [tr.txt](tr.txt)       | Web sayfaları, YouTube altyazıları, PDF/EPUB, ekran görüntüsü ve çevrimdışı yerel yapay zeka için açık kaynaklı çevirmen. |
| `vi`     | Tiếng Việt | [vi.txt](vi.txt)       | Tiện ích dịch song ngữ mã nguồn mở cho web, phụ đề YouTube, PDF/EPUB, ảnh chụp màn hình và AI cục bộ ngoại tuyến.         |
