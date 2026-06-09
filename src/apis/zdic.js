import { fetchData } from "../libs/fetch";
import { trustedTypesHelper } from "../libs/trustedTypes";

const ZDIC_HOST = "https://www.zdic.net";

const cleanText = (text) => (text || "").replace(/\s+/g, " ").trim();

const uniq = (list) => Array.from(new Set(list.filter(Boolean)));

const getOwnText = (node) =>
  cleanText(
    Array.from(node?.childNodes || [])
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join("")
  ) || cleanText(node?.textContent);

const toAbsoluteUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${ZDIC_HOST}${url}`;
  return url;
};

const getNextMetaValue = (doc, label) => {
  const badge = Array.from(doc.querySelectorAll(".meta-badge")).find(
    (node) => cleanText(node.textContent) === label
  );

  return getOwnText(badge?.nextElementSibling);
};

const getVariantText = (doc, selector) =>
  uniq(
    Array.from(doc.querySelectorAll(selector)).map(
      (node) =>
        cleanText(node.getAttribute("title")) ||
        cleanText(node.querySelector("img")?.getAttribute("alt")) ||
        cleanText(node.textContent)
    )
  ).join(", ");

const parseNewResults = (doc) =>
  Array.from(doc.querySelectorAll("#jbjs .jbjs-reading"))
    .map((node) => {
      const pinyin = cleanText(
        node.querySelector(".jbjs-reading__py")?.textContent
      );
      const audioNode = node.querySelector(".audio-btn");
      const definitions = Array.from(node.querySelectorAll(".jbjs-list li"))
        .map((li) => cleanText(li.textContent))
        .filter(Boolean);

      return {
        pinyin,
        audioUrl: toAbsoluteUrl(audioNode?.getAttribute("data-audio")),
        definitions,
      };
    })
    .filter((item) => item.pinyin || item.definitions.length > 0);

const parseOldResults = (doc) => {
  const results = [];
  const dicpyNodes = doc.querySelectorAll(".jbjs>.jnr>p>.dicpy");

  dicpyNodes.forEach((node) => {
    const pinyin = cleanText(node.childNodes[0]?.nodeValue);
    const audioNode = node.querySelector(".audio_play_button");
    const definitions = [];
    let sibling = node.parentElement?.nextElementSibling;

    while (sibling) {
      if (sibling.tagName?.toLowerCase() === "ol") {
        sibling.querySelectorAll("li").forEach((li) => {
          definitions.push(cleanText(li.textContent));
        });
        break;
      }

      if (sibling.querySelector(".dicpy")) {
        break;
      }

      sibling = sibling.nextElementSibling;
    }

    results.push({
      pinyin,
      audioUrl: toAbsoluteUrl(
        audioNode?.getAttribute("data-src-mp3") ||
          audioNode?.getAttribute("data-audio")
      ),
      definitions,
    });
  });

  return results;
};

const parseTranslations = (doc) => {
  const translations = { en: "", de: "", fr: "" };
  const labelMap = {
    英语: "en",
    德语: "de",
    法语: "fr",
  };

  Array.from(doc.querySelectorAll(".enbox p, #jbjs p, #jbjs div")).forEach(
    (node) => {
      const text = cleanText(node.textContent);
      Object.entries(labelMap).forEach(([label, key]) => {
        if (!translations[key] && text.startsWith(label)) {
          translations[key] = cleanText(text.slice(label.length));
        }
      });
    }
  );

  return translations;
};

/**
 * Fetches and parses a single Chinese character entry from ZDIC.
 *
 * @param {string} text single Chinese character to look up
 * @returns {Promise<Object|null>} parsed character metadata and definitions
 */
export const apiZdic = async (text) => {
  const url = `${ZDIC_HOST}/hans/${encodeURIComponent(text)}`;
  const str = await fetchData(
    url,
    { credentials: "omit" },
    { useCache: false }
  );

  if (!str) {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    trustedTypesHelper.createHTML(str),
    "text/html"
  );

  const character =
    cleanText(doc.querySelector(".char-meta")?.getAttribute("content")) ||
    cleanText(doc.querySelector("#glyph-img")?.getAttribute("alt")) ||
    cleanText(doc.querySelector(".dict-section__char")?.textContent) ||
    cleanText(doc.querySelector(".h2_entry>.orth")?.textContent) ||
    text;

  const bushou =
    getNextMetaValue(doc, "部首") ||
    cleanText(doc.querySelector("[class^='z_bs'] a")?.textContent);
  const fanti = getVariantText(doc, "[class^='z_jfz'] a");
  const yiti =
    getVariantText(doc, ".char-card__variants .variant-link") ||
    getVariantText(doc, "[class^='z_yt'] a");
  const wubi =
    getNextMetaValue(doc, "五笔") ||
    cleanText(
      doc.querySelector(
        ".entry_title table.dsk:nth-child(2) tr:nth-child(2) > td.dsk_2_1:nth-child(1) > p"
      )?.textContent
    );

  const results = parseNewResults(doc);
  const { en, de, fr } = parseTranslations(doc);

  return {
    text: character,
    bushou,
    fanti,
    yiti,
    wubi,
    results: results.length > 0 ? results : parseOldResults(doc),
    en,
    de,
    fr,
  };
};
