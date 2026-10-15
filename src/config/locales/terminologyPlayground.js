/**
 * @file terminologyPlayground.js
 * @description 术语演练场多语言文案字典
 */

const terminologyPlaygroundText = (zh, en, zh_TW, ja, ko, tr, vi) => ({
  zh,
  en,
  zh_TW,
  ja,
  ko,
  tr,
  vi,
});

export const TERMINOLOGY_PLAYGROUND_I18N = {
  terminology_playground: terminologyPlaygroundText(
    "专业术语",
    "Terminology",
    "專業術語",
    "専門用語",
    "전문 용어",
    "Terminoloji",
    "Thuật ngữ chuyên môn"
  ),
  terminology_playground_title: terminologyPlaygroundText(
    "专业术语库（本地替换预览）",
    "Terminology list (local replacement preview)",
    "專業術語庫（本機替換預覽）",
    "専門用語リスト（ローカル置換プレビュー）",
    "전문 용어 목록 (로컬 교체 미리보기)",
    "Terminoloji listesi (yerel değiştirme önizlemesi)",
    "Danh sách thuật ngữ (xem trước thay thế cục bộ)"
  ),
  terminology_playground_terms_label: terminologyPlaygroundText(
    "术语库（键值对，每行或 ; 分隔）",
    "Terms (key,value, one per line or separated by ;)",
    "術語庫（鍵值對，每行或 ; 分隔）",
    "用語リスト（key,value、改行または「;」区切り）",
    "용어 목록 (key,value, 한 줄에 하나 또는 ; 로 구분)",
    "Terimler (key,value, her satırda bir veya ; ile ayrılmış)",
    "Thuật ngữ (key,value, mỗi dòng một mục hoặc ngăn cách bằng ;)"
  ),
  terminology_playground_terms_helper: terminologyPlaygroundText(
    "术语键按正则语义解析：含正则元字符（如 .）需转义，例如字面点号写为 Dr\\.whob；译文留空 = 不翻译（保留原文，只写术语键不加尾部逗号）；重复的术语键只保留首次；术语按正则语义在原文任意位置匹配（与生产一致），建议长度长的术语写在前面。简单英文词若只需匹配独立单词，请显式添加边界（如 \\bAPI\\b）；该写法不适用于中文或 C++、.NET 等符号术语。",
    "Term keys are parsed as regex: escape regex metacharacters (e.g. a literal dot as Dr\\.whob). An empty value keeps the original (write the key only, without a trailing comma); duplicate keys keep the first; terms match anywhere in the source text by regex semantics (identical to production), so put longer terms first. To match a simple English word only when it stands alone, add explicit boundaries (for example \\bAPI\\b); this does not apply to Chinese or symbol terms such as C++ and .NET.",
    "術語鍵依正則語意解析：含正則元字元（如 .）需跳脫，例如字面點號寫為 Dr\\.whob；譯文留空 = 不翻譯（保留原文，只寫術語鍵不加尾部逗號）；重複的術語鍵只保留首次；術語依正則語意在原文任意位置匹配（與生產一致），建議長度較長的術語寫在前面。簡單英文詞若只需匹配獨立單詞，請明確加入邊界（如 \\bAPI\\b）；此寫法不適用於中文或 C++、.NET 等符號術語。",
    "用語 key は正規表現として解析されます。正規表現メタ文字（例：.）はエスケープが必要です（例：リテラルのドットは Dr\\.whob）。value を空にすると翻訳しません（原文保持、カンマなしで key のみ記述）。重複 key は最初のみ有効です。用語は正規表現の意味で原文の任意の位置に一致します（本番と同一）。長い用語ほど先に書くことを推奨します。単純な英単語だけを独立した語として一致させる場合は、境界を明示してください（例：\\bAPI\\b）。これは中国語や C++、.NET などの記号を含む用語には適用されません。",
    "용어 key 는 정규식으로 해석됩니다. 정규식 메타 문자(예: .)는 이스케이프가 필요합니다(예: 리터럴 점은 Dr\\.whob). value 가 비어 있으면 번역하지 않고 원문을 유지합니다(key 만 작성, 끝에 쉼표 없음). 중복 key 는 첫 번째만 유지됩니다. 용어는 정규식 의미로 원문의 어느 위치에서나 일치합니다(프로덕션과 동일). 길이가 긴 용어를 앞에 쓰는 것을 권장합니다. 간단한 영어 단어를 독립된 단어로만 일치시키려면 경계를 명시하세요(예: \\bAPI\\b). 이 방식은 중국어나 C++, .NET 같은 기호 용어에는 적용되지 않습니다.",
    "Terim anahtarları normal ifade olarak ayrıştırılır: normal ifade meta karakterlerini (ör. .) kaçışlayın (ör. değişmez nokta Dr\\.whob). Boş value = çevrilmez (orijinal korunur, virgülsüz yalnızca key yazın); aynı key'den yalnızca ilki tutulur. Terimler normal ifade anlamına göre kaynak metnin herhangi bir yerinde eşleşir (üretimle aynı); daha uzun terimleri önce yazın. Basit bir İngilizce sözcüğü yalnızca bağımsız olduğunda eşleştirmek için açık sınırlar ekleyin (ör. \\bAPI\\b); bu yöntem Çince veya C++ ve .NET gibi simgeli terimler için geçerli değildir.",
    "Khóa thuật ngữ được phân tích cú pháp như regex: hãy thoát các ký tự đặc biệt regex (ví dụ dấu chấm chữ thường viết là Dr\\.whob). value trống = không dịch (giữ nguyên văn bản, chỉ viết key không thêm dấu phẩy cuối); key trùng chỉ giữ lần đầu. Thuật ngữ khớp ở bất kỳ vị trí nào trong văn bản gốc theo ngữ nghĩa regex (giống bản chính thức); nên đặt thuật ngữ dài hơn ở trước. Để chỉ khớp một từ tiếng Anh đơn giản khi nó đứng độc lập, hãy thêm ranh giới rõ ràng (ví dụ \\bAPI\\b); cách này không áp dụng cho tiếng Trung hoặc thuật ngữ có ký hiệu như C++ và .NET."
  ),
  terminology_playground_sample: terminologyPlaygroundText(
    "填入冲突矩阵 4 类示例",
    "Load the 4-type conflict sample",
    "填入衝突矩陣 4 類範例",
    "4 タイプの衝突サンプルを入力",
    "충돌 매트릭스 4가지 유형 샘플 입력",
    "4 tür çakışma örneğini yükle",
    "Tải mẫu 4 loại xung đột"
  ),
  terminology_playground_rule_load_failed: terminologyPlaygroundText(
    "当前规则术语加载失败，已回退到全局规则：{message}",
    "Failed to load the active rule terms, fell back to the global rule: {message}",
    "目前規則術語載入失敗，已回退到全域規則：{message}",
    "現在のルール用語の読み込みに失敗し、グローバルルールにフォールバックしました：{message}",
    "현재 규칙 용어를 불러오지 못해 전역 규칙으로 대체했습니다: {message}",
    "Etkin kural terimleri yüklenemedi, genel kurala geri dönüldü: {message}",
    "Không tải được thuật ngữ của quy tắc hiện tại, đã quay về quy tắc toàn cục: {message}"
  ),
  terminology_playground_placeholder_label: terminologyPlaygroundText(
    "占位符格式",
    "Placeholder format",
    "佔位符格式",
    "プレースホルダー形式",
    "플레이스홀더 형식",
    "Yer tutucu biçimi",
    "Định dạng placeholder"
  ),
  terminology_playground_seed_label: terminologyPlaygroundText(
    "例句序号",
    "Example seed",
    "例句序號",
    "例文シード",
    "예문 시드",
    "Örnek tohumu",
    "Seed câu ví dụ"
  ),
  terminology_playground_rotate_seed: terminologyPlaygroundText(
    "换一个例句",
    "Change example",
    "換一句例句",
    "別の例文を表示",
    "다른 예문 보기",
    "Örneği değiştir",
    "Đổi câu ví dụ"
  ),
  terminology_playground_invalid_terms: terminologyPlaygroundText(
    "检测到 {count} 条非法术语段，未生成本地替换结果：{reasons}",
    "{count} illegal term segments detected, so no local replacement was produced: {reasons}",
    "偵測到 {count} 條非法術語段，未產生本機替換結果：{reasons}",
    "不正な用語セグメントが {count} 件あるため、ローカル置換は生成されませんでした：{reasons}",
    "잘못된 용어 세그먼트 {count}개가 감지되어 로컬 교체가 생성되지 않았습니다: {reasons}",
    "{count} geçersiz terim bölümü algılandı, yerel değiştirme üretilmedi: {reasons}",
    "Đã phát hiện {count} đoạn thuật ngữ không hợp lệ, không tạo thay thế cục bộ: {reasons}"
  ),
  terminology_playground_invalid_state: terminologyPlaygroundText(
    "存在被拒绝的非法段（已跳过，不影响仍可应用的合法术语）。为免误导，未生成整体“通过”摘要；仍可应用的合法术语：{terms}。完整诊断见控制台（logger.error [TermPlayground]）。",
    'Some segments were rejected (skipped; they do not affect valid terms that still apply). To avoid a misleading result, no overall "pass" summary was generated; valid terms that still apply: {terms}. Full diagnostics are in the console (logger.error [TermPlayground]).',
    "存在被拒絕的非法段（已略過，不影響仍可應用的合法術語）。為免誤導，未產生整體「通過」摘要；仍可應用的合法術語：{terms}。完整診斷見控制台（logger.error [TermPlayground]）。",
    "拒否された不正なセグメントがあります（スキップ済み。適用可能な有効な用語には影響しません）。誤解を避けるため全体の「成功」サマリーは生成していません。適用可能な有効な用語：{terms}。完全な診断はコンソール（logger.error [TermPlayground]）をご覧ください。",
    "거부된 잘못된 세그먼트가 있습니다(건너뜀. 여전히 적용되는 유효한 용어에는 영향 없음). 오해를 피하기 위해 전체 '통과' 요약은 생성하지 않았습니다. 여전히 적용되는 유효한 용어: {terms}. 전체 진단은 콘솔(logger.error [TermPlayground])을 확인하세요.",
    "Reddedilen geçersiz bölümler var (atlandı; hâlâ uygulanabilir geçerli terimleri etkilemez). Yanıltıcı sonuç vermemek için genel 'geçti' özeti oluşturulmadı; hâlâ uygulanabilir geçerli terimler: {terms}. Tam teşhis konsoldadır (logger.error [TermPlayground]).",
    "Có đoạn không hợp lệ đã bị từ chối (được bỏ qua; không ảnh hưởng đến thuật ngữ hợp lệ vẫn được áp dụng). Để tránh gây hiểu nhầm, không tạo bản tóm tắt 'đạt' tổng thể; các thuật ngữ hợp lệ vẫn được áp dụng: {terms}. Chẩn đoán đầy đủ trong console (logger.error [TermPlayground])."
  ),
  terminology_playground_none: terminologyPlaygroundText(
    "（无）",
    "(none)",
    "（無）",
    "（なし）",
    "(없음)",
    "(yok)",
    "(không có)"
  ),
  terminology_playground_meta_warning: terminologyPlaygroundText(
    "{count} 个术语含未转义正则元字符（术语按正则语义解析）：{terms}。若要字面匹配，请在字符前加反斜杠，例如 Dr.whob 应写为 Dr\\.whob。",
    "{count} terms contain unescaped regex metacharacters (terms are parsed as regex): {terms}. For a literal match, prefix the character with a backslash, e.g. write Dr\\.whob for Dr.whob.",
    "{count} 個術語含未跳脫正則元字元（術語依正則語意解析）：{terms}。若要字面匹配，請在字元前加反斜線，例如 Dr.whob 應寫為 Dr\\.whob。",
    "{count} 件の用語にエスケープされていない正規表現メタ文字があります（用語は正規表現として解析）：{terms}。リテラル一致にするには文字の前にバックスラッシュを付けます。例：Dr.whob は Dr\\.whob と記述。",
    "{count}개 용어에 이스케이프되지 않은 정규식 메타 문자가 있습니다(용어는 정규식으로 해석됨): {terms}. 리터럴 일치를 원하면 문자 앞에 백슬래시를 추가하세요(예: Dr.whob → Dr\\.whob).",
    "{count} terim, kaçışlanmamış normal ifade meta karakterleri içeriyor (terimler normal ifade olarak ayrıştırılır): {terms}. Birebir eşleşme için karakterden önce ters eğik çizgi koyun, ör. Dr.whob yerine Dr\\.whob yazın.",
    "{count} thuật ngữ chứa ký tự đặc biệt regex chưa thoát (thuật ngữ được phân tích như regex): {terms}. Để khớp ký tự theo nghĩa đen, hãy thêm dấu gạch chéo ngược trước ký tự, ví dụ viết Dr\\.whob cho Dr.whob."
  ),
  terminology_playground_web_note: terminologyPlaygroundText(
    "当前为 web 模式（普通浏览器标签页）：AI 翻译请求可能被浏览器 CORS 拦截（多数 AI 接口未开放跨域）。本地术语替换预览不受影响；真实 AI 翻译测试请在打包后的扩展（background 代发）或油猴（GM.xmlHttpRequest）环境中验证。",
    "You are in web mode (a normal browser tab): AI translation requests may be blocked by browser CORS (most AI APIs do not allow cross-origin access). Local term replacement preview is unaffected; verify real AI translation in a packaged extension (background proxy) or a userscript (GM.xmlHttpRequest) environment.",
    "目前為 web 模式（一般瀏覽器分頁）：AI 翻譯請求可能被瀏覽器 CORS 攔截（多數 AI 介面未開放跨域）。本機術語替換預覽不受影響；真實 AI 翻譯測試請在打包後的擴充功能（background 代發）或油猴（GM.xmlHttpRequest）環境中驗證。",
    "現在は web モード（通常のブラウザータブ）です：AI 翻訳リクエストはブラウザーの CORS でブロックされる可能性があります（多くの AI API はクロスオリジンを許可していません）。ローカル用語置換プレビューには影響しません。実際の AI 翻訳テストは、パッケージ化した拡張機能（background 経由）またはユーザースクリプト（GM.xmlHttpRequest）環境で検証してください。",
    "현재 web 모드(일반 브라우저 탭)입니다: AI 번역 요청이 브라우저 CORS로 차단될 수 있습니다(대부분 AI API가 교차 출처를 허용하지 않음). 로컬 용어 교체 미리보기에는 영향을 주지 않습니다. 실제 AI 번역 테스트는 패키징된 확장 프로그램(background 대리 요청) 또는 유저스크립트(GM.xmlHttpRequest) 환경에서 검증하세요.",
    "Şu anda web modundasınız (normal bir tarayıcı sekmesi): AI çeviri istekleri tarayıcı CORS tarafından engellenebilir (çoğu AI API'si çapraz kaynak erişimine izin vermez). Yerel terim değiştirme önizlemesi etkilenmez. Gerçek AI çeviri testini paketlenmiş uzantı (background vekâleti) veya kullanıcı betiği (GM.xmlHttpRequest) ortamında doğrulayın.",
    "Bạn đang ở chế độ web (tab trình duyệt thông thường): các yêu cầu dịch AI có thể bị chặn bởi CORS của trình duyệt (hầu hết API AI không cho phép truy cập chéo nguồn gốc). Xem trước thay thế thuật ngữ cục bộ không bị ảnh hưởng. Hãy xác minh kiểm tra dịch AI thực trong môi trường tiện ích mở rộng đã đóng gói (ủy quyền background) hoặc userscript (GM.xmlHttpRequest)."
  ),
  // ── _delivery_*：四态 Chip 与实际值包装 ─────────────────────────────
  terminology_playground_delivery_delivered: terminologyPlaygroundText(
    "已发出",
    "Sent",
    "已發送",
    "送信済み",
    "전송됨",
    "Gönderildi",
    "Đã gửi"
  ),
  terminology_playground_delivery_mismatch: terminologyPlaygroundText(
    "值不一致",
    "Value mismatch",
    "值不一致",
    "値が不一致",
    "값 불일치",
    "Değer uyuşmuyor",
    "Giá trị không khớp"
  ),
  terminology_playground_delivery_missing: terminologyPlaygroundText(
    "未发出",
    "Not sent",
    "未發送",
    "未送信",
    "전송되지 않음",
    "Gönderilmedi",
    "Không gửi"
  ),
  terminology_playground_delivery_uncaptured: terminologyPlaygroundText(
    "未捕获",
    "Not captured",
    "未捕獲",
    "未検出",
    "검출 안 됨",
    "Yakalanamadı",
    "Không phát hiện"
  ),
  terminology_playground_delivery_value_wrap: terminologyPlaygroundText(
    "{label}（实际值：{value}）",
    "{label} (actual: {value})",
    "{label}（實際值：{value}）",
    "{label}（実際の値：{value}）",
    "{label}（실제 값：{value}）",
    "{label} (gerçek değer: {value})",
    "{label}（giá trị thực: {value}）"
  ),
  terminology_playground_delivery_empty: terminologyPlaygroundText(
    "（空）",
    "(empty)",
    "（空）",
    "（空）",
    "（없음）",
    "(boş)",
    "（trống）"
  ),

  // ── _channel_*：注入通道描述 ────────────────────────────────────────
  terminology_playground_channel_custom: terminologyPlaygroundText(
    "自定义接口：不注入提示词与术语（需自行实现 reqHook）",
    "Custom API: no prompt or terms injected (implement reqHook yourself)",
    "自訂介面：不注入提示詞與術語（需自行實作 reqHook）",
    "カスタムAPI：プロンプトや用語を注入しません（reqHook を自分で実装）",
    "사용자 정의 API: 프롬프트와 용어를 주입하지 않음 (reqHook 직접 구현 필요)",
    "Özel API: istem veya terim enjekte edilmez (reqHook'u kendiniz uygulayın)",
    "API tùy chỉnh: không chèn lời nhắc và thuật ngữ (tự triển khai reqHook)"
  ),
  terminology_playground_channel_qwenmt: terminologyPlaygroundText(
    "服务端原生术语 translation_options.terms",
    "Server-side native terms translation_options.terms",
    "服務端原生術語 translation_options.terms",
    "サーバー側ネイティブ用語 translation_options.terms",
    "서버 네이티브 용어 translation_options.terms",
    "Sunucu tarafı yerel terimler translation_options.terms",
    "Thuật ngữ gốc phía máy chủ translation_options.terms"
  ),
  terminology_playground_channel_batch: terminologyPlaygroundText(
    "批量 {protocol} {{glossary}} 占位符",
    "Batch {protocol} {{glossary}} placeholder",
    "批次 {protocol} {{glossary}} 佔位符",
    "バッチ {protocol} {{glossary}} プレースホルダー",
    "배치 {protocol} {{glossary}} 플레이스홀더",
    "Toplu {protocol} {{glossary}} yer tutucusu",
    "Giữ chỗ {{glossary}} {protocol} dạng lô"
  ),
  terminology_playground_channel_nobatch: terminologyPlaygroundText(
    "非批量 {{glossary}} 占位符",
    "Non-batch {{glossary}} placeholder",
    "非批次 {{glossary}} 佔位符",
    "非バッチ {{glossary}} プレースホルダー",
    "비배치 {{glossary}} 플레이스홀더",
    "Batch olmayan {{glossary}} yer tutucusu",
    "Giữ chỗ {{glossary}} không theo lô"
  ),

  // ── _prompt_*：提示词标签 ───────────────────────────────────────────
  terminology_playground_prompt_none: terminologyPlaygroundText(
    "不使用翻译提示词",
    "No translation prompt used",
    "不使用翻譯提示詞",
    "翻訳プロンプトを使用しない",
    "번역 프롬프트를 사용하지 않음",
    "Çeviri istemi kullanılmaz",
    "Không dùng lời khách dịch"
  ),
  terminology_playground_prompt_json: terminologyPlaygroundText(
    "JSON 聚合翻译提示词",
    "JSON batch translation prompt",
    "JSON 聚合翻譯提示詞",
    "JSON 一括翻訳プロンプト",
    "JSON 일괄 번역 프롬프트",
    "JSON toplu çeviri istemi",
    "Lời khách dịch lô JSON"
  ),
  terminology_playground_prompt_xml: terminologyPlaygroundText(
    "XML 聚合翻译提示词",
    "XML batch translation prompt",
    "XML 聚合翻譯提示詞",
    "XML 一括翻訳プロンプト",
    "XML 일괄 번역 프롬프트",
    "XML toplu çeviri istemi",
    "Lời khách dịch lô XML"
  ),
  terminology_playground_prompt_line: terminologyPlaygroundText(
    "LINE 聚合翻译提示词",
    "LINE batch translation prompt",
    "LINE 聚合翻譯提示詞",
    "LINE 一括翻訳プロンプト",
    "LINE 일괄 번역 프롬프트",
    "LINE toplu çeviri istemi",
    "Lời khách dịch lô LINE"
  ),
  terminology_playground_prompt_custom_batch: terminologyPlaygroundText(
    "自定义聚合提示词",
    "Custom batch prompt",
    "自訂聚合提示詞",
    "カスタム一括プロンプト",
    "사용자 정의 일괄 프롬프트",
    "Özel toplu istem",
    "Lời khách lô tùy chỉnh"
  ),
  terminology_playground_prompt_nobatch: terminologyPlaygroundText(
    "非批量翻译提示词",
    "Non-batch translation prompt",
    "非批次翻譯提示詞",
    "非バッチ翻訳プロンプト",
    "비배치 번역 프롬프트",
    "Batch olmayan çeviri istemi",
    "Lời khách dịch không theo lô"
  ),
  terminology_playground_prompt_custom_nobatch: terminologyPlaygroundText(
    "自定义非批量提示词",
    "Custom non-batch prompt",
    "自訂非批次提示詞",
    "カスタム非バッチプロンプト",
    "사용자 정의 비배치 프롬프트",
    "Özel non-batch istemi",
    "Custom prompt không theo lô"
  ),

  // ── _alert_*：Snackbar 与错误弹窗文案 ──────────────────────────────
  terminology_playground_alert_invalid_terms: terminologyPlaygroundText(
    "存在非法术语段，请先修正输入后再测试。",
    "Invalid term segments found. Fix the input before testing.",
    "存在非法術語段，請先修正輸入後再測試。",
    "不正な用語セグメントがあります。テスト前に入力を修正してください。",
    "잘못된 용어 세그먼트가 있습니다. 테스트 전에 입력을 수정하세요.",
    "Geçersiz terim bölümleri var; testten önce girdiyi düzeltin.",
    "Có đoạn thuật ngữ không hợp lệ; hãy sửa đầu vào trước khi kiểm tra."
  ),
  terminology_playground_alert_no_example: terminologyPlaygroundText(
    "未生成可测试的例句。",
    "No testable example was generated.",
    "未產生可測試的例句。",
    "テスト可能な例文が生成されませんでした。",
    "테스트 가능한 예문이 생성되지 않았습니다.",
    "Test edilebilir örnek oluşturulmadı.",
    "Không tạo được câu ví dụ kiểm tra được."
  ),
  terminology_playground_alert_auto_sample_skipped: terminologyPlaygroundText(
    "部分正则术语无法可靠生成自动匹配样例，已跳过这些自动断言。",
    "Some regex terms cannot reliably generate automatic matching samples; their auto assertions were skipped.",
    "部分正規術語無法可靠產生自動匹配樣例，已略過這些自動斷言。",
    "一部の正規表現用語は自動マッチングサンプルを確実に生成できないため、これらの自動アサーションをスキップしました。",
    "일부 정규식 용어는 자동 매칭 샘플을 신뢰할 수 있게 생성할 수 없어 해당 자동 검증을 건너뛰었습니다.",
    "Bazı regex terimleri için güvenilir otomatik eşleşme örneği üretilemedi; bu otomatik doğrulamalar atlandı.",
    "Một số thuật ngữ regex không thể tạo mẫu khớp tự động đáng tin cậy, nên đã bỏ qua các kiểm chứng tự động đó."
  ),
  terminology_playground_issue_no_terms: terminologyPlaygroundText(
    "无有效术语，无法断言。",
    "No valid terms; assertion skipped.",
    "無有效術語，無法斷言。",
    "有効な用語がなく、アサーションをスキップしました。",
    "유효한 용어가 없어 검증을 건너뛰었습니다.",
    "Geçerli terim yok; doğrulama atlandı.",
    "Không có thuật ngữ hợp lệ, bỏ qua kiểm chứng."
  ),
  terminology_playground_issue_empty_text: terminologyPlaygroundText(
    "测试文本为空，无法断言。",
    "Test text is empty; assertion skipped.",
    "測試文字為空，無法斷言。",
    "テストテキストが空のため、アサーションをスキップしました。",
    "테스트 텍스트가 비어 있어 검증을 건너뛰었습니다.",
    "Test metni boş; doğrulama atlandı.",
    "Văn bản kiểm tra trống, bỏ qua kiểm chứng."
  ),
  terminology_playground_issue_invalid_testcase: terminologyPlaygroundText(
    "测试用例缺少 term 信息，无法断言。",
    "Test case is missing term info; assertion skipped.",
    "測試用例缺少 term 資訊，無法斷言。",
    "テストケースに用語情報がなく、アサーションをスキップしました。",
    "테스트 케이스에 용어 정보가 없어 검증을 건너뛰었습니다.",
    "Test ögesinde terim bilgisi eksik; doğrulama atlandı.",
    "Ca kiểm thử thiếu thông tin thuật ngữ, bỏ qua kiểm chứng."
  ),
  terminology_playground_issue_single_not_found: terminologyPlaygroundText(
    "术语 {term} 未被命中。",
    "Term {term} was not matched.",
    "術語 {term} 未被命中。",
    "用語 {term} はマッチしませんでした。",
    "용어 {term}이(가) 매칭되지 않았습니다.",
    "{term} terimi eşleşmedi.",
    "Thuật ngữ {term} không được khớp."
  ),
  terminology_playground_issue_single_wrong_replacement:
    terminologyPlaygroundText(
      "术语 {term} 替换结果不正确。",
      "Term {term} was replaced incorrectly.",
      "術語 {term} 替換結果不正確。",
      "用語 {term} の置換結果が正しくありません。",
      "용어 {term}의 치환 결과가 올바르지 않습니다.",
      "{term} terimi yanlış değiştirildi.",
      "Thuật ngữ {term} bị thay thế sai."
    ),
  terminology_playground_issue_conflict_long_not_hit: terminologyPlaygroundText(
    "长词 {long} 未被命中（短词 {short} 可能抢占）。",
    "Long term {long} was not matched (short term {short} may have taken over).",
    "長詞 {long} 未被命中（短詞 {short} 可能搶佔）。",
    "長い用語 {long} がマッチしませんでした（短い用語 {short} が先に取得した可能性）。",
    "긴 용어 {long}이(가) 매칭되지 않았습니다(짧은 용어 {short}가 선점했을 수 있음).",
    "Uzun terim {long} eşleşmedi (kısa terim {short} öne geçmiş olabilir).",
    "Thuật ngữ dài {long} không được khớp (thuật ngữ ngắn {short} có thể đã chiếm trước)."
  ),
  terminology_playground_issue_conflict_long_cut: terminologyPlaygroundText(
    "长词 {long} 被短词 {short} 切割（检测到前缀误伤）。",
    "Long term {long} was cut by short term {short} (prefix overwrite detected).",
    "長詞 {long} 被短詞 {short} 切割（檢測到前綴誤傷）。",
    "長い用語 {long} が短い用語 {short} によって切断されました（接頭辞の誤置換を検出）。",
    "긴 용어 {long}이(가) 짧은 용어 {short}에 의해 잘렸습니다(접두어 오표적 감지).",
    "Uzun terim {long}, kısa terim {short} tarafından kesildi (önekyazma saptandı).",
    "Thuật ngữ dài {long} bị thuật ngữ ngắn {short} cắt ngang (phát hiện ghi đè tiền tố)."
  ),
  terminology_playground_issue_conflict_long_value_not_applied:
    terminologyPlaygroundText(
      "长词 {long} 有译文但未被替换（仍为原文）。",
      "Long term {long} has a translation but was not replaced (original text kept).",
      "長詞 {long} 有譯文但未被替換（仍為原文）。",
      "長い用語 {long} は訳があるのに置換されていません（原文のまま）。",
      "긴 용어 {long}에 번역이 있는데도 치환되지 않았습니다(원문 유지).",
      "Uzun terim {long} için çeviri var ama değiştirilmedi (öz metin korundu).",
      "Thuật ngữ dài {long} có bản dịch nhưng không được thay thế (vẫn giữ nguyên văn)."
    ),
  terminology_playground_issue_conflict_long_no_value_replaced:
    terminologyPlaygroundText(
      '长词 {long} 无译文但被替换为 "{replacement}"。',
      'Long term {long} has no translation but was replaced with "{replacement}".',
      "長詞 {long} 無譯文但被替換為「{replacement}」。",
      "長い用語 {long} は訳がないのに「{replacement}」に置換されました。",
      '긴 용어 {long}에 번역이 없는데도 "{replacement}"(으)로 치환되었습니다.',
      'Çevirisi olmayan uzun terim {long}, "{replacement}" ile değiştirildi.',
      'Thuật ngữ dài {long} không có bản dịch nhưng bị thay bằng "{replacement}".'
    ),
  terminology_playground_issue_conflict_short_value_not_applied:
    terminologyPlaygroundText(
      "短词 {short} 有译文但未被替换（单独出现时）。",
      "Short term {short} has a translation but was not replaced (standalone occurrence).",
      "短詞 {short} 有譯文但未被替換（單獨出現時）。",
      "短い用語 {short} は訳があるのに置換されていません（単独出現時）。",
      "짧은 용어 {short}에 번역이 있는데도 치환되지 않았습니다(단독 출현 시).",
      "Kısa terim {short} için çeviri var ama değiştirilmedi (tek başına geçtiğinde).",
      "Thuật ngữ ngắn {short} có bản dịch nhưng không được thay thế (khi xuất hiện riêng lẻ)."
    ),
  terminology_playground_issue_naive_prefix_cut: terminologyPlaygroundText(
    "长词 {long} 被短词 {short} 切割（检测到前缀误伤）。",
    "Long term {long} was cut by short term {short} (prefix overwrite detected).",
    "長詞 {long} 被短詞 {short} 切割（檢測到前綴誤傷）。",
    "長い用語 {long} が短い用語 {short} によって切断されました（接頭辞の誤置換を検出）。",
    "긴 용어 {long}이(가) 짧은 용어 {short}에 의해 잘렸습니다(접두어 오표적 감지).",
    "Uzun terim {long}, kısa terim {short} tarafından kesildi (önekyazma saptandı).",
    "Thuật ngữ dài {long} bị thuật ngữ ngắn {short} cắt ngang (phát hiện ghi đè tiền tố)."
  ),
  terminology_playground_issue_naive_cut_residue: terminologyPlaygroundText(
    "不翻译长词 {long} 被切割出高亮残留（短词 {short} 内部命中）。",
    "Untranslated long term {long} was cut leaving highlight residue (short term {short} matched inside).",
    "不翻譯長詞 {long} 被切割出高亮殘留（短詞 {short} 內部命中）。",
    "翻訳しない長い用語 {long} にハイライト残骸が生じました（短い用語 {short} が内部でマッチ）。",
    "번역하지 않는 긴 용어 {long}에 하이라이트 잔여물이 생겼습니다(짧은 용어 {short} 내부 매칭).",
    "Çevrilmeyen uzun terim {long} kesilerek vurgu artığı bıraktı (kısa terim {short} içeride eşleşti).",
    "Thuật ngữ dài không dịch {long} bị cắt để lại phần làm nổi bật còn sót (thuật ngữ ngắn {short} khớp bên trong)."
  ),
  terminology_playground_issue_unknown_type: terminologyPlaygroundText(
    "未知的测试用例类型: {type}",
    "Unknown test case type: {type}",
    "未知的測試用例類型: {type}",
    "不明なテストケース種別: {type}",
    "알 수 없는 테스트 케이스 유형: {type}",
    "Bilinmeyen test ögesi türü: {type}",
    "Loại ca kiểm thử không xác định: {type}"
  ),
  terminology_playground_check_more: terminologyPlaygroundText(
    "还有 {count} 条未展示。",
    "{count} more rows not shown.",
    "還有 {count} 條未展示。",
    "他の {count} 件は未表示です。",
    "{count}개 항목이 더 있지만 표시되지 않았습니다.",
    "{count} satır daha gösterilmiyor.",
    "Còn {count} dòng chưa được hiển thị."
  ),
  terminology_playground_check_expand: terminologyPlaygroundText(
    "展开全部",
    "Show all",
    "展開全部",
    "すべて表示",
    "모두 펼치기",
    "Tümünü göster",
    "Hiện tất cả"
  ),
  terminology_playground_check_collapse: terminologyPlaygroundText(
    "收起",
    "Collapse",
    "收起",
    "折りたたむ",
    "접기",
    "Daralt",
    "Thu gọn"
  ),
  terminology_playground_alert_test_passed: terminologyPlaygroundText(
    "测试通过",
    "Test passed",
    "測試通過",
    "テスト成功",
    "테스트 통과",
    "Test geçti",
    "Kiểm tra đạt"
  ),
  terminology_playground_alert_example_label: terminologyPlaygroundText(
    "例句：",
    "Example: ",
    "例句：",
    "例文：",
    "예문: ",
    "Örnek: ",
    "Ví dụ: "
  ),
  terminology_playground_alert_replaced_label: terminologyPlaygroundText(
    "替换后：",
    "Replaced: ",
    "替換後：",
    "置換後：",
    "교체 후: ",
    "Değiştirilmiş: ",
    "Sau thay thế: "
  ),
  terminology_playground_alert_test_failed: terminologyPlaygroundText(
    "测试失败",
    "Test failed",
    "測試失敗",
    "テスト失敗",
    "테스트 실패",
    "Test başarısız",
    "Kiểm tra thất bại"
  ),
  terminology_playground_alert_no_api: terminologyPlaygroundText(
    "请先在顶部选择要测试的翻译接口。",
    "Select a translation API at the top first.",
    "請先在頂部選擇要測試的翻譯介面。",
    "先に上部でテストする翻訳 API を選択してください。",
    "먼저 상단에서 테스트할 번역 API를 선택하세요.",
    "Önce üstten test edilecek çeviri API'sini seçin.",
    "Hãy chọn API dịch để kiểm tra ở phía trên trước."
  ),
  terminology_playground_alert_api_not_supported: terminologyPlaygroundText(
    "该接口不支持 AI 专业术语",
    "This API does not support AI terms",
    "該介面不支援 AI 專業術語",
    "この API は AI 専門用語をサポートしていません",
    "이 API는 AI 전문 용어를 지원하지 않습니다",
    "Bu API AI terimlerini desteklemiyor",
    "API này không hỗ trợ thuật ngữ AI"
  ),
  terminology_playground_alert_api_not_supported_body:
    terminologyPlaygroundText(
      "{apiName} 是 {type}接口，不支持注入提示词，AI 专业术语（规则级/接口级）不会生效。 请选 AI 接口（OpenAI 兼容/Gemini/Claude 等）。",
      "{apiName} is a {type} API. It does not support prompt injection, so AI terms (rule-level/API-level) will not take effect. Choose an AI API (OpenAI-compatible/Gemini/Claude, etc.).",
      "{apiName} 是{type}介面，不支援注入提示詞，AI 專業術語（規則級/介面級）不會生效。請選 AI 介面（OpenAI 相容/Gemini/Claude 等）。",
      "{apiName} は{type} API です。プロンプト注入に対応していないため、AI 専門用語（ルールレベル/APIレベル）は反映されません。AI 対応 API（OpenAI 互換/Gemini/Claude など）を選択してください。",
      "{apiName}는 {type} API입니다. 프롬프트 주입을 지원하지 않아 AI 전문 용어(규칙급/API급)가 적용되지 않습니다. AI API(OpenAI 호환/Gemini/Claude 등)를 선택하세요.",
      "{apiName} bir {type} API'sidir. Prompt enjeksiyonu desteklemediğinden AI terimleri (kural/API düzeyi) uygulanmaz. Bir AI API'si (OpenAI uyumlu/Gemini/Claude vb.) seçin.",
      "{apiName} là API {type}. Không hỗ trợ prompt injection nên thuật ngữ AI (cấp quy tắc/cấp API) sẽ không hiệu lực. Hãy chọn API AI (tương thích OpenAI/Gemini/Claude...)."
    ),
  terminology_playground_api_type_machine: terminologyPlaygroundText(
    "机器翻译",
    "machine translation",
    "機器翻譯",
    "機械翻訳",
    "기계 번역",
    "makine çevirisi",
    "dịch máy"
  ),
  terminology_playground_api_type_traditional: terminologyPlaygroundText(
    "传统翻译",
    "traditional translation",
    "傳統翻譯",
    "従来型翻訳",
    "전통 번역",
    "geleneksel çeviri",
    "dịch truyền thống"
  ),
  terminology_playground_alert_ai_terms_required: terminologyPlaygroundText(
    "请先输入 AI 专业术语以生成测试例句。",
    "Enter AI terms to generate a test example first.",
    "請先輸入 AI 專業術語以產生測試例句。",
    "先に AI 専門用語を入力してテスト例を生成してください。",
    "먼저 AI 전문 용어를 입력하여 테스트 예문을 생성하세요.",
    "Önce AI terimlerini girip bir test örneği oluşturun.",
    "Hãy nhập thuật ngữ AI để tạo câu ví dụ kiểm tra trước."
  ),
  terminology_playground_alert_ai_test_failed: terminologyPlaygroundText(
    "AI 翻译测试失败",
    "AI translation test failed",
    "AI 翻譯測試失敗",
    "AI 翻訳テストに失敗",
    "AI 번역 테스트 실패",
    "AI çeviri testi başarısız",
    "Kiểm tra dịch AI thất bại"
  ),

  // ── _api_*：接口选择器区 ────────────────────────────────────────────
  terminology_playground_api_title: terminologyPlaygroundText(
    "接口选择",
    "API selection",
    "介面選擇",
    "API 選択",
    "API 선택",
    "API seçimi",
    "Chọn API"
  ),
  terminology_playground_api_desc: terminologyPlaygroundText(
    "机器翻译与传统翻译接口（Microsoft、DeepL、Google 等）不支持 AI 专业术语；AI 模型接口与 QwenMT 支持。",
    "Machine- and traditional-translation APIs (Microsoft, DeepL, Google, etc.) do not support AI terms; AI model APIs and QwenMT do.",
    "機器翻譯與傳統翻譯介面（Microsoft、DeepL、Google 等）不支援 AI 專業術語；AI 模型介面與 QwenMT 支援。",
    "機械翻訳・従来型翻訳 API（Microsoft、DeepL、Google など）は AI 専門用語に非対応です。AI モデル API と QwenMT は対応します。",
    "기계 번역 및 전통 번역 API(Microsoft, DeepL, Google 등)는 AI 전문 용어를 지원하지 않습니다. AI 모델 API와 QwenMT는 지원합니다.",
    "Makine ve geleneksel çeviri API'leri (Microsoft, DeepL, Google vb.) AI terimlerini desteklemez; AI model API'leri ve QwenMT destekler.",
    "API dịch máy và dịch truyền thống (Microsoft, DeepL, Google...) không hỗ trợ thuật ngữ AI; API mô hình AI và QwenMT thì có."
  ),
  terminology_playground_api_label: terminologyPlaygroundText(
    "翻译接口",
    "Translation API",
    "翻譯介面",
    "翻訳 API",
    "번역 API",
    "Çeviri API'si",
    "API dịch"
  ),
  terminology_playground_api_none: terminologyPlaygroundText(
    "未配置可用接口，请先到「接口设置」页配置",
    'No usable API configured; add one on the "API Settings" page first.',
    "未配置可用介面，請先到「介面設定」頁配置",
    "有効な API が設定されていません。「API 設定」ページで先に追加してください。",
    "사용 가능한 API가 설정되지 않았습니다. 먼저 「API 설정」페이지에서 추가하세요.",
    'Etkin API yapılandırılmamış; önce "API Ayarları" sayfasında ekleyin.',
    'Chưa cấu hình API khả dụng; hãy thêm ở trang "Cài đặt API" trước.'
  ),
  terminology_playground_api_machine_note: terminologyPlaygroundText(
    "当前为{type}，AI 专业术语无法生效。",
    "Currently {type}; AI terms cannot take effect.",
    "目前為{type}，AI 專業術語無法生效。",
    "現在は{type}です。AI 専門用語は反映されません。",
    "현재 {type}입니다. AI 전문 용어는 적용되지 않습니다.",
    "Şu anda {type}; AI terimleri etkili olamaz.",
    "Hiện là {type}; thuật ngữ AI không thể có hiệu lực."
  ),
  terminology_playground_api_qwenmt_note: terminologyPlaygroundText(
    "当前为 QwenMT，AI 专业术语可生效。",
    "Currently QwenMT; AI terms can take effect.",
    "目前為 QwenMT，AI 專業術語可生效。",
    "現在は QwenMT です。AI 専門用語が反映されます。",
    "현재 QwenMT입니다. AI 전문 용어가 적용됩니다.",
    "Şu anda QwenMT; AI terimleri etkili olabilir.",
    "Hiện là QwenMT; thuật ngữ AI có thể có hiệu lực."
  ),
  terminology_playground_api_ai_note: terminologyPlaygroundText(
    "当前为 AI 翻译，AI 专业术语可生效。",
    "Currently AI translation; AI terms can take effect.",
    "目前為 AI 翻譯，AI 專業術語可生效。",
    "現在は AI 翻訳です。AI 専門用語が反映されます。",
    "현재 AI 번역입니다. AI 전문 용어가 적용됩니다.",
    "Şu anda AI çevirisi; AI terimleri etkili olabilir.",
    "Hiện là dịch AI; thuật ngữ AI có thể có hiệu lực."
  ),

  // ── _local_*：本地术语区按钮与标签 ──────────────────────────────────
  terminology_playground_local_test: terminologyPlaygroundText(
    "测试",
    "Test",
    "測試",
    "テスト",
    "테스트",
    "Test",
    "Kiểm tra"
  ),
  terminology_playground_local_default: terminologyPlaygroundText(
    "默认",
    "Default",
    "預設",
    "デフォルト",
    "기본",
    "Varsayılan",
    "Mặc định"
  ),
  terminology_playground_local_example: terminologyPlaygroundText(
    "例句",
    "Example",
    "例句",
    "例文",
    "예문",
    "Örnek",
    "Ví dụ"
  ),
  terminology_playground_local_pass: terminologyPlaygroundText(
    "本地替换通过",
    "Local replace OK",
    "本地替換通過",
    "ローカル置換 合格",
    "로컬 치환 통과",
    "Yerel değiştirme başarılı",
    "Thay thế cục bộ đạt"
  ),
  terminology_playground_local_fail: terminologyPlaygroundText(
    "本地替换异常",
    "Local replace failed",
    "本地替換異常",
    "ローカル置換 失敗",
    "로컬 치환 실패",
    "Yerel değiştirme hatası",
    "Lỗi thay thế cục bộ"
  ),
  // 徽标语义澄清：该断言只覆盖本地正则替换自检，不代表 AI 接口的遵循效果。
  terminology_playground_local_replace_hint: terminologyPlaygroundText(
    "本地自检：已对当前例句执行一次正则替换断言，全部术语命中并按预期替换；不代表 AI 接口的实际遵循效果。",
    "Local self-check: a regex replacement assertion ran on this example; all terms matched and were replaced as expected. It does not reflect actual AI API adherence.",
    "本地自檢：已對當前例句執行一次正則替換斷言，全部術語命中並按預期替換；不代表 AI 介面的實際遵循效果。",
    "ローカル自己チェック：この例文に正規表現置換アサーションを実行し、全用語が命中・期待どおりに置換されました。AI API の実際の遵守を示すものではありません。",
    "로컬 자가 검사: 현재 예문에 정규식 치환 단언을 실행했으며 모든 용어가 일치하고 예상대로 치환되었습니다. AI API의 실제 준수 여부를 나타내지 않습니다.",
    "Yerel öz-denetim: Bu örnek üzerinde regex değiştirme doğrulaması çalıştırıldı; tüm terimler eşleşti ve beklendiği gibi değiştirildi. AI API'nin gerçek uyumunu yansıtmaz.",
    "Tự kiểm tra cục bộ: Đã chạy xác nhận thay thế regex trên ví dụ này; mọi thuật ngữ đều khớp và được thay đúng như mong đợi. Không phản ánh mức tuân thủ thực tế của AI API."
  ),

  // ── _terms_*：AI 专业术语输入区 ─────────────────────────────────────
  terminology_playground_terms_title: terminologyPlaygroundText(
    "AI 专业术语（术语表预览 + 真实 AI 翻译测试）",
    "AI terms (glossary preview + real AI translation test)",
    "AI 專業術語（術語表預覽 + 真實 AI 翻譯測試）",
    "AI 専門用語（用語集プレビュー + 実際の AI 翻訳テスト）",
    "AI 전문 용어(용어 사전 미리보기 + 실제 AI 번역 테스트)",
    "AI terimleri (sözlük önizlemesi + gerçek AI çeviri testi)",
    "Thuật ngữ AI (xem trước glossary + kiểm tra dịch AI thực)"
  ),
  terminology_playground_terms_help_intro: terminologyPlaygroundText(
    "键值对，每行或 `;` 分隔。选 AI 接口后点「测试」发起真实请求。 术语表为**软注入**，模型不保证遵循。",
    'Key-value pairs, one per line or separated by `;`. Select an AI API and click "Test" to send a real request. The glossary is a **soft injection**; the model does not guarantee to follow it.',
    "鍵值對，每行或 `;` 分隔。選 AI 介面後點「測試」發起真實請求。術語表為**軟注入**，模型不保證遵循。",
    "key:value、1行1つまたは `;` 区切りです。AI 対応 API を選んで「テスト」をクリックすると実際のリクエストを送信します。用語集は**ソフト注入**で、モデルは必ず従うとは限りません。",
    'key:value, 한 줄에 하나 또는 `;` 로 구분합니다. AI API를 선택하고 "테스트"를 클릭하면 실제 요청을 보냅니다. 용어 사전은 **소프트 주입**이며 모델이 반드시 따르는 것은 아닙니다.',
    'key:value çiftleri, her satırda bir veya `;` ile ayrılmış. Bir AI API\'si seçip "Test"e tıklayınca gerçek bir istek gönderilir. Sözlük **yumuşak enjeksiyon**dur; modelin uyacağı garanti edilmez.',
    'Cặp key:value, mỗi dòng một mục hoặc ngăn cách bằng `;`. Chọn API AI và bấm "Kiểm tra" để gửi yêu cầu thực. Glossary được **nhúng mềm**; model không đảm bảo tuân theo.'
  ),
  terminology_playground_terms_help_more: terminologyPlaygroundText(
    "更多",
    "More",
    "更多",
    "もっと見る",
    "더 보기",
    "Daha fazla",
    "Xem thêm"
  ),
  terminology_playground_terms_help_collapse: terminologyPlaygroundText(
    "收起",
    "Collapse",
    "收起",
    "閉じる",
    "접기",
    "Kapat",
    "Thu gọn"
  ),
  // 译者须知：** 与 ` 标记必须保留，标记内文本可翻译。
  terminology_playground_terms_help_detail_a: terminologyPlaygroundText(
    "本区数据为临时测试数据，已自动保留上一次输入，正式保存请复制到「规则/接口设置」页。 AI 专业术语不支持正则表达式。 注意：术语表是通过提示词**软注入**的，模型不保证一定遵循；遇到强先验词 （模型已熟知的专有名词/固定译法，如 API、token）可能压不住，建议用造词 （如 zorp,数据管道）排除干扰。要**必定**替换请写到本地专业术语 （规则 → 术语）：那是正则硬替换、原词不进请求，但注意它按正则语义解析， 元字符 `. + * ? ( ) [ ] \\ | ^ $` 需转义，且只作用于整页翻译的段落正文。 AI 专业术语仅作辅助。",
    "The data here is temporary test data; the last input is kept automatically. To save it for real, copy it to the Rules/API Settings page. AI terms do not support regex. Note: the glossary is **soft-injected** via the prompt, and the model does not guarantee to follow it. Strong prior terms (well-known names or fixed translations the model already knows, e.g. API, token) may not be suppressed, so we recommend using invented terms (e.g. `zorp,data pipeline`) to remove interference. For a **guaranteed** replacement, put it in the local terms (Rule → Terms): that is a hard regex replacement and the original word is not sent, but note it is parsed by regex semantics, metacharacters `. + * ? ( ) [ ] \\ | ^ $` must be escaped, and it only applies to the body of the page translation.",
    "本區資料為臨時測試資料，已自動保留上次輸入，正式儲存請複製到「規則/介面設定」頁。AI 專業術語不支援正則。注意：術語表是透過提示詞**軟注入**的，模型不保證一定遵循；遇到強先驗詞（模型已熟知的專有名稱/固定譯法，如 API、token）可能壓不住，建議用造詞（如 zorp,資料管線）排除干擾。要**必定**替換請寫到本機專業術語（規則 → 術語）：那是正則硬替換、原詞不進請求，但注意它依正則語意解析，元字符 `. + * ? ( ) [ ] \\ | ^ $` 需跳脫，且只作用於整頁翻譯的段落正文。AI 專業術語僅作輔助。",
    "ここは一時的なテストデータです。前回の入力は自動で保持され、正式に保存するには「ルール/API設定」ページへコピーしてください。AI専門用語は正規表現非対応。用語集はプロンプトによる**ソフト注入**で、モデルが必ず従うとは限りません。強い事前知識のある用語（API、パッケージなどモデルが既に知っている固有名）は抑制できない場合があるため、造語（例：zorp,データパイプライン）で干渉を排除することを推奨します。**確実に**置換したい場合はローカル専門用語（ルール → 用語）に書いてください：正規表現によるハード置換で原文はリクエストに送られませんが、正規表現メタ文字 `. + * ? ( ) [ ] \\ | ^ $` はエスケープが必要で、ページ翻訳の本文にのみ適用されます。AI専門用語は補助です。",
    '여기 데이터는 임시 테스트 데이터입니다. 마지막 입력은 자동으로 유지되며 실제 저장은 "규칙/API 설정" 페이지에 복사하세요. AI 용어는 정규식을 지원하지 않습니다. 용어집은 프롬프트를 통해 **소프트 주입**되며 모델이 반드시 따르지 않습니다. 강한 사전 지식(모델이 아는 고유명사/고정 번역, 예: API, package)은 눌리지 않을 수 있으니 인공 단어(예: zorp,데이터 파이프라인)로 간섭을 제거하는 것을 권장합니다. **반드시** 교체하려면 로컬 전문 용어(규칙 → 용어)에 작성하세요. 정규식 하드 교체로 원본이 요청에 포함되지 않지만 정규식 의미로 해석되므로 메타 문자 `. + * ? ( ) [ ] \\ | ^ $` 는 이스케이프해야 하며 페이지 본문에만 적용됩니다. AI 전문 용어는 보조적입니다.',
    'Buradaki veri geçici test verisidir; son girdi otomatik saklanır, kalıcı kayıt için "Kurallar/API Ayarları" sayfasına kopyalayın. AI terimleri regex desteklemez. Sözlük istem yoluyla **yumuşak enjekte** edilir ve modelin uyacağı garanti edilmez; güçlü önceliği (modelin zaten bildiği özel isimler/teslim çeviriler, ör. API, token) bastırılamaz, bu yüzden uydurma terimler (ör. zorp) ile etkileşimi giderin. **Kesin** uygulama için yerel terimlere (Kural → Terimler) yazın: bu regex ile sert değiştirmedir ve orijinal kelime gönderilmez; ancak regex meta karakterleri (`. + * ? ( ) [ ] \\ | ^ $`) kaçışlanmalı ve yalnızca sayfa çevirisinin gövdesine uygulanır. AI terimleri yalnızca yardımcıdır.',
    'Dữ liệu ở đây là dữ liệu kiểm tra tạm thời; nhập cuối được giữ tự động, muốn lưu chính thức hãy copy sang trang "Quy tắc/Cài đặt API". Thuật ngữ AI không hỗ trợ regex. Glossary được **nhúng mềm** qua prompt; model không đảm bảo tuân theo. Với từ mạnh tiên nghiệm (tên riêng/bản dịch cố định model đã biết, như API, token) có thể không chặn được, nên dùng từ chế ra (như zorp,đường ống dữ liệu) để loại nhiễu. Muốn **chắc chắn** thay thế hãy viết vào thuật ngữ cục bộ (Quy tắc → Thuật ngữ): đó là thay thế cứng bằng regex, từ gốc không vào yêu cầu; nhưng nó được phân tích theo ngữ nghĩa regex, ký tự đặc biệt `. + * ? ( ) [ ] \\ | ^ $` phải thoát và chỉ tác dụng lên thân bài dịch toàn trang. Thuật ngữ AI chỉ mang tính hỗ trợ.'
  ),
  terminology_playground_terms_help_detail_b: terminologyPlaygroundText(
    "另外，接口的**「聚合发送翻译请求」开关会影响遵循率**：开启时术语作为结构化 `glossary` 字段发出，且系统提示词带「最高优先级、只输出术语值」的显式指令； 关闭时术语退化为提示词里的 `- 原词: 译文` 文本行，无结构、指令权重低， 小参数模型（8B 级）经常压不住。实测 Qwen3-8B 关闭聚合时替换不稳定、开启后显著改善； Qwen3.6-27B 与 Gemini 3.5 Flash Lite 两种模式都能稳定替换。**术语不生效时优先试着开启聚合。**",
    'Also, the API\'s **"batch send translation request" switch affects adherence**: when enabled, terms are sent as a structured `glossary` field and the system prompt carries an explicit "highest priority, output term values only" instruction; when disabled, terms degrade to `- original: translation` text lines in the prompt, with no structure and low instruction weight, which small models (8B class) often fail to follow. In practice Qwen3-8B is unstable without the aggregate switch and significantly better with it; Qwen3.6-27B and Gemini 3.5 Flash Lite follow both modes stably. **Prefer turning on aggregation when terms do not take effect.**',
    "另外，介面的**「聚合傳送翻譯請求」開關會影響遵循率**：開啟時術語作為結構化 `glossary` 欄位發出，且系統提示詞帶「最高優先級、只輸出術語值」的顯式指令；關閉時術語退化為提示詞裡的 `- 原詞: 譯文` 文字行，無結構、指令權重低，小參數模型（8B 級）經常壓不住。實測 Qwen3-8B 關閉聚合時替換不穩定、開啟後顯著改善；Qwen3.6-27B 與 Gemini 3.5 Flash Lite 兩種模式都能穩定替換。**術語不生效時優先試著開啟聚合。**",
    "また、API の**「一括送信翻訳リクエスト」スイッチは順守率に影響します**：ON のとき用語は構造化 `glossary` フィールドとして送られ、システムプロンプトに「最優先・用語値のみ出力」の明示命令が付きます。OFF のとき用語はプロンプト内の `- 原語: 訳語` テキスト行に退化し、構造がなく命令の重みが低いため、小規模モデル（8B級）では抑えられないことがよくあります。実測では Qwen3-8B は集約OFF で置換が不安定、ON で大幅改善。Qwen3.6-27B と Gemini 3.5 Flash Lite はどちらも安定しています。**用語が効かないときはまず集約をONにしてください。**",
    '또한 인터페이스의 **"일괄 보내기" 스위치는 준수율에 영향을**: 켜져 있으면 용어가 구조적 `glossary` 필드로 나가고 시스템 프롬프트에 "최우선, 용어 값만 출력" 명령이 포함됩니다. 꺼져 있으면 용어는 프롬프트의 `- 원어: 번역` 텍스트로 퇴화하고 구조가 없어 명령 가중치가 낮아 소규모 모델(8B 급)이 자주 못 지킵니다. Qwen3-8B 실제 측정에서는 일괄 꺼짐 시 불안정, 켜짐 시 크게 개선; Qwen3.6-27B와 Gemini 3.5 Flash Lite는 두 모드 모두 안정적입니다. **용어가 적용되지 않으면 먼저 일괄을 켜보세요.**',
    'Ayrıca API\'nin **"toplu gönder" anahtarı uyum oranını etkiler**: açıkken terimler yapısal `glossary` alanı olarak gönderilir ve sistem istemine "en yüksek öncelik, yalnızca terim değeri" talimatı eklenir. Kapalıyken terimler `- kelime: çeviri` metin satırlarına dönüşür, yapı ve öncelik ağırlığı düşer; küçük modeller (8B) çoğunlukla uyamaz. Qwen3-8B kapatılınca tutarsız, açılınca belirgin iyileşti; Qwen3.6-27B ve Gemini 3.5 Flash Lite her iki modda da sabittir. **Terimler uygulanmazsa önce toplu özelliği açmayı deneyin.**',
    'Ngoài ra, **công tắc "gửi lô" của API ảnh hưởng tỷ lệ tuân thủ**: khi bật, thuật ngữ được gửi dưới dạng trường `glossary` có cấu trúc và prompt hệ thống có chỉ thị rõ "ưu tiên cao nhất, chỉ xuất giá trị thuật ngữ"; khi tắt, thuật ngữ suy thành dòng văn bản `- từ gốc: bản dịch`, không cấu trúc và trọng số chỉ dẫn thấp, model nhỏ (cấp 8B) thường không giữ được. Qwen3-8B tắt lô thay thế không ổn định, bật lên cải thiện rõ; Qwen3.6-27B và Gemini 3.5 Flash Lite đều ổn định ở cả hai chế độ. **Nếu thuật ngữ không hiệu quả, hãy thử bật lô trước.**'
  ),
  terminology_playground_terms_input_label: terminologyPlaygroundText(
    "AI 专业术语",
    "AI terms",
    "AI 專業術語",
    "AI 専門用語",
    "AI 전문 용어",
    "AI terimleri",
    "Thuật ngữ AI"
  ),
  // 示例术语 zorp / quzzle 为造词，全语言保持不变；样例文本已按 B3 改为
  // TerminologyPlayground 模块常量 AI_TERMS_SAMPLE_TEXT（功能数据不进 i18n），
  // 原 terminology_playground_terms_sample 条目随之删除（无引用孤儿 key）。
  terminology_playground_terms_count: terminologyPlaygroundText(
    "解析出 {count} 条术语",
    "{count} terms parsed",
    "解析出 {count} 條術語",
    "{count} 件の用語を解析",
    "{count}개 용어 파싱됨",
    "{count} terim ayrıştırıldı",
    "Đã phân tích {count} thuật ngữ"
  ),
  terminology_playground_terms_helper_empty: terminologyPlaygroundText(
    "输入键值对格式的术语，每行或 ; 分隔",
    "Enter terms in key,value format, one per line or separated by ;",
    "輸入鍵值對格式的術語，每行或 ; 分隔",
    "key,value 形式の用語を入力（改行または「;」区切り）",
    "key,value 형식으로 용어 입력(한 줄에 하나 또는 ; 구분)",
    "key,value biçiminde terimleri girin (her satırda bir veya ; ile)",
    "Nhập thuật ngữ dạng key,value, mỗi dòng một mục hoặc ngăn cách bằng ;"
  ),
  terminology_playground_terms_parsed_title: terminologyPlaygroundText(
    "解析后的术语表键值对（将按此格式合并到提示词中的术语表占位符）：",
    "Parsed glossary key/value pairs (merged into the glossary placeholder in this format):",
    "解析後的術語表鍵值對（將依此格式合併到提示詞中的術語表佔位符）：",
    "解析後の用語集のキー/値（この形式で用語集プレースホルダーにマージされます）：",
    "파싱된 용어 사전 key/value(이 형식으로 glossary placeholder에 병합됨):",
    "Ayrıştırılan sözlük key/value çiftleri (bu biçimde sözlük yer tutucusuna birleştirilir):",
    "Cặp key/value glossary đã phân tích (sẽ được hợp vào placeholder glossary theo định dạng này):"
  ),
  terminology_playground_terms_col_term: terminologyPlaygroundText(
    "术语（键）",
    "Term (key)",
    "術語（鍵）",
    "用語（key）",
    "용어(key)",
    "Terim (key)",
    "Thuật ngữ (key)"
  ),
  terminology_playground_terms_col_value: terminologyPlaygroundText(
    "定义（值）",
    "Definition (value)",
    "定義（值）",
    "定義（value）",
    "정의(value)",
    "Tanım (value)",
    "Định nghĩa (value)"
  ),
  terminology_playground_terms_col_format: terminologyPlaygroundText(
    "提示词格式",
    "Prompt format",
    "提示詞格式",
    "プロンプト形式",
    "프롬프트 형식",
    "İstem biçimi",
    "Định dạng prompt"
  ),
  terminology_playground_terms_no_translation: terminologyPlaygroundText(
    "（无译文，保留原文）",
    "(no translation; keep original)",
    "（無譯文，保留原文）",
    "（訳なし、原文保持）",
    "（번역 없음, 원문 유지）",
    "(çeviri yok, orijinal korunur)",
    "（không dịch, giữ nguyên văn bản）"
  ),
  terminology_playground_terms_example_title: terminologyPlaygroundText(
    "AI 术语例句",
    "AI term example",
    "AI 術語例句",
    "AI 用語の例文",
    "AI 용어 예문",
    "AI terimi örneği",
    "Ví dụ thuật ngữ AI"
  ),
  terminology_playground_terms_hint: terminologyPlaygroundText(
    "要专门测试某一个术语是否生效，只需填入该术语；其他术语留空有助于观察单个术语的生效情况。",
    "To test whether a specific term takes effect, enter only that term; leaving others empty makes it easier to observe a single term's effect.",
    "若要專門測試某個術語是否生效，只需填入該術語；其他術語留空有助於觀察單一術語的生效情況。",
    "特定の用語が効くかテストするにはその用語だけを入力してください；他は空にすると単一の用語の効果を観察しやすくなります。",
    "특정 용어가 적용되는지 테스트하려면 그 용어만 입력하세요; 다른 용어를 비워두면 단일 용어의 적용 여부를 관찰하기 쉽습니다.",
    "Belirli bir terimin etki edip etmediğini test etmek için yalnızca o terimi girin; diğerleri boş bırakmak tek terimin etkisini gözlemlemeyi kolaylaştırır.",
    "Muốn kiểm tra một thuật ngữ cụ thể có hiệu quả, chỉ cần nhập thuật ngữ đó; để trống các thuật ngữ khác giúp quan sát hiệu quả từng thuật ngữ."
  ),
  terminology_playground_terms_sample_button: terminologyPlaygroundText(
    "填入示例",
    "Load sample",
    "填入示例",
    "サンプルを入力",
    "샘플 입력",
    "Örneği yükle",
    "Nhập mẫu"
  ),
  terminology_playground_terms_rotate_button: terminologyPlaygroundText(
    "换一个例句",
    "Change example",
    "換一個例句",
    "別の例を表示",
    "다른 예문",
    "Örneği değiştir",
    "Đổi ví dụ"
  ),
  terminology_playground_terms_testing: terminologyPlaygroundText(
    "测试中…",
    "Testing…",
    "測試中…",
    "テスト中…",
    "테스트 중…",
    "Test ediliyor…",
    "Đang kiểm tra…"
  ),
  terminology_playground_terms_test: terminologyPlaygroundText(
    "测试",
    "Test",
    "測試",
    "テスト",
    "테스트",
    "Test",
    "Kiểm tra"
  ),
  terminology_playground_terms_cancel: terminologyPlaygroundText(
    "取消",
    "Cancel",
    "取消",
    "キャンセル",
    "취소",
    "İptal",
    "Hủy"
  ),

  // ── _result_*：测试结果区（含发送/接收面板） ────────────────────────
  terminology_playground_result_title: terminologyPlaygroundText(
    "测试结果（{name}）",
    "Test result ({name})",
    "測試結果（{name}）",
    "テスト結果（{name}）",
    "테스트 결과({name})",
    "Test sonucu ({name})",
    "Kết quả kiểm tra ({name})"
  ),
  terminology_playground_result_req_title: terminologyPlaygroundText(
    "发送的请求（Request）",
    "Sent request (Request)",
    "傳送的請求（Request）",
    "送信リクエスト（Request）",
    "보낸 요청(Request)",
    "Gönderilen istek (Request)",
    "Yêu cầu đã gửi (Request)"
  ),
  terminology_playground_result_req_view_summary: terminologyPlaygroundText(
    "返回摘要视图",
    "Back to summary view",
    "返回摘要視圖",
    "サマリビューに戻る",
    "요약 보기로 돌아가기",
    "Özet görünüme dön",
    "Về chế độ xem tóm tắt"
  ),
  terminology_playground_result_req_view_json: terminologyPlaygroundText(
    "查看原始 JSON",
    "View raw JSON",
    "查看原始 JSON",
    "生 JSON を表示",
    "원시 JSON 보기",
    "Ham JSON'ı görüntüle",
    "Xem JSON thô"
  ),
  terminology_playground_result_req_uncaptured: terminologyPlaygroundText(
    "未捕获到请求",
    "Request not captured",
    "未捕獲到請求",
    "リクエストを検出できません",
    "요청을 포착하지 못함",
    "İstek yakalanamadı",
    "Không phát hiện yêu cầu"
  ),
  terminology_playground_result_soft_glossary_title: terminologyPlaygroundText(
    "AI 专业术语（软提示词注入）",
    "AI terms (soft prompt injection)",
    "AI 專業術語（軟提示詞注入）",
    "AI 専門用語（ソフトプロンプト注入）",
    "AI 전문 용어(소프트 프롬프트 주입)",
    "AI terimleri (yumuşak istem enjeksiyonu)",
    "Thuật ngữ AI (prompt nhúng mềm)"
  ),
  terminology_playground_result_prompt_label: terminologyPlaygroundText(
    "翻译提示词：",
    "Translation prompt: ",
    "翻譯提示詞：",
    "翻訳プロンプト：",
    "번역 프롬프트: ",
    "Çeviri istemi: ",
    "Lời khách dịch: "
  ),
  terminology_playground_result_channel_label: terminologyPlaygroundText(
    "注入通道：",
    "Injection channel: ",
    "注入通道：",
    "注入チャネル：",
    "주입 채널: ",
    "Enjeksiyon kanalı: ",
    "Kênh nhúng: "
  ),
  terminology_playground_result_request_label: terminologyPlaygroundText(
    "翻译例句：",
    "Translation example: ",
    "翻譯例句：",
    "翻訳例：",
    "번역 예문: ",
    "Çeviri örneği: ",
    "Ví dụ dịch: "
  ),
  terminology_playground_result_model_host: terminologyPlaygroundText(
    "模型：{model} · 接口地址：{host}",
    "Model: {model} · API URL: {host}",
    "模型：{model} · 介面地址：{host}",
    "モデル：{model} · API URL：{host}",
    "모델: {model} · API 주소: {host}",
    "Model: {model} · API adresi: {host}",
    "Mô hình: {model} · URL API: {host}"
  ),
  terminology_playground_result_auth: terminologyPlaygroundText(
    "鉴权：{key}",
    "Auth: {key}",
    "鑒權：{key}",
    "認証：{key}",
    "인증: {key}",
    "Kimlik: {key}",
    "Xác thực: {key}"
  ),
  terminology_playground_result_actual_prompt: terminologyPlaygroundText(
    "实际发出的提示词",
    "Actual prompt sent",
    "實際傳送的提示詞",
    "実際に送信したプロンプト",
    "실제로 보낸 프롬프트",
    "Gönderilen gerçek istem",
    "Prompt thực tế đã gửi"
  ),
  terminology_playground_result_uncaptured_prompt: terminologyPlaygroundText(
    "未捕获到提示词",
    "Prompt not captured",
    "未捕獲提示詞",
    "プロンプトを検出できません",
    "프롬프트 포착 실패",
    "İstem yakalanamadı",
    "Không phát hiện prompt"
  ),
  terminology_playground_result_resp_title: terminologyPlaygroundText(
    "接收的响应（Response）",
    "Received response (Response)",
    "接收的響應（Response）",
    "受信レスポンス（Response）",
    "받은 응답(Response)",
    "Alınan yanıt (Response)",
    "Phản hồi nhận được (Response)"
  ),
  terminology_playground_result_resp_uncaptured: terminologyPlaygroundText(
    "未捕获到响应（可能失败/被取消）",
    "Response not captured (may have failed/been cancelled)",
    "未捕獲響應（可能失敗/被取消）",
    "レスポンスを検出できません（失敗/キャンセル）",
    "응답 포착 실패(실패/취소 가능)",
    "Yanıt yakalanamadı (başarısız/iptal edilmiş olabilir)",
    "Không phát phản hồi (có thể thất bại/đã hủy)"
  ),
  terminology_playground_result_translation_label: terminologyPlaygroundText(
    "翻译译文：",
    "Translation: ",
    "翻譯譯文：",
    "翻訳文：",
    "번역문: ",
    "Çeviri: ",
    "Bản dịch: "
  ),
  terminology_playground_result_lang_same: terminologyPlaygroundText(
    "语言：{lang}（{code}）· 同语言：{same}",
    "Language: {lang} ({code}) · Same language: {same}",
    "語言：{lang}（{code}）· 同語言：{same}",
    "言語：{lang}（{code}）· 同一言語：{same}",
    "언어: {lang}({code}) · 같은 언어: {same}",
    "Dil: {lang} ({code}) · Aynı dil: {same}",
    "Ngôn ngữ: {lang} ({code}) · Cùng ngôn ngữ: {same}"
  ),
  terminology_playground_result_yes: terminologyPlaygroundText(
    "是",
    "Yes",
    "是",
    "はい",
    "예",
    "Evet",
    "Có"
  ),
  terminology_playground_result_no: terminologyPlaygroundText(
    "否",
    "No",
    "否",
    "いいえ",
    "아니요",
    "Hayır",
    "Không"
  ),
  // ── _check_*：术语表贡献与生效检测表 ────────────────────────────────
  terminology_playground_check_heuristic: terminologyPlaygroundText(
    "以下术语表生效检测为启发式参考（模型可能改写措辞/加括号/不保留占位符），真实对照以上方原始返回译文为准。",
    "The following glossary effect check is a heuristic (the model may rephrase, add parentheses, or drop placeholders); treat the raw translated output above as the ground truth.",
    "以下術語表生效檢測為啟發式參考（模型可能改寫措辭/加括號/不保留佔位符），請以上方原始返回譯文為準。",
    "以下の用語集の効果判定はヒューリスティック参考です（モデルが表現を変えたり括弧を付けたりする可能性があります）。上部の生の翻訳出力を基準にしてください。",
    "아래 용어 사전 적용 검사는 휴리스틱 참고입니다(모델이 표현을 바꾸거나 괄호를 추가할 수 있음). 위의 원시 번역 출력을 기준으로 하세요.",
    "Aşağıdaki sözlük uygulama kontrolü buluşsal bir referanstır (model ifadeyi değiştirebilir parantez ekleyebilir); yukarıdaki ham çeviri çıktısını esas alın.",
    "Kiểm tra hiệu lực glossary bên dưới chỉ là tham khảo heuristic (model có thể viết lại/hay thêm ngoặc); hãy dựa vào bản dịch gốc ở trên."
  ),
  terminology_playground_check_title: terminologyPlaygroundText(
    "术语表贡献与生效检测",
    "Glossary contribution and effect check",
    "術語表貢獻與生效檢測",
    "用語集の貢献と効果の確認",
    "용어 사전 기여 및 적용 확인",
    "Sözlük katkısı ve etki kontrolü",
    "Đóng góp glossary và kiểm tra hiệu lực"
  ),
  terminology_playground_check_col_source: terminologyPlaygroundText(
    "来源",
    "Source",
    "來源",
    "ソース",
    "출처",
    "Kaynak",
    "Nguồn"
  ),
  terminology_playground_check_col_term: terminologyPlaygroundText(
    "术语（键→值）",
    "Term (key→value)",
    "術語（鍵→值）",
    "用語（key→value）",
    "용어(key→value)",
    "Terim (key→value)",
    "Thuật ngữ (key→value)"
  ),
  terminology_playground_check_col_delivered: terminologyPlaygroundText(
    "已发出（事实）",
    "Sent (fact)",
    "已發送（事實）",
    "送信（事実）",
    "전송됨(실제)",
    "Gönderildi (gerçek)",
    "Đã gửi (thực tế)"
  ),
  terminology_playground_check_col_hit: terminologyPlaygroundText(
    "译文命中（启发式）",
    "Translation hit (heuristic)",
    "譯文命中（啟發式）",
    "訳語一致（ヒューリスティック）",
    "번역 일치(휴리스틱)",
    "Çeviri vuruşu (heuristic)",
    "Trúng bản dịch (heuristic)"
  ),
  terminology_playground_check_source_input: terminologyPlaygroundText(
    "用户输入",
    "User input",
    "用戶輸入",
    "ユーザー入力",
    "사용자 입력",
    "Kullanıcı girdisi",
    "Người dùng nhập"
  ),
  terminology_playground_check_source_api: terminologyPlaygroundText(
    "接口级",
    "API level",
    "介面級",
    "API レベル",
    "API 급",
    "API düzeyi",
    "Cấp API"
  ),
  terminology_playground_check_source_rule: terminologyPlaygroundText(
    "规则级",
    "Rule level",
    "規則級",
    "ルールレベル",
    "규칙급",
    "Kural düzeyi",
    "Cấp quy tắc"
  ),
  terminology_playground_check_hit_empty: terminologyPlaygroundText(
    "不翻译（空值）",
    "No translation (empty value)",
    "不翻譯（空值）",
    "翻訳しない（空値）",
    "번역 안 함(빈 값)",
    "Çevrilmez (boş değer)",
    "Không dịch (giá trị rỗng)"
  ),
  terminology_playground_check_hit_not_covered: terminologyPlaygroundText(
    "例句未覆盖",
    "Not covered by the example",
    "例未覆蓋",
    "例文でカバーされず",
    "예문 미포함",
    "Örnekte kapsanmıyor",
    "Ví dụ không bao phủ"
  ),
  terminology_playground_check_hit_applied: terminologyPlaygroundText(
    "已应用",
    "Applied",
    "已套用",
    "適用済み",
    "적용됨",
    "Uygulandı",
    "Đã áp dụng"
  ),
  terminology_playground_check_hit_not_applied: terminologyPlaygroundText(
    "未应用",
    "Not applied",
    "未套用",
    "未適用",
    "미적용",
    "Uygulanmadı",
    "Chưa áp dụng"
  ),
  terminology_playground_check_empty_value: terminologyPlaygroundText(
    "（空值）",
    "(empty value)",
    "（空值）",
    "（空値）",
    "(빈 값)",
    "(boş değer)",
    "（giá trị rỗng）"
  ),

  // ── _truncated：截断提示 ────────────────────────────────────────────
  terminology_playground_truncated: terminologyPlaygroundText(
    "…[已省略 {n} 字符]",
    "…[{n} characters omitted]",
    "…[已省略 {n} 字元]",
    "…[{n} 文字省略]",
    "…[{n}자 생략됨]",
    "…[{n} karakter atlandı]",
    "…[{n} ký tự bị lược bỏ]"
  ),

  // ── 诊断提示多语言（Task 5：替换 terms.js 内部硬编码中文直出）────────────
  terminology_playground_diag_empty_source_term: terminologyPlaygroundText(
    "第 {segmentIndex} 段「{segment}」的逗号前没有源术语（空源术语）",
    'Segment {segmentIndex} "{segment}" has no source term before the comma (empty source term)',
    "第 {segmentIndex} 段「{segment}」的逗號前沒有來源術語（空來源術語）",
    "第 {segmentIndex} セグメント「{segment}」のカンマの前にソース用語がありません（空のソース用語）",
    '{segmentIndex}번째 세그먼트 "{segment}"의 쉼표 앞에 소스 용어가 없습니다(빈 소스 용어)',
    'Bölüm {segmentIndex} "{segment}" virgülün önünde kaynak terim içermiyor (boş kaynak terim)',
    'Đoạn {segmentIndex} "{segment}" không có thuật ngữ nguồn trước dấu phẩy (thuật ngữ nguồn trống)'
  ),
  terminology_playground_diag_invalid_regex: terminologyPlaygroundText(
    "第 {segmentIndex} 段「{segment}」无法作为正则解析：{error}",
    'Segment {segmentIndex} "{segment}" cannot be parsed as regex: {error}',
    "第 {segmentIndex} 段「{segment}」無法作為正規表示式解析：{error}",
    "第 {segmentIndex} セグメント「{segment}」を正規表現として解析できません：{error}",
    '{segmentIndex}번째 세그먼트 "{segment}"을(를) 정규식으로 구문 분석할 수 없습니다: {error}',
    'Bölüm {segmentIndex} "{segment}" normal ifade olarak ayrıştırılamıyor: {error}',
    'Đoạn {segmentIndex} "{segment}" không thể phân tích cú pháp dưới dạng biểu thức chính quy: {error}'
  ),
  terminology_playground_diag_empty_matching_pattern: terminologyPlaygroundText(
    "第 {segmentIndex} 段「{segment}」的正则可匹配空字符串（{key}），会在任意位置注入译文导致错乱，请改用非空匹配的正则",
    'Segment {segmentIndex} "{segment}" has a regex that matches empty strings ({key}), which injects translations everywhere; please use a non-empty matching regex',
    "第 {segmentIndex} 段「{segment}」的正規表示式可匹配空字串（{key}），會在任意位置注入譯文導致錯亂，請改用非空匹配的正規表示式",
    "第 {segmentIndex} セグメント「{segment}」の正規表現は空文字列に一致します（{key}）。任意の位置に訳文が注入されて乱れが生じるため、非空に一致する正規表現に変更してください",
    '{segmentIndex}번째 세그먼트 "{segment}"의 정규식이 빈 문자열과 일치합니다({key}). 임의 위치에 번역이 삽입되어 오류가 발생하므로 비어 있지 않은 문자열과 일치하는 정규식으로 변경하세요',
    'Bölüm {segmentIndex} "{segment}" normal ifadesi boş dizeyle eşleşiyor ({key}), her yere çeviri enjekte eder; lütfen boş olmayan bir eşleşme ifadesi kullanın',
    'Biểu thức chính quy ở đoạn {segmentIndex} "{segment}" khớp với chuỗi rỗng ({key}), có thể chèn bản dịch ở mọi vị trí gây lỗi; vui lòng đổi sang biểu thức khớp chuỗi không rỗng'
  ),
  terminology_playground_diag_conflicting_mapping: terminologyPlaygroundText(
    "第 {segmentIndex} 段「{segment}」与第 {prevIndex} 段「{key},{prevValue}」同源但译文不同（冲突映射）",
    'Segment {segmentIndex} "{segment}" shares the source with segment {prevIndex} "{key},{prevValue}" but has a different translation (conflicting mapping)',
    "第 {segmentIndex} 段「{segment}」與第 {prevIndex} 段「{key},{prevValue}」同源但譯文不同（衝突對應）",
    "第 {segmentIndex} セグメント「{segment}」は第 {prevIndex} セグメント「{key},{prevValue}」と同じソースですが訳文が異なります（競合マッピング）",
    '{segmentIndex}번째 세그먼트 "{segment}"은(는) {prevIndex}번째 세그먼트 "{key},{prevValue}"와(과) 소스는 같으나 번역이 다릅니다(충돌 매핑)',
    'Bölüm {segmentIndex} "{segment}", bölüm {prevIndex} "{key},{prevValue}" ile aynı kaynağa sahip ancak çevirisi farklı (çakışan eşleme)',
    'Đoạn {segmentIndex} "{segment}" có cùng nguồn với đoạn {prevIndex} "{key},{prevValue}" nhưng bản dịch khác nhau (ánh xạ xung đột)'
  ),
  terminology_playground_diag_conflicting_pattern: terminologyPlaygroundText(
    "第 {segmentIndexA} 段「{keyA}」与第 {segmentIndexB} 段「{keyB}」的正则同时命中同一原文「{literal}」（冲突映射），请转义或统一术语写法",
    'Segment {segmentIndexA} "{keyA}" and segment {segmentIndexB} "{keyB}" regexes both match the same text "{literal}" (conflicting mapping); please escape or standardize',
    "第 {segmentIndexA} 段「{keyA}」與第 {segmentIndexB} 段「{keyB}」的正規表示式同時命中同一原文「{literal}」（衝突對應），請跳脫或統一術語寫法",
    "第 {segmentIndexA} セグメント「{keyA}」と第 {segmentIndexB} セグメント「{keyB}」の正規表現が同じ原文「{literal}」に同時に一致します（競合マッピング）。エスケープするか表記を統一してください",
    '{segmentIndexA}번째 세그먼트 "{keyA}"와(과) {segmentIndexB}번째 세그먼트 "{keyB}"의 정규식이 동일한 원문 "{literal}"과(과) 동시에 일치합니다(충돌 매핑). 이스케이프하거나 표기를 통일하세요',
    'Bölüm {segmentIndexA} "{keyA}" ve bölüm {segmentIndexB} "{keyB}" normal ifadeleri aynı metinle "{literal}" eşleşiyor (çakışan eşleme); lütfen kaçışlayın veya birleştirin',
    'Biểu thức chính quy ở đoạn {segmentIndexA} "{keyA}" và đoạn {segmentIndexB} "{keyB}" đều khớp cùng văn bản gốc "{literal}" (ánh xạ xung đột); vui lòng thoát ký tự hoặc thống nhất cách viết'
  ),
  terminology_playground_diag_zero_width_matching_pattern:
    terminologyPlaygroundText(
      "第 {segmentIndex} 段「{segment}」的正则不消费任何字符（{key}），会在原文任意位置零宽注入译文导致错乱，请改用消费字符的正则",
      'Segment {segmentIndex} "{segment}" has a regex that consumes no characters ({key}), which injects translations at arbitrary positions of the text; please use a character-consuming regex',
      "第 {segmentIndex} 段「{segment}」的正規表示式不消費任何字元（{key}），會在原文任意位置零寬注入譯文導致錯亂，請改用消費字元的正規表示式",
      "第 {segmentIndex} セグメント「{segment}」の正規表現は文字を一切消費しません（{key}）。原文の任意の位置に幅ゼロで訳文が注入され崩れるため、文字を消費する正規表現に変更してください",
      '{segmentIndex}번째 세그먼트 "{segment}"의 정규식은 문자를 전혀 소비하지 않습니다({key}). 원문의 임의 위치에 폭 0으로 번역이 삽입되어 깨지므로 문자를 소비하는 정규식으로 변경하세요',
      'Bölüm {segmentIndex} "{segment}" normal ifadesi hiçbir karakter tüketmiyor ({key}); metnin rastgele konumlarına sıfır genişlikte çeviri enjekte ederek bozar. Lütfen karakter tüketen bir ifade kullanın',
      'Biểu thức chính quy ở đoạn {segmentIndex} "{segment}" không tiêu thụ ký tự nào ({key}), sẽ chèn bản dịch vào vị trí tùy ý của văn bản khiến lỗi; vui lòng dùng biểu thức có tiêu thụ ký tự'
    ),
};
