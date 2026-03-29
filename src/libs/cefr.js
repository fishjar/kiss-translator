/* global chrome */

let cefrDict = null;
let dictPromise = null;

export const CEFR_LEVEL_SCORES = {
  UNKNOWN: 0,
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

export const CEFR_WORD_CLASS = "kiss-cefr-word";
export const CEFR_GLOSS_CLASS = "kiss-cefr-gloss";
export const CEFR_ATTR = "data-kiss-cefr";
export const CEFR_WORD_ATTR = "data-word";

const WORD_REGEX = /\b([a-zA-Z]+)\b/g;
const CEFR_SELECTOR = `span.${CEFR_WORD_CLASS}[${CEFR_ATTR}="1"]`;

function getAssetURL() {
  if (globalThis.chrome?.runtime?.getURL) {
    return globalThis.chrome.runtime.getURL("assets/cefr_dict.json");
  }
  return "/assets/cefr_dict.json";
}

function normalizeWord(word = "") {
  return String(word).trim().toLowerCase();
}

function getNodeOwnerDocument(node) {
  return node?.ownerDocument || document;
}

function createCEFRFragment(text, dict, userLevel, doc) {
  const fragment = doc.createDocumentFragment();
  let lastIndex = 0;
  let hasAnnotation = false;
  const matches = Array.from(text.matchAll(WORD_REGEX));

  matches.forEach((match) => {
    const [rawWord, capturedWord] = match;
    const start = match.index ?? 0;
    const end = start + rawWord.length;
    const normalizedWord = normalizeWord(capturedWord);
    const entry = dict.get(normalizedWord);
    const levelScore = CEFR_LEVEL_SCORES[entry?.level] || 0;

    if (start > lastIndex) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex, start)));
    }

    if (entry && levelScore > userLevel) {
      const wordNode = doc.createElement("span");
      const glossNode = doc.createElement("span");

      wordNode.className = CEFR_WORD_CLASS;
      wordNode.setAttribute(CEFR_ATTR, "1");
      wordNode.setAttribute(CEFR_WORD_ATTR, normalizedWord);
      wordNode.appendChild(doc.createTextNode(rawWord));

      glossNode.className = CEFR_GLOSS_CLASS;
      glossNode.setAttribute("aria-hidden", "true");
      glossNode.textContent = entry.zh;

      wordNode.appendChild(glossNode);
      fragment.appendChild(wordNode);
      hasAnnotation = true;
    } else {
      fragment.appendChild(doc.createTextNode(rawWord));
    }

    lastIndex = end;
  });

  if (lastIndex < text.length) {
    fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
  }

  return hasAnnotation ? fragment : null;
}

export async function getCEFRDict() {
  if (cefrDict) return cefrDict;
  if (dictPromise) return dictPromise;

  dictPromise = (async () => {
    try {
      const response = await fetch(getAssetURL());
      const json = await response.json();
      cefrDict = new Map(Object.entries(json || {}));
    } catch (error) {
      console.error("Failed to load CEFR dictionary:", error);
      cefrDict = new Map();
    } finally {
      dictPromise = null;
    }

    return cefrDict;
  })();

  return dictPromise;
}

export async function getWordLevelInfo(word) {
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return null;

  const dict = await getCEFRDict();
  const entry = dict.get(normalizedWord);
  if (!entry) return null;

  return {
    word: normalizedWord,
    level: entry.level,
    levelScore: CEFR_LEVEL_SCORES[entry.level] || 0,
    zh: entry.zh,
  };
}

export function isEnglishLang(lang = "") {
  return /^en(?:[-_]|$)/i.test(String(lang).trim());
}

export function shouldAnnotateOriginalNodes({
  sourceLang = "",
  cefrSetting = {},
  hideOrigin = false,
} = {}) {
  return Boolean(
    isEnglishLang(sourceLang) &&
      cefrSetting?.assessmentCompleted === true &&
      cefrSetting?.enabled === true &&
      hideOrigin === false
  );
}

export async function annotateNodeGroupWithCEFR({
  nodes = [],
  sourceLang = "",
  cefrSetting = {},
  hideOrigin = false,
} = {}) {
  if (
    !shouldAnnotateOriginalNodes({ sourceLang, cefrSetting, hideOrigin }) ||
    !Array.isArray(nodes) ||
    nodes.length === 0
  ) {
    return false;
  }

  const userLevel = Number(cefrSetting?.level);
  if (!Number.isFinite(userLevel)) {
    return false;
  }

  const dict = await getCEFRDict();
  if (!dict.size) {
    return false;
  }

  let changed = false;

  nodes.forEach((node) => {
    if (
      !(node instanceof Text) ||
      !node.parentNode ||
      !node.textContent?.trim() ||
      node.parentElement?.closest(CEFR_SELECTOR)
    ) {
      return;
    }

    const doc = getNodeOwnerDocument(node);
    const fragment = createCEFRFragment(node.textContent, dict, userLevel, doc);

    if (fragment) {
      node.replaceWith(fragment);
      changed = true;
    }
  });

  return changed;
}

export function removeCEFRAnnotations(rootNode) {
  const root =
    rootNode instanceof Document ? rootNode.body : rootNode || document.body;
  if (!root) return 0;

  const wrappers = Array.from(root.querySelectorAll(CEFR_SELECTOR));
  wrappers.forEach((wrapper) => {
    const textNode = getNodeOwnerDocument(wrapper).createTextNode(
      wrapper.childNodes[0]?.textContent || wrapper.textContent || ""
    );
    wrapper.replaceWith(textNode);
  });

  return wrappers.length;
}
