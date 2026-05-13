import { fetchData } from "../libs/fetch";

/**
 * 汉字释义
 * @param {*} text
 * @returns
 */
export const apiZdic = async (text) => {
  const host = "https://www.zdic.net";
  const url = `${host}/hans/${encodeURIComponent(text)}`;
  const str = await fetchData(
    url,
    { credentials: "omit" },
    { useCache: false }
  );

  if (!str) {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(str, "text/html");

  // 汉字
  const character =
    doc.querySelector(".h2_entry>.orth")?.textContent?.trim() || text;

  // 部首
  const bushou =
    doc.querySelector("[class^='z_bs'] a")?.textContent?.trim() || "";

  // 繁体
  const fanti = Array.from(doc.querySelectorAll("[class^='z_jfz'] a"))
    .map((el) => el.textContent?.trim())
    .join(", ");

  // 异体字
  const yiti = Array.from(doc.querySelectorAll("[class^='z_yt'] a"))
    .map((el) => el.textContent?.trim())
    .join(", ");

  // 五笔
  const wubi =
    doc
      .querySelector(
        ".entry_title table.dsk:nth-child(2) tr:nth-child(2) > td.dsk_2_1:nth-child(1) > p"
      )
      ?.textContent?.trim() || "";

  // 基本解释
  const results = [];
  const dicpyNodes = doc.querySelectorAll(".jbjs>.jnr>p>.dicpy");
  dicpyNodes.forEach((node) => {
    const pinyin = node.childNodes[0].nodeValue.trim();
    const audioNode = node.querySelector(".audio_play_button");
    const audioUrl = audioNode ? audioNode.getAttribute("data-src-mp3") : null;
    const definitions = [];
    let sibling = node.parentElement.nextElementSibling;

    while (sibling) {
      if (sibling.tagName.toLowerCase() === "ol") {
        const liNodes = sibling.querySelectorAll("li");
        liNodes.forEach((li) => {
          definitions.push(li.textContent.trim());
        });
        break;
      }

      if (sibling.querySelector(".dicpy")) {
        break;
      }

      sibling = sibling.nextElementSibling;
    }

    results.push({
      pinyin: pinyin, // 拼音
      audioUrl: `https:${audioUrl}`, // 语言
      definitions: definitions, // 解释
    });
  });

  // 外语翻译
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
    text: character, // 汉字
    bushou, // 部首
    fanti, // 繁体
    yiti, // 异体字
    wubi, // 五笔
    results, // 基本解释
    en, // 英文
    de, // 德语
    fr, // 法语
  };
};
