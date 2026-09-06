import { DEFAULT_CONTEXT_SIZE } from "../config";

// 全局缓存各 AI 翻译平台实例的对话上下文历史
const historyMap = new Map();

/**
 * 闭包封装的单通道消息历史记录环形队列。
 * 用于大模型翻译时提供历史对话上下文，以便 AI 能够根据前后文进行更自然的语境翻译。
 * @param {number} maxSize 历史记录的最大消息条数，超出时自动剔除最早的历史
 */
const MsgHistory = (maxSize = DEFAULT_CONTEXT_SIZE) => {
  const messages = [];

  /**
   * 追加新的对话消息，并自动维护队列长度不超过 maxSize
   */
  const add = (...msgs) => {
    messages.push(...msgs.filter(Boolean));
    const extra = messages.length - maxSize;
    if (extra > 0) {
      // 头部截断移除多余的老数据
      messages.splice(0, extra);
    }
  };

  /**
   * 成对写入一轮 user/assistant 对话，并按完整轮次维护队列长度。
   * 守卫不满足（缺 userMsg、非 assistant 角色、正文为空或非字符串）时整对不写，
   * 绝不留下孤立 user。仅持久化 {role, content} 两字段，响应其余字段不进入历史。
   * 污染历史（role 交替破坏或混入非标准条目）走逐条截断回退通道，不改写既有条目。
   */
  const addPair = (userMsg, assistantMsg) => {
    if (
      !userMsg ||
      assistantMsg?.role !== "assistant" ||
      typeof assistantMsg?.content !== "string" ||
      assistantMsg.content.length === 0
    ) {
      return;
    }
    const finalAssistantMsg = {
      role: assistantMsg.role,
      content: assistantMsg.content,
    };
    // 先于容量取整执行：存量头部孤立 assistant（旧逐条截断遗留）总能被清理
    while (messages[0]?.role === "assistant") {
      messages.shift();
    }
    const k = Math.floor(maxSize / 2);
    if (k < 1) {
      return;
    }
    // 干净谓词仅按 role 交替判定，content 形态不参与路由
    const isCleanHistory = messages.every(
      (m, i) => m?.role === (i % 2 === 0 ? "user" : "assistant")
    );
    if (isCleanHistory) {
      if (messages.length % 2 === 1) {
        // 干净序列下奇数长度只可能是尾部孤立 user（防御性，现行写入点不可达）
        messages.pop();
      }
      messages.push(userMsg, finalAssistantMsg);
      while (messages.length > 2 * k) {
        // 从最旧完整轮次成对删除，避免奇数容量产生孤立 assistant
        messages.splice(0, 2);
      }
    } else {
      // 污染回退：追加不静默失败，按 add 同款逐条截断保持容量有界
      messages.push(userMsg, finalAssistantMsg);
      const extra = messages.length - maxSize;
      if (extra > 0) {
        messages.splice(0, extra);
      }
    }
  };

  /**
   * 克隆并获取当前存留的所有历史消息数组
   */
  const getAll = () => {
    return [...messages];
  };

  /**
   * 彻底清空历史消息
   */
  const clear = () => {
    messages.length = 0;
  };

  return {
    add,
    addPair,
    getAll,
    clear,
  };
};

/**
 * 单例模式获取指定翻译服务的历史上下文队列。
 * @param {string} apiSlug 翻译服务的唯一标识 (如 "gemini", "openai")
 * @param {number} maxSize 历史上下文的大小阈值
 * @returns {Object} 消息历史控制器实例
 */
export const getMsgHistory = (apiSlug, maxSize) => {
  if (historyMap.has(apiSlug)) {
    return historyMap.get(apiSlug);
  }

  const msgHistory = MsgHistory(maxSize);
  historyMap.set(apiSlug, msgHistory);
  return msgHistory;
};

/**
 * 销毁并清除指定翻译服务的历史上下文。
 * @param {string} apiSlug 翻译服务唯一标识
 */
export const clearMsgHistory = (apiSlug) => {
  historyMap.delete(apiSlug);
};
