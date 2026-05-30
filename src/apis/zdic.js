import { fetchData } from "../libs/fetch";

/**
 * 抓取并解析汉典网 (zdic.net) 的汉字释义及相关属性数据。
 * 可用于划词字典或汉字拼音、部首、繁体、五笔等汉字属性的拓展展现。
 * @param {string} text 需要检索的单个汉字
 * @returns {Promise<Object|null>} 抓取反解析出的汉字属性与释义对象
 */
export const apiZdic = async (text) => {
  const host = "https://www.zdic.net";
  const url = `${host}/hans/${encodeURIComponent(text)}`;

  // 通过 fetchData 请求 zdic 页面内容（略过 Cookie 以保证隐私且提升速度）
  const str = await fetchData(
    url,
    { credentials: "omit" },
    { useCache: false }
  );

  if (!str) {
    return null;
  }

  // 使用 DOMParser 在客户端将原始 HTML 字符串实例化为 DOM 树以方便解析
  const parser = new DOMParser();
  const doc = parser.parseFromString(str, "text/html");

  // 1. 提取汉字
  const character =
    doc.querySelector(".h2_entry>.orth")?.textContent?.trim() || text;

  // 2. 提取部首
  const bushou =
    doc.querySelector("[class^='z_bs'] a")?.textContent?.trim() || "";

  // 3. 提取繁体字符
  const fanti = Array.from(doc.querySelectorAll("[class^='z_jfz'] a"))
    .map((el) => el.textContent?.trim())
    .join(", ");

  // 4. 提取异体字
  const yiti = Array.from(doc.querySelectorAll("[class^='z_yt'] a"))
    .map((el) => el.textContent?.trim())
    .join(", ");

  // 5. 提取五笔编码
  // REVIEW: 脆弱选择器警告！
  // 此处五笔提取使用了极其具体的层级伪类选择器。若 zdic 网对详情表格进行了细微重构，
  // 极易导致选择器返回 null，建议未来增加备用提取方案。
  const wubi =
    doc
      .querySelector(
        ".entry_title table.dsk:nth-child(2) tr:nth-child(2) > td.dsk_2_1:nth-child(1) > p"
      )
      ?.textContent?.trim() || "";

  // 6. 提取拼音、发音音频及基本释义列表
  const results = [];
  const dicpyNodes = doc.querySelectorAll(".jbjs>.jnr>p>.dicpy");
  dicpyNodes.forEach((node) => {
    const pinyin = node.childNodes[0].nodeValue.trim();
    const audioNode = node.querySelector(".audio_play_button");
    const audioUrl = audioNode ? audioNode.getAttribute("data-src-mp3") : null;
    const definitions = [];
    let sibling = node.parentElement.nextElementSibling;

    // 向上遍历兄弟节点，查找紧跟的有序列表 <ol> 节点来获取释义条目
    while (sibling) {
      if (sibling.tagName.toLowerCase() === "ol") {
        const liNodes = sibling.querySelectorAll("li");
        liNodes.forEach((li) => {
          definitions.push(li.textContent.trim());
        });
        break;
      }

      // 若在中途遇到了下一个拼音块，则说明当前读音的释义列表结束，提前退出
      if (sibling.querySelector(".dicpy")) {
        break;
      }

      sibling = sibling.nextElementSibling;
    }

    results.push({
      pinyin: pinyin, // 拼音字符串
      // REVIEW: 此处对 audioUrl 进行了强制前缀补齐。如果接口返回的 data-src-mp3 已是完整 url，
      // 会导致产生双协议头从而播放失败。应添加前缀判断。
      audioUrl: `https:${audioUrl}`, // 拼音读音音频 MP3
      definitions: definitions, // 多项释义列表
    });
  });

  // 7. 提取外语对照翻译
  let en = "";
  let de = "";
  let fr = "";

  const enboxNodes = doc.querySelectorAll(".enbox p");
  enboxNodes.forEach((p) => {
    const text = p.textContent?.trim() || "";
    if (text.startsWith("英语")) {
      en = text.replace("英语", "").trim();
    } else if (text.startsWith("德语")) {
      de = text.replace("德语", "").trim();
    } else if (text.startsWith("法语")) {
      fr = text.replace("法语", "").trim();
    }
  });

  return {
    text: character, // 检索的汉字
    bushou, // 偏旁部首
    fanti, // 对应繁体字
    yiti, // 异体字
    wubi, // 五笔字型编码
    results, // 结构化解释集 (含读音、解释列表)
    en, // 英文翻译
    de, // 德语翻译
    fr, // 法语翻译
  };
};
