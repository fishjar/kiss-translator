import { OPT_TRANS_GEMINI } from "../config/api";

// 模型列表 URL 中可显式放置该占位符；存在占位符时不会额外注入 Authorization 头。
const MODEL_KEY_PLACEHOLDER = "{{key}}";

/**
 * 去掉 Gemini 原生模型列表返回的资源名前缀。
 *
 * Gemini `models.list` 返回的 `name` 通常是 `models/gemini-xxx`，但生成接口里
 * 实际填写的是 `gemini-xxx`，因此下拉选项需要展示可直接用于配置的模型 ID。
 *
 * @param {string} model 原始模型名称。
 * @returns {string} 去除 `models/` 前缀后的模型名称。
 */
const stripGeminiModelPrefix = (model) =>
  typeof model === "string" && model.startsWith("models/")
    ? model.slice("models/".length)
    : model;

/**
 * 标准化模型名并追加到结果列表，同时保持原始返回顺序和去重。
 *
 * @param {string[]} models 已收集的模型名称列表。
 * @param {Set<string>} seen 已出现过的模型名称集合。
 * @param {unknown} model 候选模型名称。
 * @returns {void}
 */
const addUniqueModel = (models, seen, model) => {
  const normalizedModel = stripGeminiModelPrefix(
    typeof model === "string" ? model.trim() : ""
  );

  // 空字符串或重复模型不进入下拉列表，避免出现无效选项。
  if (!normalizedModel || seen.has(normalizedModel)) {
    return;
  }

  seen.add(normalizedModel);
  models.push(normalizedModel);
};

/**
 * 从不同供应商的模型列表响应中提取可填入 `model` 字段的模型名称。
 *
 * 目前兼容三类常见结构：
 * - OpenAI 兼容接口：`{ data: [{ id: "model-id" }] }`
 * - Gemini 原生接口：`{ models: [{ name: "models/xxx", baseModelId: "xxx" }] }`
 * - Ollama 本地接口：`{ models: [{ name: "model:tag" }] }`
 *
 * @param {unknown} data 模型列表接口返回的 JSON 数据。
 * @returns {string[]} 标准化、去重后的模型名称列表。
 */
export function parseModelListResponse(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  const models = [];
  const seen = new Set();
  // 兼容 OpenAI-compatible 的 `data` 和 Gemini/Ollama 的 `models` 两种列表字段。
  const lists = [data.data, data.models].filter(Array.isArray);

  lists.forEach((list) => {
    list.forEach((item) => {
      if (typeof item === "string") {
        addUniqueModel(models, seen, item);
        return;
      }

      // 部分接口可能混入 null 或非对象项，直接忽略即可。
      if (!item || typeof item !== "object") {
        return;
      }

      // 按常见字段依次尝试；去重逻辑会避免同一模型被重复加入。
      addUniqueModel(models, seen, item.id);
      addUniqueModel(models, seen, item.name);
      addUniqueModel(models, seen, item.baseModelId);
    });
  });

  return models;
}

/**
 * 给 URL 追加或覆盖一个 query 参数。
 *
 * 优先使用标准 `URL` API 处理绝对 URL；如果用户填写的是非标准 URL 片段，
 * 则回退到字符串拼接，尽量不阻塞用户自定义地址。
 *
 * @param {string} url 原始 URL。
 * @param {string} name 参数名。
 * @param {string} value 参数值。
 * @returns {string} 追加参数后的 URL。
 */
const appendQueryParam = (url, name, value) => {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set(name, value);
    return parsedUrl.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${encodeURIComponent(name)}=${encodeURIComponent(
      value
    )}`;
  }
};

/**
 * 根据 API 类型和用户配置生成模型列表请求参数。
 *
 * 鉴权规则：
 * - URL 包含 `{{key}}` 时，将 key 写入 URL，不再添加请求头，兼容特殊服务。
 * - Gemini 原生模型列表使用 `?key=...` 鉴权。
 * - 其他接口默认使用 OpenAI 兼容的 `Authorization: Bearer ...`。
 *
 * @param {Object} params 参数对象。
 * @param {string} params.apiType 当前 API 类型。
 * @param {string} params.modelListUrl 模型列表接口地址。
 * @param {string} params.key API Key。
 * @returns {{input: string, init: Object}|null} 可传给请求层的参数；配置不足时返回 null。
 */
export function createModelListRequest({ apiType, modelListUrl, key }) {
  const trimmedUrl = (modelListUrl || "").trim();
  const trimmedKey = (key || "").trim();

  // 用户没有同时配置模型列表 URL 和 Key 时，不发起网络请求。
  if (!trimmedUrl || !trimmedKey) {
    return null;
  }

  // 显式占位符优先，允许用户自行决定 key 位于 path、query 或其他自定义位置。
  if (trimmedUrl.includes(MODEL_KEY_PLACEHOLDER)) {
    return {
      input: trimmedUrl.replaceAll(
        MODEL_KEY_PLACEHOLDER,
        encodeURIComponent(trimmedKey)
      ),
      init: {
        method: "GET",
      },
    };
  }

  // Google Gemini 原生 REST API 不使用 Bearer header，而是通过 key query 参数鉴权。
  if (apiType === OPT_TRANS_GEMINI) {
    return {
      input: appendQueryParam(trimmedUrl, "key", trimmedKey),
      init: {
        method: "GET",
      },
    };
  }

  // 大多数模型供应商兼容 OpenAI 风格的 Bearer 鉴权。
  return {
    input: trimmedUrl,
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
      },
    },
  };
}

/**
 * 拉取并解析当前 API 配置对应的模型列表。
 *
 * 这里使用项目统一的普通请求代理层，确保 WebExtension、userscript、background
 * 等运行环境都能复用已有的跨域、超时和错误解析逻辑。
 *
 * @param {Object} params 参数对象。
 * @param {string} params.apiType 当前 API 类型。
 * @param {string} params.modelListUrl 模型列表接口地址。
 * @param {string} params.key API Key。
 * @param {number} [params.httpTimeout] 请求超时时间配置。
 * @returns {Promise<string[]>} 可用于模型下拉选项的模型名称列表。
 */
export async function fetchModelList({
  apiType,
  modelListUrl,
  key,
  httpTimeout,
}) {
  // 动态 import 保持请求层延迟加载，避免纯解析单测导入本模块时牵出流式解析的 ESM 依赖。
  const { fetchHandle, fnPolyfill } = await import("./request");
  const request = createModelListRequest({ apiType, modelListUrl, key });

  if (!request) {
    return [];
  }

  const data = await fnPolyfill({
    fn: fetchHandle,
    input: request.input,
    init: request.init,
    opts: {
      httpTimeout,
      // 模型列表接口按 JSON 响应处理，非 JSON 或 HTTP 错误交给统一请求层抛错。
      expect: "json",
    },
  });

  return parseModelListResponse(data);
}
