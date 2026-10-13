import { pyJson } from "./pyjson";
import type { Criterion, InternalQuestion, Json } from "./types";
import { QTYPES } from "./types";

const isPlainObject = (v: unknown): v is Record<string, Json> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isArrayIndexKey = (key: string): boolean => /^(0|[1-9]\d*)$/.test(key);

/** 移植上游 Python `Agent._to_internal`，校验并归一化问题结构 */
export function toInternal(question: unknown): InternalQuestion {
  if (!isPlainObject(question)) {
    throw new Error("Each question must be a dictionary");
  }
  const kind = question.type;
  if (typeof kind !== "string" || !Object.hasOwn(QTYPES, kind)) {
    const repr =
      kind === undefined
        ? "None"
        : typeof kind === "string"
          ? `'${kind}'`
          : String(kind);
    throw new Error(
      `Unknown question type ${repr}; expected choice, score, or noul`
    );
  }
  if (!Object.hasOwn(question, "instructions")) {
    throw new Error("Question is missing instructions");
  }
  const raw: Json = question.instructions ?? null;
  const computeIns = () => (typeof raw === "string" ? raw : pyJson(raw));

  let criteria = question.criteria;
  if (kind === "choice") {
    if (Array.isArray(criteria)) {
      if (!criteria.every((c): c is string => typeof c === "string")) {
        throw new Error("Choice labels must be strings");
      }
      if (new Set(criteria).size !== criteria.length) {
        throw new Error("Choice labels must be unique");
      }
      criteria = Object.fromEntries(criteria.map((c) => [c, null]));
    } else if (isPlainObject(criteria)) {
      const keys = Object.keys(criteria);
      const hasArrayIndexKey = keys.some(isArrayIndexKey);
      const hasOtherKey = keys.some((k) => !isArrayIndexKey(k));
      if (hasArrayIndexKey && hasOtherKey) {
        throw new Error(
          "Choice criteria with numeric labels must use the list form to preserve option order"
        );
      }
    }
    if (!isPlainObject(criteria) || Object.keys(criteria).length === 0) {
      throw new Error("Choice criteria must be a nonempty dictionary or list");
    }
    return { t: "choice", ins: computeIns(), crit: criteria };
  }
  if (kind === "score") {
    if (!Array.isArray(criteria) || criteria.length === 0) {
      throw new Error("Score criteria must be a nonempty list");
    }
    return { t: "score", ins: computeIns(), crit: criteria };
  }
  if (criteria !== undefined && criteria !== null) {
    if (!isPlainObject(criteria)) {
      throw new Error(
        "Noul criteria must be a dictionary with false/true descriptions"
      );
    }
  }
  return { t: "noul", ins: computeIns(), crit: criteria ?? null };
}

/** 移植 Python `render_criterion`：字符串原样返回，结构化值转为紧凑 JSON */
export function renderCriterion(value: Criterion): string {
  return typeof value === "string"
    ? value
    : pyJson(value, { ensureAscii: false });
}

const isBlank = (v: Criterion | undefined): v is null | undefined | "" =>
  v === null || v === undefined || v === "";

/** 移植 Python `render_options`：按选项顺序渲染文本，noul 固定为 [false, true] */
export function renderOptions(q: InternalQuestion): string[] {
  if (q.t === "choice") {
    return Object.entries(q.crit).map(([k, v]) =>
      isBlank(v) ? k : `${k}: ${renderCriterion(v)}`
    );
  }
  if (q.t === "score") {
    return q.crit.map((c, i) => `level ${i}: ${renderCriterion(c)}`);
  }
  const crit = q.crit ?? {};
  const falseCrit = crit.false;
  const trueCrit = crit.true;
  return [
    "false: " +
      (isBlank(falseCrit)
        ? "no, the statement does not hold"
        : renderCriterion(falseCrit)),
    "true: " +
      (isBlank(trueCrit)
        ? "yes, the statement holds"
        : renderCriterion(trueCrit)),
  ];
}
