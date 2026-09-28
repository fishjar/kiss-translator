import { PreTrainedTokenizer } from "@huggingface/transformers";

export interface AddedToken {
  id: number;
  content: string;
  lstrip: boolean;
  rstrip: boolean;
  normalized: boolean;
  single_word: boolean;
}

export interface TokenizerJson {
  added_tokens: AddedToken[];
  normalizer: {
    type: string;
    pattern?: { String?: string };
    content?: string;
  } | null;
  pre_tokenizer: {
    type: string;
    replacement?: string;
    prepend_scheme?: string;
    split?: boolean;
  } | null;
  [extra: string]: unknown;
}

export interface TokenizerConfig {
  cls_token?: string | { content: string };
  sep_token?: string | { content: string };
  pad_token?: string | { content: string };
  mask_token?: string | { content: string };
  extra_special_tokens?: unknown;
  tokenizer_class?: string;
  [extra: string]: unknown;
}

export interface TokenizerLike {
  readonly clsToken: string;
  readonly sepToken: string;
  readonly padToken: string;
  readonly maskToken: string;
  readonly clsTokenId: number;
  readonly sepTokenId: number;
  readonly padTokenId: number;
  readonly maskTokenId: number;
  encode(text: string): number[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isWhitespace = (ch: string) => /\p{White_Space}/u.test(ch);

interface AddedTokenInfo {
  id: number;
  lstrip: boolean;
  rstrip: boolean;
}

/**
 * 修正 mmBERT / Gemma checkpoint 中 tokenizer_config.json 的兼容字段：
 * 1. tokenizer_class 归一化为 PreTrainedTokenizerFast
 * 2. extra_special_tokens 列表转为字典
 */
export function normalizeTokenizerConfig(raw: TokenizerConfig): TokenizerConfig {
  const cfg: TokenizerConfig = { ...raw };
  if (
    cfg.tokenizer_class === undefined ||
    cfg.tokenizer_class === null ||
    cfg.tokenizer_class === "TokenizersBackend"
  ) {
    cfg.tokenizer_class = "PreTrainedTokenizerFast";
  }
  if (Array.isArray(cfg.extra_special_tokens)) {
    const mapped: Record<string, unknown> = {};
    cfg.extra_special_tokens.forEach((t, i) => {
      mapped[`extra_${i}`] = t;
    });
    cfg.extra_special_tokens = mapped;
  }
  // 缺省补齐 Laya Multilingual (mmBERT) 标准特殊 token
  cfg.cls_token ??= "<bos>";
  cfg.sep_token ??= "<eos>";
  cfg.pad_token ??= "<pad>";
  cfg.mask_token ??= "<mask>";
  return cfg;
}

/**
 * 与 Rust `tokenizers` crate 完全对齐的 Metaspace BPE 分词器封装。
 * 解决 `@huggingface/tokenizers` 在处理 `lstrip` added token（如 `<mask>`）时
 * 吞掉前序空白 added token（如 `\n`）的已知差异，确保 63 题 parity 100% 吻合。
 */
export class LayaTokenizer implements TokenizerLike {
  readonly clsToken: string;
  readonly sepToken: string;
  readonly padToken: string;
  readonly maskToken: string;
  readonly clsTokenId: number;
  readonly sepTokenId: number;
  readonly padTokenId: number;
  readonly maskTokenId: number;

  private readonly inner: {
    encode: (
      text: string,
      options?: { add_special_tokens?: boolean }
    ) => { ids: number[] };
    token_to_id: (token: string) => number | undefined;
  };
  private readonly contentPattern: RegExp;
  private readonly addedTokenInfo: Map<string, AddedTokenInfo>;
  private readonly replacement: string;
  private readonly pieceSplitter: RegExp;

  constructor(
    tokenizerJson: TokenizerJson,
    rawTokenizerConfig: TokenizerConfig = {}
  ) {
    const tokenizerConfig = normalizeTokenizerConfig(rawTokenizerConfig);
    const pre = tokenizerJson.pre_tokenizer;
    if (
      pre?.type !== "Metaspace" ||
      pre.prepend_scheme !== "always" ||
      pre.split !== true
    ) {
      throw new Error(
        "LayaTokenizer supports Metaspace(prepend_scheme=always, split=true) tokenizers"
      );
    }
    this.replacement = pre.replacement ?? "▁";
    if ([...this.replacement].length !== 1) {
      throw new Error("Metaspace replacement must be a single character");
    }
    const norm = tokenizerJson.normalizer;
    if (
      norm !== null &&
      (norm.type !== "Replace" ||
        norm.pattern?.String !== " " ||
        norm.content !== this.replacement)
    ) {
      throw new Error(
        'LayaTokenizer supports a null or Replace(" " -> replacement) normalizer'
      );
    }
    if (
      tokenizerJson.added_tokens.some((a) => a.normalized || a.single_word)
    ) {
      throw new Error(
        "LayaTokenizer requires added tokens with normalized=false and single_word=false"
      );
    }

    const pt = new PreTrainedTokenizer(tokenizerJson, tokenizerConfig);
    this.inner = pt._tokenizer as unknown as LayaTokenizer["inner"];

    const added = [...tokenizerJson.added_tokens].sort(
      (a, b) => b.content.length - a.content.length
    );
    this.addedTokenInfo = new Map(
      added.map((a) => [
        a.content,
        { id: a.id, lstrip: a.lstrip, rstrip: a.rstrip },
      ])
    );
    this.contentPattern = new RegExp(
      added.map((a) => escapeRegExp(a.content)).join("|"),
      "gu"
    );
    this.pieceSplitter = new RegExp(
      `${escapeRegExp(this.replacement)}[^${escapeRegExp(this.replacement)}]*`,
      "gu"
    );

    const special = (
      name: "cls_token" | "sep_token" | "pad_token" | "mask_token"
    ): [string, number] => {
      const raw = tokenizerConfig[name];
      const content = typeof raw === "string" ? raw : raw?.content;
      const id =
        content === undefined
          ? undefined
          : (this.addedTokenInfo.get(content)?.id ??
            this.inner.token_to_id(content));
      if (content === undefined || id === undefined) {
        throw new Error(`Tokenizer is missing a valid ${name}`);
      }
      return [content, id];
    };

    [this.clsToken, this.clsTokenId] = special("cls_token");
    [this.sepToken, this.sepTokenId] = special("sep_token");
    [this.padToken, this.padTokenId] = special("pad_token");
    [this.maskToken, this.maskTokenId] = special("mask_token");
  }

  encode(text: string): number[] {
    const ids: number[] = [];
    let last = 0;
    for (const match of this.matchAddedTokens(text)) {
      ids.push(...this.encodeSegment(text.slice(last, match.start)));
      ids.push(match.id);
      last = match.end;
    }
    ids.push(...this.encodeSegment(text.slice(last)));
    return ids;
  }

  private matchAddedTokens(
    text: string
  ): { start: number; end: number; id: number }[] {
    const raw: { start: number; end: number; info: AddedTokenInfo }[] = [];
    for (const m of text.matchAll(this.contentPattern)) {
      const info = this.addedTokenInfo.get(m[0]);
      if (info === undefined) {
        throw new Error("unreachable: contentPattern matched unknown content");
      }
      raw.push({ start: m.index, end: m.index + m[0].length, info });
    }
    const extended: { start: number; end: number; id: number }[] = [];
    let prevEnd = 0;
    for (let i = 0; i < raw.length; i++) {
      const { start: rawStart, end: rawEnd, info } = raw[i]!;
      let start = rawStart;
      let end = rawEnd;
      if (info.lstrip) {
        while (start > prevEnd && isWhitespace(text[start - 1]!)) start--;
      }
      const nextStart = i + 1 < raw.length ? raw[i + 1]!.start : text.length;
      if (info.rstrip) {
        while (end < nextStart && isWhitespace(text[end]!)) end++;
      }
      extended.push({ start, end, id: info.id });
      prevEnd = end;
    }
    return extended;
  }

  private encodeSegment(segment: string): number[] {
    if (segment === "") return [];
    let normalized = segment.replaceAll(" ", this.replacement);
    if (!normalized.startsWith(this.replacement)) {
      normalized = this.replacement + normalized;
    }
    const pieces = normalized.match(this.pieceSplitter) ?? [];
    const ids: number[] = [];
    for (const piece of pieces) {
      ids.push(...this.inner.encode(piece, { add_special_tokens: false }).ids);
    }
    return ids;
  }
}
