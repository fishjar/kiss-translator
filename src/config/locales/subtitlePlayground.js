/**
 * @file subtitlePlayground.js
 * @description 字幕断句演练场多语言文案字典
 */

const subtitlePlaygroundText = (zh, en, zh_TW, ja, ko, tr, vi) => ({
  zh,
  en,
  zh_TW,
  ja,
  ko,
  tr,
  vi,
});

export const SUBTITLE_PLAYGROUND_I18N = {
  playground_text_translation: subtitlePlaygroundText(
    "文本翻译",
    "Text translation",
    "文字翻譯",
    "テキスト翻訳",
    "텍스트 번역",
    "Metin çevirisi",
    "Dịch văn bản"
  ),
  playground_translation_config_title: subtitlePlaygroundText(
    "翻译配置",
    "Translation setup",
    "翻譯設定",
    "翻訳設定",
    "번역 설정",
    "Çeviri ayarları",
    "Thiết lập bản dịch"
  ),
  playground_translation_config_description: subtitlePlaygroundText(
    "选择本次测试使用的服务、语言和辅助工具",
    "Choose the services, languages, and helpers for this test",
    "選擇本次測試使用的服務、語言和輔助工具",
    "このテストで使用するサービス、言語、補助機能を選択",
    "이 테스트에 사용할 서비스, 언어 및 보조 도구 선택",
    "Bu test için hizmetleri, dilleri ve yardımcıları seçin",
    "Chọn dịch vụ, ngôn ngữ và công cụ hỗ trợ cho lần thử này"
  ),
  playground_translation_empty_result: subtitlePlaygroundText(
    "输入原文后，译文将在这里显示",
    "Enter source text to see the translation here",
    "輸入原文後，譯文會顯示在這裡",
    "原文を入力すると、ここに翻訳が表示されます",
    "원문을 입력하면 여기에 번역이 표시됩니다",
    "Kaynak metni girin; çeviri burada görünecek",
    "Nhập văn bản nguồn để xem bản dịch tại đây"
  ),
  playground_translation_select_service: subtitlePlaygroundText(
    "请先选择至少一个可用的翻译服务",
    "Select at least one available translation service",
    "請先選擇至少一個可用的翻譯服務",
    "利用可能な翻訳サービスを1つ以上選択してください",
    "사용 가능한 번역 서비스를 하나 이상 선택하세요",
    "En az bir kullanılabilir çeviri hizmeti seçin",
    "Chọn ít nhất một dịch vụ dịch khả dụng"
  ),
  playground_merge_single_line_breaks: subtitlePlaygroundText(
    "合并单个换行（保留段落）",
    "Merge single line breaks (preserve paragraphs)",
    "合併單個換行（保留段落）",
    "単一改行を結合（段落は保持）",
    "단일 줄바꿈 병합(문단 유지)",
    "Tek satır sonlarını birleştir (paragrafları koru)",
    "Gộp ngắt dòng đơn (giữ đoạn)"
  ),
  subtitle_segmentation: subtitlePlaygroundText(
    "字幕断句",
    "Subtitle segmentation",
    "字幕斷句",
    "字幕分割",
    "자막 분할",
    "Altyazı bölümleme",
    "Phân đoạn phụ đề"
  ),
  subtitle_playground_invalid_events: subtitlePlaygroundText(
    "字幕文件没有有效的 events 数组",
    "The subtitle file has no valid events array",
    "字幕檔案沒有有效的 events 陣列",
    "字幕ファイルに有効な events 配列がありません",
    "자막 파일에 유효한 events 배열이 없습니다",
    "Altyazı dosyasında geçerli bir events dizisi yok",
    "Tệp phụ đề không có mảng events hợp lệ"
  ),
  subtitle_playground_event_limit: subtitlePlaygroundText(
    "字幕事件数量不能超过 {max}",
    "Subtitle events cannot exceed {max}",
    "字幕事件數量不能超過 {max}",
    "字幕イベント数は {max} を超えられません",
    "자막 이벤트 수는 {max}개를 초과할 수 없습니다",
    "Altyazı olayı sayısı {max} değerini aşamaz",
    "Số sự kiện phụ đề không được vượt quá {max}"
  ),
  subtitle_playground_missing_segments: subtitlePlaygroundText(
    "字幕文件缺少 YouTube json3 的 segs 数据",
    "The subtitle file is missing YouTube json3 segs data",
    "字幕檔案缺少 YouTube json3 的 segs 資料",
    "字幕ファイルに YouTube json3 の segs データがありません",
    "자막 파일에 YouTube json3 segs 데이터가 없습니다",
    "Altyazı dosyasında YouTube json3 segs verisi yok",
    "Tệp phụ đề thiếu dữ liệu segs YouTube json3"
  ),
  subtitle_playground_remote_size_invalid: subtitlePlaygroundText(
    "远程字幕样本大小校验失败",
    "Remote subtitle sample size validation failed",
    "遠端字幕樣本大小驗證失敗",
    "リモート字幕サンプルのサイズ検証に失敗しました",
    "원격 자막 샘플 크기 검증에 실패했습니다",
    "Uzak altyazı örneği boyut doğrulaması başarısız",
    "Xác thực kích thước mẫu phụ đề từ xa thất bại"
  ),
  subtitle_playground_remote_hash_invalid: subtitlePlaygroundText(
    "远程字幕样本哈希校验失败",
    "Remote subtitle sample hash validation failed",
    "遠端字幕樣本雜湊驗證失敗",
    "リモート字幕サンプルのハッシュ検証に失敗しました",
    "원격 자막 샘플 해시 검증에 실패했습니다",
    "Uzak altyazı örneği karma doğrulaması başarısız",
    "Xác thực hash mẫu phụ đề từ xa thất bại"
  ),
  subtitle_playground_remote_index_failed: subtitlePlaygroundText(
    "远程字幕样本索引加载失败，可以继续上传本地 JSON",
    "Failed to load the remote sample index. You can still upload a local JSON file",
    "遠端字幕樣本索引載入失敗，仍可上傳本機 JSON",
    "リモート字幕サンプルの索引を読み込めませんでした。ローカル JSON は引き続きアップロードできます",
    "원격 자막 샘플 색인을 불러오지 못했습니다. 로컬 JSON은 계속 업로드할 수 있습니다",
    "Uzak örnek dizini yüklenemedi. Yerel bir JSON dosyası yükleyebilirsiniz",
    "Không tải được chỉ mục mẫu từ xa. Bạn vẫn có thể tải lên tệp JSON cục bộ"
  ),
  subtitle_playground_sample_load_failed: subtitlePlaygroundText(
    "字幕样本加载失败：{message}",
    "Failed to load subtitle sample: {message}",
    "字幕樣本載入失敗：{message}",
    "字幕サンプルの読み込みに失敗しました：{message}",
    "자막 샘플을 불러오지 못했습니다: {message}",
    "Altyazı örneği yüklenemedi: {message}",
    "Không tải được mẫu phụ đề: {message}"
  ),
  subtitle_playground_file_too_large: subtitlePlaygroundText(
    "字幕文件不能超过 10MB",
    "The subtitle file cannot exceed 10 MB",
    "字幕檔案不能超過 10MB",
    "字幕ファイルは 10 MB を超えられません",
    "자막 파일은 10MB를 초과할 수 없습니다",
    "Altyazı dosyası 10 MB'ı aşamaz",
    "Tệp phụ đề không được vượt quá 10 MB"
  ),
  subtitle_playground_file_parse_failed: subtitlePlaygroundText(
    "字幕文件解析失败：{message}",
    "Failed to parse subtitle file: {message}",
    "字幕檔案解析失敗：{message}",
    "字幕ファイルの解析に失敗しました：{message}",
    "자막 파일을 분석하지 못했습니다: {message}",
    "Altyazı dosyası ayrıştırılamadı: {message}",
    "Không phân tích được tệp phụ đề: {message}"
  ),
  subtitle_playground_ai_confirm_title: subtitlePlaygroundText(
    "发送 AI 断句请求",
    "Send AI segmentation requests",
    "傳送 AI 斷句請求",
    "AI 字幕分割リクエストを送信",
    "AI 자막 분할 요청 보내기",
    "AI bölümleme isteklerini gönder",
    "Gửi yêu cầu phân đoạn AI"
  ),
  subtitle_playground_ai_confirm_message: subtitlePlaygroundText(
    "将使用 {api} / {model} 发送约 {count} 个字幕请求。样本文本会发送到当前 AI 服务。",
    "About {count} subtitle requests will be sent using {api} / {model}. The sample text will be sent to the current AI service.",
    "將使用 {api} / {model} 傳送約 {count} 個字幕請求。樣本文字會傳送到目前的 AI 服務。",
    "{api} / {model} を使用して約 {count} 件の字幕リクエストを送信します。サンプルテキストは現在の AI サービスに送信されます。",
    "{api} / {model}을 사용해 약 {count}개의 자막 요청을 보냅니다. 샘플 텍스트가 현재 AI 서비스로 전송됩니다.",
    "{api} / {model} kullanılarak yaklaşık {count} altyazı isteği gönderilecek. Örnek metin mevcut AI hizmetine gönderilecektir.",
    "Khoảng {count} yêu cầu phụ đề sẽ được gửi bằng {api} / {model}. Văn bản mẫu sẽ được gửi đến dịch vụ AI hiện tại."
  ),
  subtitle_playground_default_model: subtitlePlaygroundText(
    "默认模型",
    "Default model",
    "預設模型",
    "既定のモデル",
    "기본 모델",
    "Varsayılan model",
    "Mô hình mặc định"
  ),
  subtitle_playground_continue: subtitlePlaygroundText(
    "继续",
    "Continue",
    "繼續",
    "続行",
    "계속",
    "Devam",
    "Tiếp tục"
  ),
  subtitle_playground_test_failed: subtitlePlaygroundText(
    "字幕断句失败：{message}",
    "Subtitle segmentation failed: {message}",
    "字幕斷句失敗：{message}",
    "字幕分割に失敗しました：{message}",
    "자막 분할에 실패했습니다: {message}",
    "Altyazı bölümleme başarısız: {message}",
    "Phân đoạn phụ đề thất bại: {message}"
  ),
  subtitle_playground_prompt_global: subtitlePlaygroundText(
    "全局字幕设置",
    "Global subtitle settings",
    "全域字幕設定",
    "グローバル字幕設定",
    "전역 자막 설정",
    "Genel altyazı ayarları",
    "Cài đặt phụ đề toàn cục"
  ),
  subtitle_playground_prompt_preset: subtitlePlaygroundText(
    "接口预设",
    "API preset",
    "介面預設",
    "API プリセット",
    "API 프리셋",
    "API ön ayarı",
    "Cài sẵn API"
  ),
  subtitle_playground_prompt_custom: subtitlePlaygroundText(
    "接口自定义",
    "API custom",
    "介面自訂",
    "API カスタム",
    "API 사용자 지정",
    "Özel API",
    "API tùy chỉnh"
  ),
  subtitle_playground_config_title: subtitlePlaygroundText(
    "当前生效的断句配置",
    "Active segmentation configuration",
    "目前生效的斷句設定",
    "現在有効な字幕分割設定",
    "현재 적용 중인 자막 분할 설정",
    "Etkin bölümleme yapılandırması",
    "Cấu hình phân đoạn đang hoạt động"
  ),
  subtitle_playground_mode: subtitlePlaygroundText(
    "模式",
    "Mode",
    "模式",
    "モード",
    "모드",
    "Mod",
    "Chế độ"
  ),
  subtitle_playground_api: subtitlePlaygroundText(
    "API",
    "API",
    "API",
    "API",
    "API",
    "API",
    "API"
  ),
  subtitle_playground_type_model: subtitlePlaygroundText(
    "类型 / 模型",
    "Type / model",
    "類型 / 模型",
    "タイプ / モデル",
    "유형 / 모델",
    "Tür / model",
    "Loại / mô hình"
  ),
  subtitle_playground_prompt: subtitlePlaygroundText(
    "提示词",
    "Prompt",
    "提示詞",
    "プロンプト",
    "프롬프트",
    "İstem",
    "Lời nhắc"
  ),
  subtitle_playground_api_default: subtitlePlaygroundText(
    "接口默认",
    "API default",
    "介面預設",
    "API の既定値",
    "API 기본값",
    "API varsayılanı",
    "Mặc định API"
  ),
  subtitle_playground_prompt_value: subtitlePlaygroundText(
    "{prompt}（{source}）",
    "{prompt} ({source})",
    "{prompt}（{source}）",
    "{prompt}（{source}）",
    "{prompt} ({source})",
    "{prompt} ({source})",
    "{prompt} ({source})"
  ),
  subtitle_playground_chunk_length: subtitlePlaygroundText(
    "Chunk 长度",
    "Chunk length",
    "Chunk 長度",
    "チャンク長",
    "청크 길이",
    "Parça uzunluğu",
    "Độ dài đoạn"
  ),
  subtitle_playground_estimated_chunks: subtitlePlaygroundText(
    "预计 Chunk",
    "Estimated chunks",
    "預估 Chunk",
    "推定チャンク数",
    "예상 청크 수",
    "Tahmini parça sayısı",
    "Số đoạn ước tính"
  ),
  subtitle_playground_target_language: subtitlePlaygroundText(
    "目标语言",
    "Target language",
    "目標語言",
    "翻訳先言語",
    "대상 언어",
    "Hedef dil",
    "Ngôn ngữ đích"
  ),
  subtitle_playground_streaming: subtitlePlaygroundText(
    "流式",
    "Streaming",
    "串流",
    "ストリーミング",
    "스트리밍",
    "Akış",
    "Truyền trực tuyến"
  ),
  subtitle_playground_enabled: subtitlePlaygroundText(
    "启用",
    "Enabled",
    "啟用",
    "有効",
    "사용",
    "Etkin",
    "Đã bật"
  ),
  subtitle_playground_disabled: subtitlePlaygroundText(
    "关闭",
    "Disabled",
    "關閉",
    "無効",
    "사용 안 함",
    "Devre dışı",
    "Đã tắt"
  ),
  subtitle_playground_protocol: subtitlePlaygroundText(
    "协议",
    "Protocol",
    "協定",
    "プロトコル",
    "프로토콜",
    "Protokol",
    "Giao thức"
  ),
  subtitle_playground_legacy_compatible: subtitlePlaygroundText(
    "兼容旧协议",
    "Legacy protocol compatible",
    "相容舊協定",
    "旧プロトコル互換",
    "이전 프로토콜 호환",
    "Eski protokolle uyumlu",
    "Tương thích giao thức cũ"
  ),
  subtitle_playground_protocol_value: subtitlePlaygroundText(
    "{protocol}（{compatibility}）",
    "{protocol} ({compatibility})",
    "{protocol}（{compatibility}）",
    "{protocol}（{compatibility}）",
    "{protocol} ({compatibility})",
    "{protocol} ({compatibility})",
    "{protocol} ({compatibility})"
  ),
  subtitle_playground_statistical_mode: subtitlePlaygroundText(
    "统计断句",
    "Statistical segmentation",
    "統計斷句",
    "統計的字幕分割",
    "통계 자막 분할",
    "İstatistiksel bölümleme",
    "Phân đoạn thống kê"
  ),
  subtitle_playground_rule_mode: subtitlePlaygroundText(
    "规则断句",
    "Rule-based segmentation",
    "規則斷句",
    "ルールベース字幕分割",
    "규칙 기반 자막 분할",
    "Kural tabanlı bölümleme",
    "Phân đoạn theo quy tắc"
  ),
  subtitle_playground_max_duration: subtitlePlaygroundText(
    "最大时长",
    "Maximum duration",
    "最長時長",
    "最大時間",
    "최대 길이",
    "Azami süre",
    "Thời lượng tối đa"
  ),
  subtitle_playground_max_words: subtitlePlaygroundText(
    "最大词数",
    "Maximum words",
    "最多詞數",
    "最大単語数",
    "최대 단어 수",
    "Azami kelime",
    "Số từ tối đa"
  ),
  subtitle_playground_min_boundary_score: subtitlePlaygroundText(
    "最小边界评分",
    "Minimum boundary score",
    "最小邊界分數",
    "最小境界スコア",
    "최소 경계 점수",
    "Asgari sınır puanı",
    "Điểm ranh giới tối thiểu"
  ),
  subtitle_playground_min_sentence_words: subtitlePlaygroundText(
    "最小句子词数",
    "Minimum sentence words",
    "最少句子詞數",
    "文の最小単語数",
    "문장 최소 단어 수",
    "Asgari cümle kelimesi",
    "Số từ câu tối thiểu"
  ),
  subtitle_playground_source_language: subtitlePlaygroundText(
    "源语言",
    "Source language",
    "來源語言",
    "元言語",
    "원본 언어",
    "Kaynak dil",
    "Ngôn ngữ nguồn"
  ),
  subtitle_playground_source_language_label: subtitlePlaygroundText(
    "字幕源语言",
    "Subtitle source language",
    "字幕來源語言",
    "字幕の元言語",
    "자막 원본 언어",
    "Altyazı kaynak dili",
    "Ngôn ngữ nguồn phụ đề"
  ),
  subtitle_playground_language_required: subtitlePlaygroundText(
    "规则和统计断句不支持 AutoDetect，请选择具体的字幕源语言。",
    "Rule-based and statistical segmentation do not support AutoDetect. Select a specific subtitle source language.",
    "規則和統計斷句不支援 AutoDetect，請選擇具體的字幕來源語言。",
    "ルールおよび統計的字幕分割では AutoDetect を使用できません。字幕の元言語を選択してください。",
    "규칙 및 통계 자막 분할은 AutoDetect를 지원하지 않습니다. 자막 원본 언어를 선택하세요.",
    "Kural tabanlı ve istatistiksel bölümleme AutoDetect'i desteklemez. Belirli bir altyazı kaynak dili seçin.",
    "Phân đoạn theo quy tắc và thống kê không hỗ trợ Tự động phát hiện. Hãy chọn ngôn ngữ nguồn phụ đề cụ thể."
  ),
  subtitle_playground_long_sentence_threshold: subtitlePlaygroundText(
    "长句阈值",
    "Long-sentence threshold",
    "長句門檻",
    "長文しきい値",
    "긴 문장 임계값",
    "Uzun cümle eşiği",
    "Ngưỡng câu dài"
  ),
  subtitle_playground_chunk_risk: subtitlePlaygroundText(
    "当前 AI Chunk 长度高于推荐默认值 1000，长输入可能增加漏句或边界退化风险。",
    "The current AI chunk length exceeds the recommended default of 1000. Long input may increase the risk of missing text or degraded boundaries.",
    "目前 AI Chunk 長度高於建議預設值 1000，長輸入可能增加漏句或邊界退化風險。",
    "現在の AI チャンク長は推奨既定値 1000 を超えています。長い入力では文の欠落や境界精度低下のリスクが高まります。",
    "현재 AI 청크 길이가 권장 기본값 1000보다 큽니다. 긴 입력은 문장 누락이나 경계 품질 저하 위험을 높일 수 있습니다.",
    "Geçerli AI parça uzunluğu önerilen varsayılan 1000 değerini aşıyor. Uzun girdiler eksik metin veya sınır kalitesi düşüşü riskini artırabilir.",
    "Độ dài đoạn AI hiện tại vượt quá mặc định khuyến nghị 1000. Đầu vào dài có thể tăng rủi ro thiếu văn bản hoặc suy giảm ranh giới."
  ),
  subtitle_playground_builtin_sample: subtitlePlaygroundText(
    "内置字幕样本",
    "Built-in subtitle sample",
    "內建字幕樣本",
    "内蔵字幕サンプル",
    "내장 자막 샘플",
    "Yerleşik altyazı örneği",
    "Mẫu phụ đề tích hợp"
  ),
  subtitle_playground_select_sample: subtitlePlaygroundText(
    "请选择远程样本",
    "Select a remote sample",
    "請選擇遠端樣本",
    "リモートサンプルを選択",
    "원격 샘플을 선택하세요",
    "Uzak bir örnek seçin",
    "Chọn mẫu từ xa"
  ),
  subtitle_playground_upload_json: subtitlePlaygroundText(
    "上传 JSON",
    "Upload JSON",
    "上傳 JSON",
    "JSON をアップロード",
    "JSON 업로드",
    "JSON yükle",
    "Tải lên JSON"
  ),
  subtitle_playground_run: subtitlePlaygroundText(
    "运行测试",
    "Run test",
    "執行測試",
    "テストを実行",
    "테스트 실행",
    "Testi çalıştır",
    "Chạy kiểm tra"
  ),
  subtitle_playground_progress: subtitlePlaygroundText(
    "正在处理 Chunk {completed}/{total}",
    "Processing chunk {completed}/{total}",
    "正在處理 Chunk {completed}/{total}",
    "チャンク {completed}/{total} を処理中",
    "청크 처리 중 {completed}/{total}",
    "Parça işleniyor {completed}/{total}",
    "Đang xử lý đoạn {completed}/{total}"
  ),
  subtitle_playground_source_json: subtitlePlaygroundText(
    "原始字幕 JSON",
    "Original subtitle JSON",
    "原始字幕 JSON",
    "元の字幕 JSON",
    "원본 자막 JSON",
    "Orijinal altyazı JSON",
    "JSON phụ đề gốc"
  ),
  subtitle_playground_result: subtitlePlaygroundText(
    "断句结果",
    "Segmentation result",
    "斷句結果",
    "字幕分割結果",
    "자막 분할 결과",
    "Bölümleme sonucu",
    "Kết quả phân đoạn"
  ),
  subtitle_playground_result_format: subtitlePlaygroundText(
    "结果格式",
    "Result format",
    "結果格式",
    "結果形式",
    "결과 형식",
    "Sonuç biçimi",
    "Định dạng kết quả"
  ),
  subtitle_playground_download: subtitlePlaygroundText(
    "下载",
    "Download",
    "下載",
    "ダウンロード",
    "다운로드",
    "İndir",
    "Tải xuống"
  ),
  subtitle_playground_stats_title: subtitlePlaygroundText(
    "断句统计信息",
    "Segmentation statistics",
    "斷句統計資訊",
    "字幕分割の統計",
    "자막 분할 통계",
    "Bölümleme istatistikleri",
    "Thống kê phân đoạn"
  ),
  subtitle_playground_metric_processing: subtitlePlaygroundText(
    "处理耗时",
    "Processing time",
    "處理耗時",
    "処理時間",
    "처리 시간",
    "İşleme süresi",
    "Thời gian xử lý"
  ),
  subtitle_playground_metric_raw_events: subtitlePlaygroundText(
    "原始事件",
    "Raw events",
    "原始事件",
    "元イベント",
    "원본 이벤트",
    "Ham olaylar",
    "Sự kiện thô"
  ),
  subtitle_playground_metric_canonical_events: subtitlePlaygroundText(
    "规范化事件",
    "Canonical events",
    "正規化事件",
    "正規化イベント",
    "정규화 이벤트",
    "Standart olaylar",
    "Sự kiện chuẩn hóa"
  ),
  subtitle_playground_metric_flat_events: subtitlePlaygroundText(
    "Flat Events",
    "Flat events",
    "Flat Events",
    "フラットイベント",
    "플랫 이벤트",
    "Düz olaylar",
    "Sự kiện phẳng"
  ),
  subtitle_playground_metric_filtered_non_speech: subtitlePlaygroundText(
    "已过滤非语音片段",
    "Filtered non-speech segments",
    "已過濾非語音片段",
    "除外した非音声区間",
    "필터링된 비음성 구간",
    "Filtrelenen konuşma dışı bölümler",
    "Đã lọc đoạn không phải lời nói"
  ),
  subtitle_playground_metric_cues: subtitlePlaygroundText(
    "字幕条目",
    "Subtitle cues",
    "字幕項目",
    "字幕キュー",
    "자막 큐",
    "Altyazı öğeleri",
    "Mục phụ đề"
  ),
  subtitle_playground_metric_source_duration: subtitlePlaygroundText(
    "源时间跨度",
    "Source duration",
    "來源時間跨度",
    "元の時間範囲",
    "원본 시간 범위",
    "Kaynak süresi",
    "Thời lượng nguồn"
  ),
  subtitle_playground_metric_covered_duration: subtitlePlaygroundText(
    "覆盖时长",
    "Covered duration",
    "涵蓋時長",
    "カバー時間",
    "포함 시간",
    "Kapsanan süre",
    "Thời lượng bao phủ"
  ),
  subtitle_playground_metric_text_coverage: subtitlePlaygroundText(
    "文本覆盖率",
    "Text coverage",
    "文字涵蓋率",
    "テキスト網羅率",
    "텍스트 포함률",
    "Metin kapsamı",
    "Độ bao phủ văn bản"
  ),
  subtitle_playground_metric_empty_cues: subtitlePlaygroundText(
    "空字幕",
    "Empty cues",
    "空字幕",
    "空の字幕",
    "빈 자막",
    "Boş altyazılar",
    "Mục trống"
  ),
  subtitle_playground_metric_invalid_cues: subtitlePlaygroundText(
    "无效字幕",
    "Invalid cues",
    "無效字幕",
    "無効な字幕",
    "유효하지 않은 자막",
    "Geçersiz altyazılar",
    "Mục không hợp lệ"
  ),
  subtitle_playground_metric_overlaps: subtitlePlaygroundText(
    "时间重叠",
    "Time overlaps",
    "時間重疊",
    "時間の重複",
    "시간 겹침",
    "Zaman çakışmaları",
    "Trùng lặp thời gian"
  ),
  subtitle_playground_metric_non_monotonic: subtitlePlaygroundText(
    "时间倒退",
    "Non-monotonic time",
    "時間倒退",
    "時間の逆行",
    "시간 역행",
    "Geri giden zaman",
    "Thời gian không đơn điệu"
  ),
  subtitle_playground_metric_missing_text: subtitlePlaygroundText(
    "文本遗漏",
    "Missing text",
    "文字遺漏",
    "欠落テキスト",
    "누락 텍스트",
    "Eksik metin",
    "Văn bản thiếu"
  ),
  subtitle_playground_metric_duplicated_text: subtitlePlaygroundText(
    "文本重复",
    "Duplicated text",
    "文字重複",
    "重複テキスト",
    "중복 텍스트",
    "Yinelenen metin",
    "Văn bản trùng lặp"
  ),
  subtitle_playground_metric_avg_chars: subtitlePlaygroundText(
    "平均字符",
    "Average characters",
    "平均字元",
    "平均文字数",
    "평균 문자 수",
    "Ortalama karakter",
    "Ký tự trung bình"
  ),
  subtitle_playground_metric_p95_chars: subtitlePlaygroundText(
    "P95 字符",
    "P95 characters",
    "P95 字元",
    "P95 文字数",
    "P95 문자 수",
    "P95 karakter",
    "Ký tự P95"
  ),
  subtitle_playground_metric_max_chars: subtitlePlaygroundText(
    "最大字符",
    "Maximum characters",
    "最多字元",
    "最大文字数",
    "최대 문자 수",
    "Azami karakter",
    "Ký tự tối đa"
  ),
  subtitle_playground_metric_avg_words: subtitlePlaygroundText(
    "平均词数",
    "Average words",
    "平均詞數",
    "平均単語数",
    "평균 단어 수",
    "Ortalama kelime",
    "Số từ trung bình"
  ),
  subtitle_playground_metric_p95_words: subtitlePlaygroundText(
    "P95 词数",
    "P95 words",
    "P95 詞數",
    "P95 単語数",
    "P95 단어 수",
    "P95 kelime",
    "Số từ P95"
  ),
  subtitle_playground_metric_max_words: subtitlePlaygroundText(
    "最大词数",
    "Maximum words",
    "最多詞數",
    "最大単語数",
    "최대 단어 수",
    "Azami kelime",
    "Số từ tối đa"
  ),
  subtitle_playground_metric_avg_duration: subtitlePlaygroundText(
    "平均时长",
    "Average duration",
    "平均時長",
    "平均時間",
    "평균 길이",
    "Ortalama süre",
    "Thời lượng trung bình"
  ),
  subtitle_playground_metric_p95_duration: subtitlePlaygroundText(
    "P95 时长",
    "P95 duration",
    "P95 時長",
    "P95 時間",
    "P95 길이",
    "P95 süre",
    "Thời lượng P95"
  ),
  subtitle_playground_metric_max_duration: subtitlePlaygroundText(
    "最大时长",
    "Maximum duration",
    "最長時長",
    "最大時間",
    "최대 길이",
    "Azami süre",
    "Thời lượng tối đa"
  ),
  subtitle_playground_structure_error: subtitlePlaygroundText(
    "结构错误：{errors}",
    "Structure errors: {errors}",
    "結構錯誤：{errors}",
    "構造エラー：{errors}",
    "구조 오류: {errors}",
    "Yapı hataları: {errors}",
    "Lỗi cấu trúc: {errors}"
  ),
  subtitle_playground_readability_warning: subtitlePlaygroundText(
    "可读性警告：超长文本 {longText}，超过 10 秒 {longDuration}，短碎片 {fragments}，泄漏的非语音字幕 {nonSpeech}",
    "Readability warnings: long text {longText}, over 10 seconds {longDuration}, short fragments {fragments}, leaked non-speech cues {nonSpeech}",
    "可讀性警告：過長文字 {longText}，超過 10 秒 {longDuration}，短片段 {fragments}，洩漏的非語音字幕 {nonSpeech}",
    "可読性の警告：長すぎるテキスト {longText}、10 秒超 {longDuration}、短い断片 {fragments}、混入した非音声字幕 {nonSpeech}",
    "가독성 경고: 너무 긴 텍스트 {longText}, 10초 초과 {longDuration}, 짧은 조각 {fragments}, 유출된 비음성 자막 {nonSpeech}",
    "Okunabilirlik uyarıları: uzun metin {longText}, 10 saniyeyi aşan {longDuration}, kısa parçalar {fragments}, sızan konuşma dışı altyazılar {nonSpeech}",
    "Cảnh báo khả đọc: văn bản dài {longText}, trên 10 giây {longDuration}, đoạn ngắn {fragments}, mục không phải lời nói bị lọt {nonSpeech}"
  ),
  subtitle_playground_ai_stats: subtitlePlaygroundText(
    "AI：协议 {protocol}，Chunk {chunks}，请求 {requests}，重试 {retries}，降级字幕 {fallbacks}，无效响应 {invalid}",
    "AI: protocol {protocol}, chunks {chunks}, requests {requests}, retries {retries}, fallback cues {fallbacks}, invalid responses {invalid}",
    "AI：協定 {protocol}，Chunk {chunks}，請求 {requests}，重試 {retries}，降級字幕 {fallbacks}，無效回應 {invalid}",
    "AI：プロトコル {protocol}、チャンク {chunks}、リクエスト {requests}、再試行 {retries}、フォールバック字幕 {fallbacks}、無効な応答 {invalid}",
    "AI: 프로토콜 {protocol}, 청크 {chunks}, 요청 {requests}, 재시도 {retries}, 대체 자막 {fallbacks}, 유효하지 않은 응답 {invalid}",
    "AI: protokol {protocol}, parça {chunks}, istek {requests}, yeniden deneme {retries}, yedek altyazı {fallbacks}, geçersiz yanıt {invalid}",
    "AI: giao thức {protocol}, đoạn {chunks}, yêu cầu {requests}, thử lại {retries}, mục dự phòng {fallbacks}, phản hồi không hợp lệ {invalid}"
  ),
};
