# KISS Translator

[English](README.en.md) | [中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

[![GitHub Release](https://img.shields.io/github/v/release/fishjar/kiss-translator?color=blue)](https://github.com/fishjar/kiss-translator/releases)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-green.svg)](https://github.com/fishjar/kiss-translator/blob/master/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/fishjar/kiss-translator/pulls)

A simple, open-source [bilingual translation extension & userscript](https://github.com/fishjar/kiss-translator).

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## Thanks to the following sponsors for supporting this project

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/8c5f141d-9d13-46b0-832f-f6884db4e5d5" width="600" /></td>
    <td>
      <a href="https://go.apimart.ai/gh-gotranslatorrr" target="_blank">
        <b>APIMart</b> is a low-cost API platform for AI image & video generation — GPT-Image-2 from $0.006/image, 160+ images per dollar. One async API covers both image and video: submit a task, get an ID, fetch results via polling or callback. Batch tens of thousands of images without timeouts, switch models without changing code. Pay-as-you-go with no monthly fee — sign up here to get started.
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="https://platform.ephone.ai/logo-e.png" width="96" /></td>
    <td>
      <a href="https://platform.ephone.ai/" target="_blank">
        <b>ePhone AI</b> is an AI model API relay and aggregation platform for developers, supporting multiple large models such as OpenAI, Claude, Gemini, DeepSeek, and GLM.
      </a>
    </td>
  </tr>
</table>

## Features

> **Note**: This README describes the current development branch. New features (provider plugins, Local AI, file translation, and automatic clipboard translation) are currently available in the Chrome/Edge and Firefox extension builds; userscripts and other clients do not yet include these entry points. Specific AI capabilities also depend on your browser, hardware device, and selected model.

### Translation Scenarios & Interactions

- **Multi-scenario coverage**: Bilingual webpage translation, instant input-field translation, selection word lookup, and mouse-hover translation. Fully supports rich text styling, custom translation styles, and a "show translation only (hide original)" mode.
- **Lookup & comparison panels**: Floating popup and standalone comparison window to contrast multiple translation services side by side, look up English words with built-in/Collins dictionaries, save vocabulary to word lists, and optionally enable automatic clipboard translation.
- **YouTube bilingual subtitles**: Merges subtitle segments intelligently with AI semantic sentence segmentation; offers customizable subtitle styles, full subtitle transcript view, hover word lookup, vocabulary saving, and AI video summaries based on subtitles.

### Service Configuration & Provider Plugins

- **Extensive built-in services**: Supports major traditional and AI translation services, including Google, Microsoft, Baidu, Tencent, Volcengine, DeepL/DeepLX, OpenAI, Gemini, Claude, Ollama, DeepSeek, OpenRouter, OrcaRouter, Requesty, Runcrate, AzureAI, and CloudflareAI, plus browser built-in AI and Local AI.
- **Select by capability**: Independently configure services and model parameters for text translation, dictionary lookup, subtitle segmentation, OCR recognition, or speech synthesis; supports batch aggregation, streaming responses, multi-turn conversation memory, AI glossaries, and reasoning settings based on model capabilities.
- **Provider plugin ecosystem**: Browse separate official and external plugin lists and click to install online, or import ZIP archives, local folders, GitHub repository root URLs, or HTTPS links. Requests are restricted to declared network scopes; package updates and saved instance upgrades are manual.
- **Open custom protocols**: Connect any non-standard API via plugins. See the [plugin development guide (Chinese)](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md), [OpenAI-compatible plugin](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md), and [DeepSeek plugin](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md).

### Local AI (Edge Computing)

- **End-to-end multimodal on-device AI**: Built-in Model Center to download, delete, and choose device backends (GPU/CPU); includes standalone test pages for LLM text generation, VLM image understanding, OCR recognition, ASR transcription, TTS synthesis, JEV decisions, and document layout analysis.
- **Task control & caching**: Monitor runtime status and logs in real time, abort inference tasks on demand, and unload models from memory/VRAM; caches text and structured results (binary audio/images are not cached).
- **Privacy & offline inference**: Once models are downloaded, all inference runs entirely on your local machine to protect data privacy; cloud services continue to make standard API requests. (Availability, speed, and memory consumption depend on hardware and model size).

### File Translation

- **Multi-format support with separated pipelines**: Supports TXT, Markdown, PDF, EPUB ebooks, and PNG/JPEG/WebP images; independently assign dedicated services for translation, OCR recognition, layout analysis, and table/formula parsing.
- **In-depth PDF parsing**: Inspect original pages, detect layout structures, recognize text, parse tables and math formulas, perform staged translation, and cache results; export as Markdown, standalone HTML, or Markdown + assets ZIP (does not restore original PDF layout, does not export PDF).
- **EPUB ebook translation**: Chapter-by-chapter reading and translation, whole-book batch translation, and adjustable reader styles; export bilingual EPUB, translated EPUB, or single-chapter HTML.
- **Plain text & image translation**: Download bilingual or translated TXT; export translated Markdown/HTML; recognize text in images, translate selected regions, and download translated PNG images.

### Rules, Settings & Synchronization

- **Smart & custom rules**: Automatically scans page content; visual element picker with draft editing, undo/redo, and highlighted translation range previews; rule subscriptions, sharing, and personal specialized glossaries.
- **Settings & testing suites**: Global search in settings, prompt template management, service connectivity testing, glossary tests, and subtitle segmentation debugger.
- **Multi-device sync**: Full configuration sync across devices via [KISS-Worker](https://github.com/fishjar/kiss-worker) (deployable on Cloudflare Workers or Docker) or standard WebDAV.
- **Customizable global shortcuts**:
  - `Alt+Q`: Toggle webpage translation
  - `Alt+D`: Open standalone translation window
  - `Alt+K`: Open settings popup
  - `Alt+S`: Open translation panel / translate selected text
  - `Alt+O`: Open full settings page
  - `Alt+I`: Translate current input field

## Quick Start

### Basic Usage (3-Step Quick Start)

1. **Add a translation service**: Go to **Service configuration** in settings, add a built-in service, enter the API endpoint, API key, and model name, then test and save.
2. **Assign services to scenarios**: Under scenario settings (webpage, word lookup, input field, or subtitles), select your configured service (only services supporting the required capability appear); optionally customize templates in **Prompt management**.
3. **Start translating**: Click the floating webpage icon or press `Alt+Q` to translate; use `Alt+D` to compare multiple translation services side by side.

### Advanced Usage

- **Using provider plugins**: In **Provider plugins**, import a plugin from a ZIP, folder, or GitHub/HTTPS link, review and authorize permissions; then go to **Service configuration → Add → External plugin** to create and configure a service instance. (Note: Authorization is local to each device and must be granted again after syncing to a new device).
- **Enabling Local AI**: Open **Local AI**, verify your device environment (WebGPU/WASM), download the required model in **Model Center**, test it on the task page, then add the local service in **Service configuration** and assign it to your desired scenario.
- **Translating files**: Open **File translation**, upload your file, set the source and target languages, configure recognition and translation services, and begin processing. PDFs support step-by-step layout recognition and translation, and EPUBs support chapter or whole-book translation. Export in your desired format once complete.

## Install

> **Browser extensions are strongly recommended**:
>
> - Browser extensions provide complete features (local language recognition, standalone windows, file translation, Local AI, context menu, etc.).
> - Userscripts are restricted by browser sandboxing, lack extension-only APIs, and may face cross-origin or script manager compatibility issues.

### Browser Extensions

- **Chrome**: [Chrome Web Store](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=en) (Kiwi on Android, Orion on iOS)
- **Edge**: [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=en)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/kiss-translator/)
- **Thunderbird**: [GitHub Releases (.xpi)](https://github.com/fishjar/kiss-translator/releases)
- **Safari**: Not yet supported (Mac / iOS planned)

### Userscripts

- **Desktop (Chrome / Edge / Firefox)**: Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/), then click to install:
  - [Direct Install Script (GitHub Pages)](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
  - [Greasy Fork Page](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
- **iOS Safari**: Install the [Userscripts Safari](https://github.com/quoid/userscripts) extension, then click to install:
  - [Direct Install iOS Script](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## Associated Projects

- **[kiss-translator-plugins](https://github.com/fishjar/kiss-translator-plugins)**: Official provider plugin repository, offering plugins for popular AI/translation services, templates, and plugin development guidelines.
- **[KISS-Worker](https://github.com/fishjar/kiss-worker)**: Self-hosted data synchronization service supporting Cloudflare Workers serverless deployment or Docker self-hosting, ensuring data privacy and custom rule sharing.
- **[kiss-rules](https://github.com/fishjar/kiss-rules)**: Community-maintained rule repository providing up-to-date website adaptation rules and a place to ask rule-related questions.

## Frequently Asked Questions

### How do I configure custom keyboard shortcuts?

Due to browser shortcut management limitations, shortcuts must be configured on your browser's extension management page:

- **Chrome / Edge**: Navigate to `chrome://extensions/shortcuts`
- **Firefox**: Navigate to `about:addons`, click the gear icon in the top right corner, and select "Manage Extension Shortcuts"

### What is the priority order of translation rules?

Rules take effect according to the following hierarchy:
**Personal rules > Subscribed rules > Global rules** (global rules serve as baseline defaults).

### How do I visually edit rules on a webpage?

1. Open the webpage translation panel, click **Edit website rules**, and choose a rule purpose (e.g. translation target, exclusion, preserve original, etc.).
2. Click target elements on the page or enter CSS selectors manually. Adjust ancestor depth, compare selector candidates, and preview matched element counts in real time.
3. **Draft mechanism**: Edits, deletions, and undo/redo only modify a temporary draft; changes are written and synced only after clicking **Save rules**. The **Estimated translation range** highlights loaded DOM nodes without sending requests to translation services.
4. **Inheritance & resetting**: **Restore group inheritance** reverts to subscribed or global rules; **Clear group** sets an explicit empty selector (clearing the root container stops page scanning).
5. _Note: Visual selection currently supports desktop standard DOM pages and does not cover nested iframes, Shadow DOM interiors, Canvas-rendered text, or touch gestures._

### What should I do if a service test fails?

- **Verify connection info**: Double-check the protocol, API endpoint URL, API key, and model name. If the service or model does not support batch requests or streaming, turn those options off.
- **Ollama local service**: The built-in Ollama adapter uses the OpenAI-compatible endpoint (ensure the path is correct, not the native `/api/chat` protocol); ensure the service is running and configure CORS (e.g. set environment variable `OLLAMA_ORIGINS=*`), see [Ollama connection troubleshooting #174](https://github.com/fishjar/kiss-translator/issues/174).
- **External plugin services**: Grant permission in the **Provider plugins** page before testing. To modify protocols or payloads, adjust the plugin declarative rules or source code and upgrade the service instance.

### Why can't I find Local AI, File Translation, or Provider Plugins in settings?

- These advanced feature entries are currently only provided in desktop Chrome/Edge and Firefox extension builds.
- Store releases may not yet include the latest features from the development branch due to review cycles.
- On some devices, if the browser lacks required features (e.g. WebGPU support) or local models have not been downloaded, related actions may be disabled or unready.

### How do userscripts access external services and open settings?

- **Cross-origin permissions**: When a userscript sends network requests, you must grant permission for the target domain in your userscript manager prompt.
- **Feature differences**: Provider plugins and Local AI are currently exclusive to browser extensions and are not supported in userscripts.
- **Settings page**: You can directly access the online [Userscript settings page](https://fishjar.github.io/kiss-translator/options.html).

## Future Plans

This is a side project with no strict timeline. Community contributions and pull requests are warmly welcomed!

- [x] **Batch Text Requests**: Optimize request strategy to reduce translation API calls and improve performance.
- [x] **Enhanced Rich Text Translation**: Support accurate translation of complex page structures and rich text formatting.
- [x] **Advanced Custom/AI Interfaces**: Support streaming, context memory, multi-turn conversations, and other advanced AI features.
- [x] **Fallback English Dictionary**: Fall back to built-in/local dictionary lookup when translation services are unavailable.
- [x] **Improved YouTube Subtitle Support**: Enhance streaming subtitle merging and translation experience, reducing sentence fragmentation.
- [x] **Edge AI Computing Support**: Local lightweight LLM, VLM, ASR, OCR, TTS, JEV, and layout analysis to assist translation.
- [x] **Document & Image Translation**: Support TXT, Markdown, PDF, EPUB, and PNG/JPEG/WebP image translation.
- [ ] **Distributed Sharing Platform**: Introduce a distributed sharing mechanism to share subtitles, rules, and resources.
- [ ] **Translation Agent**: In-house intelligent translation agent with deep linguistic context understanding and decision making.
- [ ] **Modern Project Architecture**: Reorganize modules and refactor the codebase with a modern tech stack.

If you are interested in any of these directions, feel free to discuss in [Issues](https://github.com/fishjar/kiss-translator/issues) or submit a PR!

## Development Guidelines

### Local Build & Debugging

**Prerequisites**: Node.js >= 20 (Node 22/24 recommended), pnpm >= 9

```sh
# 1. Clone the repository and switch to the dev branch
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev # Submitting PRs to the dev branch is recommended

# 2. Install dependencies
pnpm install

# 3. Common development and build commands
pnpm build:chrome      # Build Chrome/Edge extension (output: build/chrome)
pnpm build:firefox     # Build Firefox extension (output: build/firefox)
pnpm start             # Start local Web dev server (http://localhost:3000)
pnpm check:pr          # Code formatting and build check before submitting a PR
pnpm build             # Full build for all target platforms
```

### Loading the Extension in Your Browser (Chrome / Edge)

1. Open your browser and navigate to `chrome://extensions` (or `edge://extensions` for Edge).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `build/chrome` directory from the project root.
4. After making code changes, re-run `pnpm build:chrome` and click the reload icon on the extension card.

For plugin development, please read the [Plugin Development Guide (Chinese)](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md) and refer to the [OpenAI-compatible plugin](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md) or [DeepSeek plugin](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md).

### External Trigger Example

Webpage scripts can control the translator by dispatching custom events:

```js
// `toggle_translate`   Toggle webpage translation
// `toggle_styles`      Toggle translation styles
// `toggle_popup`       Open/close control panel
// `toggle_transbox`    Open/close standalone translation popup
// `toggle_hover_node`  Translate hovered paragraph
// `input_translate`    Translate current input field
window.dispatchEvent(
  new CustomEvent("kiss_translator", { detail: { action: "toggle_translate" } })
);
```

## Community

- Join our [Telegram Group](https://t.me/+RRCu_4oNwrM2NmFl)

## Appreciation

If you find KISS Translator helpful, donations and sponsorship are warmly appreciated to support continuous maintenance!

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
