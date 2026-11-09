import { pyJson } from "./pyjson";
import { renderOptions } from "./questions";
import type {
  Batch,
  DecisionState,
  InternalQuestion,
  PreparedItem,
  TokenizerLike,
} from "./types";
import { QTYPES } from "./types";

/** 移植 Python `serialize_state`：字符串原样返回，其他对象用 pyJson(ensure_ascii=False) 序列化 */
export function serializeState(state: DecisionState): string {
  return typeof state === "string"
    ? state
    : pyJson(state, { ensureAscii: false });
}

/**
 * 移植 Python `build_prefix`:
 * `[CLS] <type> question: <instructions> [SEP] [MASK] opt0 [MASK] opt1 ... [SEP]`
 * 并严格执行 `headMaxLen` 与单候选项 48 token 预算裁剪规则。
 */
export function buildPrefix(
  tokenizer: TokenizerLike,
  q: InternalQuestion,
  headMaxLen: number
): { ids: number[]; markers: number[] } {
  const mask = tokenizer.maskToken;
  const options = renderOptions(q);
  const ins = q.ins.replaceAll(mask, " ");
  let headIds = tokenizer.encode(`${q.t} question: ${ins}`);
  let optIds = options.map((option) => [
    tokenizer.maskTokenId,
    ...tokenizer.encode(" " + option.replaceAll(mask, " ")).slice(0, 48),
  ]);
  const total = (rows: number[][]) =>
    rows.reduce((n, row) => n + row.length, 0);
  let optBudget = headMaxLen - total(optIds);
  if (optBudget < 16) {
    const per = Math.max(
      4,
      Math.floor((headMaxLen - 16) / Math.max(1, optIds.length))
    );
    optIds = optIds.map((row) => row.slice(0, per));
    optBudget = headMaxLen - total(optIds);
  }
  headIds = headIds.slice(0, Math.max(8, optBudget));
  const ids = [tokenizer.clsTokenId, ...headIds, tokenizer.sepTokenId];
  const markers: number[] = [];
  for (const row of optIds) {
    markers.push(ids.length);
    ids.push(...row);
  }
  ids.push(tokenizer.sepTokenId);
  return { ids, markers };
}

/** 移植 Python `build_sequence`：prefix + state tokens + [SEP]，最大长度 maxLen */
export function buildSequence(
  tokenizer: TokenizerLike,
  state: DecisionState,
  q: InternalQuestion,
  maxLen: number,
  headMaxLen: number
): PreparedItem {
  const prefix = buildPrefix(tokenizer, q, headMaxLen);
  const room = Math.max(0, maxLen - prefix.ids.length - 1);
  const stateIds = tokenizer
    .encode(serializeState(state).replaceAll(tokenizer.maskToken, " "))
    .slice(0, room);
  const ids = [...prefix.ids, ...stateIds, tokenizer.sepTokenId].slice(
    0,
    maxLen
  );
  return {
    ids,
    markers: prefix.markers.filter((m) => m < maxLen),
    qtype: QTYPES[q.t],
  };
}

/** 移植 Python `collate_items`：打包成 int64 / bool 张量输入（最少 2 个 marker 槽位） */
export function collate(items: PreparedItem[], padId: number): Batch {
  if (items.length === 0) throw new Error("Cannot collate an empty batch");
  const rows = items.length;
  const length = items.reduce((max, item) => Math.max(max, item.ids.length), 0);
  const markers = items.reduce(
    (max, item) => Math.max(max, item.markers.length),
    2
  );
  const batch: Batch = {
    rows,
    length,
    markers,
    inputIds: new BigInt64Array(rows * length).fill(BigInt(padId)),
    attentionMask: new BigInt64Array(rows * length),
    markerPos: new BigInt64Array(rows * markers),
    markerMask: new Uint8Array(rows * markers),
    qtype: BigInt64Array.from(items, (item) => BigInt(item.qtype)),
  };
  items.forEach((item, row) => {
    item.ids.forEach((id, i) => {
      batch.inputIds[row * length + i] = BigInt(id);
      batch.attentionMask[row * length + i] = 1n;
    });
    item.markers.forEach((position, i) => {
      batch.markerPos[row * markers + i] = BigInt(position);
      batch.markerMask[row * markers + i] = 1;
    });
  });
  return batch;
}
