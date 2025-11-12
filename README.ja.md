# KISS Translator

[English](README.en.md) | [中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

シンプルでオープンソースの [バイリンガル対照翻訳拡張機能＆ユーザースクリプト](https://github.com/fishjar/kiss-translator)です。

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 特徴

- [x] シンプルさを維持
- [x] オープンソース
- [x] 主要なブラウザに対応
  - [x] Chrome/Edge
  - [x] Firefox
  - [x] Kiwi (Android)
  - [x] Orion (iOS)
  - [x] Safari
  - [x] Thunderbird
- [x] 複数の翻訳サービスをサポート
  - [x] Google/Microsoft
  - [x] Tencent/Volcengine
  - [x] OpenAI/Gemini/Claude/Ollama/DeepSeek/OpenRouter
  - [x] DeepL/DeepLX/NiuTrans
  - [x] AzureAI/CloudflareAI
  - [x] Chromeブラウザ内蔵AI翻訳(BuiltinAI)
- [x] 一般的な翻訳シナリオをカバー
  - [x] Webページのバイリンガル対照翻訳
  - [x] 入力ボックス翻訳
    - ショートカットキーで入力ボックス内のテキストを即座に他言語に翻訳
  - [x] テキスト選択翻訳
    - [x] 任意のページで翻訳ボックスを開き、複数の翻訳サービスで比較翻訳が可能
    - [x] 英語辞書翻訳
    - [x] 単語のブックマーク
  - [x] マウスオーバー翻訳
  - [x] YouTube 字幕翻訳
    - 任意の翻訳サービスを使用してビデオ字幕を翻訳し、バイリンガル表示をサポート
    - 基本的な字幕結合・改行アルゴリズムを内蔵し、翻訳品質を向上
    - AIによる改行機能をサポートし、翻訳品質をさらに向上
    - 字幕スタイルのカスタマイズ
- [x] 多様な翻訳効果をサポート
  - [x] テキスト自動認識と手動ルールの2つのモードをサポート
    - テキスト自動認識モードにより、ほとんどのWebサイトでルールを記述しなくても完全な翻訳が可能
    - 手動ルールモードで、特定のWebサイトに合わせた最適な最適化が可能
  - [x] 翻訳テキストスタイルのカスタマイズ
  - [x] リッチテキストの翻訳と表示をサポートし、原文のリンクやその他のテキストスタイルを可能な限り保持
  - [x] 翻訳文のみの表示（原文を非表示）をサポート
- [x] 翻訳APIの高度な機能
  - [x] カスタムAPIにより、理論上あらゆる翻訳インターフェースをサポート
  - [x] 翻訳テキストの統合バッチ送信
  - [x] AIコンテキスト（会話メモリ）機能をサポートし、翻訳品質を向上
  - [x] カスタムAI用語集
  - [x] すべてのインターフェースがフックやカスタムパラメータなどの高度な機能をサポート
- [x] クライアント間のデータ同期
  - [x] KISS-Worker（cloudflare/docker）
  - [x] WebDAV
- [x] カスタム翻訳ルール
  - [x] ルールの購読/ルール共有
  - [x] カスタム専門用語
- [x] カスタムショートカットキー
  - `Alt+Q` 翻訳をオン
  - `Alt+C` スタイル切り替え
  - `Alt+K` 設定ポップアップを開く
  - `Alt+S` 翻訳ポップアップを開く/選択テキストを翻訳
  - `Alt+O` 設定ページを開く
  - `Alt+I` 入力ボックス翻訳

## インストール

> 注：以下の理由により、ブラウザ拡張機能の使用を優先することをお勧めします
>
> - ブラウザ拡張機能の方が機能が完全です（ローカル言語認識、右クリックメニューなど）
> - ユーザースクリプトはより多くの問題（クロスドメイン問題、スクリプトの競合など）に遭遇する可能性があります

- [x] ブラウザ拡張機能
  - [x] Chrome [インストール](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=zh-CN)
    - [x] Kiwi (Android)
    - [x] Orion (iOS)
  - [x] Edge [インストール](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=zh-CN)
  - [x] Firefox [インストール](https://addons.mozilla.org/zh-CN/firefox/addon/kiss-translator/)
  - [ ] Safari
    - [ ] Safari (Mac)
    - [ ] Safari (iOS) 
  - [x] Thunderbird [ダウンロード](https://github.com/fishjar/kiss-translator/releases)
- [x] ユーザースクリプト
  - [x] Chrome/Edge/Firefox ([Tampermonkey](https://www.tampermonkey.net/)/[Violentmonkey](https://violentmonkey.github.io/)) [インストールリンク](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
    - [Greasy Fork](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
  - [x] iOS Safari ([Userscripts Safari](https://github.com/quoid/userscripts)) [インストールリンク](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## 関連プロジェクト

- データ同期サービス: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
  - 本プロジェクトのデータ同期サービスとして使用できます。
  - 個人のプライベートなルールリストの共有にも使用できます。
  - セルフホスト、セルフマネジメント、データはプライベート。
- コミュニティ購読ルール: [https://github.com/fishjar/kiss-rules](https://github.com/fishjar/kiss-rules)
  - コミュニティによってメンテナンスされた、最新かつ最も完全な購読ルールリストを提供します。
  - ルール関連の問題についての助けを求める。

## よくある質問（FAQ）

### ショートカットキーの設定方法

拡張機能の管理ページで設定します。例： 

- chrome [chrome://extensions/shortcuts](chrome://extensions/shortcuts)
- firefox [about:addons](about:addons)

### ルール設定の優先順位は？

個人ルール > 購読ルール > グローバルルール

グローバルルールの優先順位は最も低いですが、フォールバックルールとして非常に重要です。

### API（Ollamaなど）のテストに失敗する

APIテストの失敗には、一般的に以下の原因が考えられます：

- アドレスが間違っている：
  - 例えば `Ollama` にはネイティブAPIアドレスと `Openai` 互換のアドレスがありますが、本プラグインは現在、`Openai` 互換アドレスをサポートしており、`Ollama` ネイティブAPIアドレスはサポートしていません
- 一部のAIモデルが統合翻訳をサポートしていない：
  - この場合、統合翻訳を無効にするか、カスタムAPIを使用して対応できます。
  - または、カスタムAPIを使用して対応します。詳細は[カスタムAPIサンプルドキュメント](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)を参照してください
- 一部のAIモデルでパラメータが一致しない：
  - 例えば `Gemini` のネイティブAPIはパラメータの不一致が大きく、一部のバージョンのモデルが特定のパラメータをサポートしていないためエラーが返されることがあります。
  - この場合、`Hook` を使用してリクエスト `body` を変更するか、`Gemini2` (`Openai` 互換アドレス) に切り替えることができます
- サーバーのクロスドメイン制限によりアクセスが拒否され、403エラーが返される：
  - 例えば `Ollama` を起動する際に、環境変数 `OLLAMA_ORIGINS=*` を追加する必要があります。参考：https://github.com/fishjar/kiss-translator/issues/174

### 入力したAPIがユーザースクリプトで使用できない

ユーザースクリプトは、リクエストを送信するためにドメインのホワイトリストを追加する必要があります。

### カスタムAPIのhook関数の設定方法

カスタムAPI機能は非常に強力で柔軟性があり、理論的にはどんな翻訳APIにも接続できます。

サンプル参照： [custom-api_v2.md](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)

### ユーザースクリプトの設定ページに直接アクセスする方法

設定ページアドレス： https://fishjar.github.io/kiss-translator/options.html

### 字幕翻訳のヒント

KTボタンがオンの状態（青地に白文字）であれば、何度もクリックする必要はありません。Youtubeプレーヤーの字幕ボタンをクリックしてオンにするだけで、バイリンガル字幕が自動的に表示されるのを待つだけです。

## 今後の計画 

 本プロジェクトは余暇に開発しており、厳密なタイムスケジュールはありません。コミュニティの共同構築を歓迎します。以下は初期段階の機能の方向性です：

- [x] **テキストの統合送信**：リクエスト戦略を最適化し、翻訳APIの呼び出し回数を減らし、パフォーマンスを向上させます。
- [x] **リッチテキスト翻訳の強化**：より複雑なページ構造やリッチテキストコンテンツの正確な翻訳をサポートします。
- [x] **カスタム/AI APIの強化**：コンテキストメモリ、複数ラウンドの対話など、高度なAI機能をサポートします。
- [x] **英語辞書のフォールバックメカニズム**：翻訳サービスが利用できない場合、他の辞書に切り替えるか、ローカル辞書での検索にフォールバックします。
- [x] **YouTube字幕サポートの最適化**：ストリーミング字幕の結合と翻訳体験を改善し、途切れを減らします。
- [ ] **ルール共同構築メカニズムのアップグレード**：より柔軟なルールの共有、バージョン管理、コミュニティレビュープロセスを導入します。
 
 特定の方向に興味がある場合は、[Issues](https://github.com/fishjar/kiss-translator/issues) で議論したり、PRを送信したりすることを歓迎します！

## 開発ガイド

```sh
git clone [https://github.com/fishjar/kiss-translator.git](https://github.com/fishjar/kiss-translator.git)
cd kiss-translator
git checkout dev # PRを送信する場合はdevブランチにプッシュすることをお勧めします
pnpm install
pnpm build
```

## コミュニケーション

- [Telegram グループ](https://t.me/+RRCu_4oNwrM2NmFl)に参加

## 寄付

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
