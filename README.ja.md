# KISS Translator シンプル翻訳

[English](README.en.md) | [中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

[![GitHub Release](https://img.shields.io/github/v/release/fishjar/kiss-translator?color=blue)](https://github.com/fishjar/kiss-translator/releases)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-green.svg)](https://github.com/fishjar/kiss-translator/blob/master/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/fishjar/kiss-translator/pulls)

シンプルでオープンソースの [バイリンガル対照翻訳拡張機能＆ユーザースクリプト](https://github.com/fishjar/kiss-translator)です。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 以下のスポンサー様のご支援に感謝いたします

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/8c5f141d-9d13-46b0-832f-f6884db4e5d5" width="600" /></td>
    <td>
      <a href="https://go.apimart.ai/gh-gotranslatorrr" target="_blank">
        <b>APIMart</b> はAI画像・動画生成に特化した低価格APIプラットフォームです。GPT-Image-2は1枚あたり$0.006から、1ドルで160枚以上の画像生成が可能です。画像・動画を統合した非同期APIを提供し、タスク送信でID取得、コールバックで結果取得。数万枚の一括処理でもタイムアウトせず、コードを変更せずにモデルを切り替えられます。従量課金制・月額料金なし。こちらの登録リンクからすぐにご利用いただけます。
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="https://platform.ephone.ai/logo-e.png" width="96" /></td>
    <td>
      <a href="https://platform.ephone.ai/" target="_blank">
        <b>ePhone AI</b> は開発者向けのAIモデルAPI中継・集約プラットフォームであり、OpenAI、Claude、Gemini、DeepSeek、GLMなど、複数の大規模モデルをサポートしています。
      </a>
    </td>
  </tr>
</table>

## 機能概要

> **注意**：この README は現在の開発ブランチのコードに対応しています。新機能（API プラグイン、ローカル AI、ファイル翻訳、クリップボード自動翻訳など）は現在 Chrome/Edge および Firefox 拡張機能版で提供されており、ユーザースクリプトやその他のクライアントには入口がありません。具体的な AI 機能はブラウザ、ハードウェア、選択したモデルにも依存します。

### 翻訳シーンと操作

- **多様な利用シーンに対応**：ウェブページの対訳表示、入力欄の即時翻訳、選択語句の検索、マウスホバー翻訳に対応。リッチテキストのレイアウト保持、カスタム訳文スタイル、さらに「訳文のみ表示（原文を非表示）」に対応しています。
- **検索と横断比較パネル**：翻訳ポップアップや独立した比較ウィンドウを提供。複数の翻訳サービスを横並びで比較したり、英英・英和辞書での単語検索、単語帳への登録、任意のクリップボード自動翻訳が利用可能です。
- **YouTube 対訳字幕**：インテリジェントな字幕結合アルゴリズムと AI による文脈区切りに対応。カスタム字幕スタイル、全文スクリプト一覧、ホバー辞書検索、単語帳保存、字幕に基づく AI 動画要約を提供します。

### サービス設定と API プラグイン

- **多彩な組み込みサービス**：Google、Microsoft、Baidu、Tencent、Volcengine、DeepL/DeepLX をはじめ、OpenAI、Gemini、Claude、Ollama、DeepSeek、OpenRouter、OrcaRouter、Requesty、AzureAI、CloudflareAI などの主要な AI 翻訳サービス、Chrome ブラウザ内蔵 AI、ローカル AI に対応。
- **能力に応じた柔軟な選択**：テキスト翻訳、辞書検索、字幕区切り、OCR 文字認識、音声合成などの機能ごとにサービスとモデルパラメータを個別に設定可能。一括バッチ翻訳、ストリーミング出力、コンテキスト対話記憶、AI 用語集、思考プロセス（Reasoning）設定をサポート。
- **API プラグインエコシステム**：公式・外部プラグインを別々のリストから選び、クリックしてオンラインでインストールできます。ZIP、ローカルフォルダ、GitHub リポジトリのルート URL、HTTPS リンクからの導入にも対応。通信先は宣言された範囲に制限され、手動更新と保存済みサービスインスタンスのアップグレードを提供します。
- **オープンなカスタムプロトコル**：非標準の API もプラグイン経由で柔軟に統合可能。詳細は [プラグイン開発ガイド（中国語）](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)、[OpenAI 互換プラグイン](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md)、[DeepSeek プラグイン](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md) を参照してください。

### ローカル AI（エッジコンピューティング）

- **端末完結型マルチモーダル AI**：内蔵のモデルセンターからモデルのダウンロード・削除、実行環境（GPU/CPU）の選択が可能。LLM 文章生成、VLM 画像理解、OCR 文字認識、ASR 音声認識、TTS 音声合成、JEV 判定、文書レイアウト解析の各機能テスト画面を搭載。
- **タスク制御とキャッシュ**：リアルタイムでの実行ステータスとログ確認、推論タスクの手動停止、メモリ/VRAM からのモデルアンロードに対応。テキストおよび構造化結果のキャッシュをサポート（バイナリ音声・画像は非対応）。
- **プライバシー保護と完全オフライン動作**：モデルダウンロード後はすべての推論がローカルマシン上で実行されるためプライバシーを保護。クラウドサービスは既存の通信を維持します。（利用可否、推論速度、メモリ消費量は端末とモデルサイズに依存します）。

### ファイル翻訳

- **マルチフォーマットと機能分担**：TXT、Markdown、PDF、EPUB 電子書籍、PNG/JPEG/WebP 画像に対応。各フェーズで専用の翻訳、OCR 認識、レイアウト解析、表・数式解析サービスを個別に指定可能。
- **PDF の高精度解析**：原文の閲覧、レイアウト構造の検出、文字認識、表・数式解析、段階的な翻訳と結果キャッシュに対応。Markdown、単一 HTML、またはリソースを含む ZIP で出力可能（PDF 原文のレイアウト再現や PDF 出力には非対応）。
- **EPUB 電子書籍翻訳**：章ごとの閲覧・翻訳、書籍全体のバッチ翻訳、読書スタイルのカスタマイズに対応。対訳 EPUB、翻訳版 EPUB、現在の章の HTML として出力可能。
- **テキストと画像翻訳**：TXT は対訳または翻訳テキストとして保存可能。Markdown は翻訳後 Markdown/HTML 出力に対応。画像は文字認識、領域指定翻訳、翻訳画像（PNG）のダウンロードに対応。

### ルール・設定・同期

- **スマート検出とカスタムルール**：ウェブページ内容の自動検出スキャンに対応。視覚的な要素セレクター、下書き編集、元に戻す/やり直し、翻訳範囲のハイライトプレビュー、ルール購読、共有、用語集管理を搭載。
- **設定管理とテストスイート**：設定のグローバル検索、システムプロンプトテンプレート管理、サービス接続テストツール、用語集および字幕区切りデバッグツールを提供。
- **マルチデバイスデータ同期**：[KISS-Worker](https://github.com/fishjar/kiss-worker)（Cloudflare Workers または Docker でセルフホスト可能）や標準の WebDAV プロトコルを介して、全設定を端末間で同期可能。
- **カスタムグローバルショートカット**：
  - `Alt+Q`：ウェブ翻訳の開始 / 切り替え
  - `Alt+D`：独立した翻訳ウィンドウを開く
  - `Alt+K`：設定ポップアップを開く
  - `Alt+S`：翻訳パネルを開く / 選択したテキストを翻訳
  - `Alt+O`：設定ページを開く
  - `Alt+I`：現在の入力欄を翻訳

## クイックスタート

### 基本的な使い方（3 ステップで開始）

1. **サービスを追加**：設定の「サービス設定」を開き、必要な内蔵サービスを追加。API エンドポイント、API キー、モデル名を入力して「テスト」で動作確認後に保存します。
2. **シーンにサービスを割り当て**：「利用シーン設定」（ウェブ翻訳、選択語句、入力欄、字幕）で対応するサービスを選択（必要な能力を備えたサービスのみが表示されます）。「プロンプト管理」でカスタムテンプレートの指定も可能です。
3. **翻訳を開始**：ウェブページ上のフローティングアイコンをクリックするか、`Alt+Q` を押して翻訳を開始。`Alt+D` で独立ウィンドウを開けば、複数のサービスを同時に比較できます。

### 応用機能の使い方

- **API プラグインの利用**：「API プラグイン」画面で ZIP、フォルダ、GitHub/HTTPS リンクからプラグインを導入し、権限を承認。「サービス設定 → 追加 → 外部プラグイン」でインスタンスを作成・設定します。（※権限承認はローカル端末固有のため、別端末への同期後は再承認が必要です）。
- **ローカル AI の利用**：「ローカル AI」を開き、動作環境（WebGPU/WASM 等）を確認。「モデルセンター」でモデルをダウンロードしてテスト画面で動作確認した後、「サービス設定」でローカルサービスを追加して各シーンに割り当てます。
- **文書・画像の翻訳**：「ファイル翻訳」画面を開き、ファイルをアップロードして原文・目標言語を指定。認識および翻訳サービスを選んで処理を開始します。PDF は段階的な解析と翻訳、EPUB は章単位または全巻翻訳に対応し、完了後に希望の形式で出力します。

## インストール

> **ブラウザ拡張機能の利用を強く推奨します**：
>
> - 拡張機能版では、完全な機能（ローカル言語認識、独立ウィンドウ、ファイル翻訳、ローカル AI、右クリックメニューなど）が提供されます。
> - ユーザースクリプトはブラウザのサンドボックスによる制限があり、拡張機能専用 API が使えないほか、クロスオリジンやスクリプトマネージャーの互換性問題が発生する場合があります。

### ブラウザ拡張機能

- **Chrome**：[Chrome ウェブストア](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=ja)（Android は Kiwi Browser、iOS は Orion Browser に対応）
- **Edge**：[Edge アドオン](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=ja)
- **Firefox**：[Firefox Add-ons](https://addons.mozilla.org/ja/firefox/addon/kiss-translator/)
- **Thunderbird**：[GitHub Releases (.xpi)](https://github.com/fishjar/kiss-translator/releases)
- **Safari**：未対応（Mac / iOS 計画中）

### ユーザースクリプト

- **デスクトップ（Chrome / Edge / Firefox）**：[Tampermonkey](https://www.tampermonkey.net/) または [Violentmonkey](https://violentmonkey.github.io/) を導入後、以下からインストール：
  - [直接インストール（GitHub Pages）](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
  - [Greasy Fork スクリプトページ](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
- **iOS Safari**：[Userscripts Safari](https://github.com/quoid/userscripts) 拡張機能を導入後、以下からインストール：
  - [iOS 向けスクリプトを直接インストール](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## 関連プロジェクト

- **[KISS-Worker](https://github.com/fishjar/kiss-worker)**：データ同期サービス。Cloudflare Workers や Docker でセルフホスト可能で、データのプライバシー保持とプライベートなルール共有を実現します。
- **[kiss-rules](https://github.com/fishjar/kiss-rules)**：コミュニティでメンテナンスされている購読ルールリポジトリ。最新のウェブサイト適応ルールを提供し、ルール作成の質問や支援も行われています。

## よくある質問

### ショートカットキーを変更するには？

ブラウザの拡張機能ショートカット管理ページから設定してください：

- **Chrome / Edge**：アドレスバーに `chrome://extensions/shortcuts` を入力
- **Firefox**：アドレスバーに `about:addons` を入力し、右上の歯車アイコンから「拡張機能のショートカットを管理」を選択

### 翻訳ルールの優先順位は？

ルールは以下の優先度で適用されます：
**個人ルール > 購読ルール > グローバルルール**（グローバルルールがデフォルトの基本設定となります）。

### ウェブページ上で視覚的にルールを編集するには？

1. ウェブ翻訳パネルを開き、「サイトルールの編集」をクリックして用途（翻訳対象、除外エリア、原文維持など）を選択します。
2. ページ上の要素をクリックするか、CSS セレクターを直接入力します。親要素の階層調整やセレクター候補の比較、マッチする要素数をリアルタイムで確認できます。
3. **下書き機能**：編集、削除、元に戻す/やり直しはすべて一時的な下書きにのみ反映されます。「ルールを保存」をクリックして初めて保存・同期されます。「翻訳予定範囲」は読み込み済みの DOM ノードをハイライト表示するだけで、翻訳リクエストは送信されません。
4. **継承とリセット**：「継承に戻す」で購読ルールまたはグローバルルールの値に戻ります。「グループを空にする」で明示的に空の値を設定します（ルートコンテナを空にするとページ全体のスキャンを停止します）。
5. ※ 視覚的な選択は現在デスクトップの標準的な DOM ページに対応しており、iframe 内部、Shadow DOM 内部、Canvas 描画テキスト、タッチ操作には対応していません。

### サービスの接続テストに失敗した場合は？

- **設定内容の確認**：プロトコル、API エンドポイント、API キー、モデル名が正しいかご確認ください。サービスやモデルが一括バッチ送信やストリーミングに対応していない場合は、該当オプションを無効にしてください。
- **Ollama ローカルサービス**：内蔵の Ollama アダプターは OpenAI 互換プロトコルを使用します（`/api/chat` ネイティブプロトコルではありません）。ローカルサーバーの起動状態や CORS 設定（環境変数 `OLLAMA_ORIGINS=*` の指定など）をご確認ください。詳細は [Ollama 接続問題 #174](https://github.com/fishjar/kiss-translator/issues/174) を参照してください。
- **外部プラグインサービス**：テスト前に「API プラグイン」画面で権限が承認されているか確認してください。プロトコルやリクエスト内容を変更する場合は、プラグインの定義やソースコードを修正してインスタンスを更新してください。

### 設定画面にローカル AI、ファイル翻訳、プラグインが表示されないのはなぜですか？

- これらの高度な機能は、現在デスクトップ版 Chrome/Edge および Firefox 拡張機能でのみ提供されています。
- ストア公開版をお使いの場合、審査期間の都合により現在の開発ブランチの新機能がまだ反映されていない可能性があります。
- また、お使いの環境でブラウザ機能（WebGPU など）がサポートされていない場合や、ローカルモデルが未ダウンロードの場合、該当操作が利用できないことがあります。

### ユーザースクリプトで外部サービスに接続したり設定画面を開くには？

- **クロスオリジン許可**：スクリプトマネージャーのダイアログで対象ドメインへの通信を許可する必要があります。
- **機能の制限**：API プラグインおよびローカル AI はブラウザ拡張機能専用であり、ユーザースクリプトではサポートされていません。
- **設定画面**：オンライン版の [ユーザースクリプト設定ページ](https://fishjar.github.io/kiss-translator/options.html) に直接アクセスして設定できます。

## 今後の予定

本プロジェクトは個人開発のオープンソースプロジェクトであり、厳密なスケジュールはありません。コミュニティからの貢献や PR を歓迎します！

- [x] **テキストの一括送信**：リクエスト戦略を最適化し、API 呼び出し回数を削減してパフォーマンスを向上。
- [x] **リッチテキスト翻訳の強化**：複雑なページ構造やリッチテキスト形式の正確な翻訳をサポート。
- [x] **カスタム / AI インターフェースの強化**：ストリーミング、文脈記憶、マルチターン対話などの高度な AI 機能をサポート。
- [x] **英語辞書のフォールバック機構**：翻訳サービスが利用できない場合にローカル辞書にフォールバック。
- [x] **YouTube 字幕翻訳の改善**：ストリーミング字幕の結合と翻訳体験を向上させ、不自然な文分割を低減。
- [x] **エッジ AI 計算のサポート**：軽量なローカル LLM、VLM、ASR、OCR、TTS、JEV、レイアウト解析による翻訳支援。
- [x] **文書・画像翻訳のサポート**：TXT、Markdown、PDF、EPUB、PNG/JPEG/WebP 画像翻訳に対応。
- [ ] **分散共有プラットフォーム**：字幕やルールを共有するための分散メカニズムを導入。
- [ ] **翻訳 Agent**：文脈理解と意思決定を行うインテリジェントな翻訳 Agent を開発。
- [ ] **アーキテクチャの近代化**：モジュール構成を整理し、最新の技術スタックでプロジェクトを再構築。

上記の開発項目に関心のある方は、ぜひ [Issues](https://github.com/fishjar/kiss-translator/issues) での議論や PR の作成にご参加ください！

## 開発ガイド

### ローカルでのビルド

```sh
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev # PR の作成は dev ブランチを推奨します
pnpm install
pnpm build
```

プラグイン開発については、[プラグイン開発ガイド（中国語）](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md) を参照し、[OpenAI 互換プラグイン](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md) または [DeepSeek プラグイン](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md) をご確認ください。

### 外部イベント呼び出しの例

ウェブページスクリプトからカスタムイベントを発行して翻訳機能を制御できます：

```js
// `toggle_translate`   ウェブ翻訳の切り替え
// `toggle_styles`      訳文スタイルの切り替え
// `toggle_popup`       コントロールパネルの開閉
// `toggle_transbox`    独立翻訳ポップアップの開閉
// `toggle_hover_node`  ホバー中の段落を翻訳
// `input_translate`    現在の入力欄を翻訳
window.dispatchEvent(
  new CustomEvent("kiss_translator", { detail: { action: "toggle_translate" } })
);
```

## コミュニティ

- [Telegram グループ](https://t.me/+RRCu_4oNwrM2NmFl) に参加

## サポート

KISS Translator がお役に立ちましたら、継続的なメンテナンスのためのご支援をよろしくお願いいたします！

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
