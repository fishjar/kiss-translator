import { DEFAULT_CONTEXT_SIZE } from "../config";

const historyMap = new Map();

const MsgHistory = (maxSize = DEFAULT_CONTEXT_SIZE) => {
  const messages = [];

  const add = (...msgs) => {
    messages.push(...msgs.filter(Boolean));
    const extra = messages.length - maxSize;
    if (extra > 0) {
      messages.splice(0, extra);
    }
  };

  const getAll = () => {
    return [...messages];
  };

  const clear = () => {
    messages.length = 0;
  };

  return {
    add,
    getAll,
    clear,
  };
};

export const getMsgHistory = (translator, maxSize) => {
  if (historyMap.has(translator)) {
    return historyMap.get(translator);
  }

  const msgHistory = MsgHistory(maxSize);
  historyMap.set(translator, msgHistory);
  return msgHistory;
};
