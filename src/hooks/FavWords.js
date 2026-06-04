import { STOKEY_WORDS, KV_WORDS_KEY } from "../config";
import { useCallback, useMemo } from "react";
import { useStorage } from "./Storage";
import { debounceSyncMeta } from "../libs/storage";

const DEFAULT_FAVWORDS = {};

/**
 * 生词本管理的自定义 Hook，支持生词的收藏、取消收藏、批量合并与清空
 */
export function useFavWords() {
  // 通过 useStorage 获取生词本数据并返回保存函数
  const { data: favWords, save: saveWords } = useStorage(
    STOKEY_WORDS,
    DEFAULT_FAVWORDS,
    KV_WORDS_KEY
  );

  // 包装保存生词本数据的方法，在保存后自动触发防抖云同步 (WebDAV 等)
  const save = useCallback(
    (objOrFn) => {
      saveWords(objOrFn);
      debounceSyncMeta(KV_WORDS_KEY);
    },
    [saveWords]
  );

  /**
   * 收藏或取消收藏某个单词的开关函数
   * @param {string} word 目标单词
   * @param {number} timestamp 音频播放时间戳或页面时间戳
   * @param {string} phonetic 单词音标
   * @param {string} definition 单词释义
   * @param {Array} examples 单词例句
   */
  const toggleFav = useCallback(
    (word, timestamp = null, phonetic = "", definition = "", examples = []) => {
      save((prev) => {
        // 如果该单词不在生词本中，则将其加入生词本
        if (!prev[word]) {
          // TODO: 除 word 外，其他属性（phonetic, definition, examples 等）暂无实际调用传入，后续可补充
          const wordData = {
            createdAt: Date.now(),
            timestamp,
            phonetic,
            definition,
            examples,
          };
          // 循环清理单词数据中的空值属性，减少存储体积
          Object.keys(wordData).forEach((key) => {
            if (
              wordData[key] === null ||
              wordData[key] === undefined ||
              (Array.isArray(wordData[key]) && wordData[key].length === 0) ||
              (typeof wordData[key] === "string" && wordData[key].length === 0)
            ) {
              delete wordData[key];
            }
          });
          return { ...prev, [word]: wordData };
        }

        // 如果单词已经存在，则将其从生词本中删除
        const favs = { ...prev };
        delete favs[word];
        return favs;
      });
    },
    [save]
  );

  /**
   * 批量将多个单词合并入生词本中
   * @param {Array<string>} words 单词数组
   */
  const mergeWords = useCallback(
    (words) => {
      save((prev) => ({
        ...words.reduce((acc, key) => {
          acc[key] = { createdAt: Date.now() };
          return acc;
        }, {}),
        ...prev, // 保持原有的单词属性不被简单的批量数据覆盖
      }));
    },
    [save]
  );

  // 清空生词本
  const clearWords = useCallback(() => {
    save({});
  }, [save]);

  // 将生词本对象转换为数组，并按照单词拼音字母排序缓存
  const favList = useMemo(
    () =>
      Object.entries(favWords || {}).sort((a, b) => a[0].localeCompare(b[0])),
    [favWords]
  );

  // 仅获取所有收藏单词的纯文本列表
  const wordList = useMemo(() => favList.map(([word]) => word), [favList]);

  return { favWords, favList, wordList, toggleFav, mergeWords, clearWords };
}
