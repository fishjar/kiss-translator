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
