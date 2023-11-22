import { isMatch } from "./utils";
import { getWebfix, setWebfix, getWebfixRulesWithDefault } from "./storage";
import { apiFetch } from "../apis";

/**
 * 修复程序类型
 */
const FIXER_BR = "br";
const FIXER_BN = "bn";
const FIXER_BR_DIV = "brToDiv";
const FIXER_BN_DIV = "bnToDiv";
const FIXER_FONTSIZE = "fontSize";
export const FIXER_ALL = [
  FIXER_BR,
  FIXER_BN,
  FIXER_BR_DIV,
  FIXER_BN_DIV,
  // FIXER_FONTSIZE,
];

/**
 * 需要修复的站点列表
 * - pattern 匹配网址
 * - selector 需要修复的选择器
 * - rootSelector 需要监听的选择器，可留空
 * - fixer 修复函数，可针对不同网址，选用不同修复函数
 */
const DEFAULT_SITES = [
  {
    pattern: "www.phoronix.com",
    selector: ".content",
    rootSelector: "",
    fixer: FIXER_BR,
  },
  {
    pattern: "t.me/s/",
    selector: ".tgme_widget_message_text",
    rootSelector: ".tgme_channel_history",
    fixer: FIXER_BR,
  },
  {
    pattern: "baidu.com",
    selector: "html",
    rootSelector: "",
    fixer: FIXER_FONTSIZE,
  },
  {
    pattern: "chat.openai.com",
    selector: "div[data-testid^=conversation-turn] .items-start > div",
    rootSelector: "",
    fixer: FIXER_BN,
  },
];

/**
 * 修复过的标记
 */
const fixedSign = "kissfixed";

/**
 * 采用 `br` 换行网站的修复函数
 * 目标是将 `br` 替换成 `p`
 * @param {*} node
 * @returns
 */
function brFixer(node, tag = "p") {
  if (node.hasAttribute(fixedSign)) {
    return;
  }
  node.setAttribute(fixedSign, "true");

  var gapTags = ["BR", "WBR"];
  var newlineTags = [
    "DIV",
    "UL",
    "OL",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "P",
    "HR",
    "PRE",
    "TABLE",
  ];

  var html = "";
  node.childNodes.forEach(function (child, index) {
    if (index === 0) {
      html += `<${tag} class="kiss-p">`;
    }

    if (gapTags.indexOf(child.nodeName) !== -1) {
      html += `</${tag}><${tag} class="kiss-p">`;
    } else if (newlineTags.indexOf(child.nodeName) !== -1) {
      html += `</${tag}>${child.outerHTML}<${tag} class="kiss-p">`;
    } else if (child.outerHTML) {
      html += child.outerHTML;
    } else if (child.nodeValue) {
      html += child.nodeValue;
    }

    if (index === node.childNodes.length - 1) {
      html += `</${tag}>`;
    }
  });
  node.innerHTML = html;
}

function brDivFixer(node) {
  return brFixer(node, "div");
}

/**
 * 目标是将 `\n` 替换成 `p`
 * @param {*} node
 * @returns
 */
function bnFixer(node, tag = "p") {
  if (node.hasAttribute(fixedSign)) {
    return;
  }
  node.setAttribute(fixedSign, "true");
  node.innerHTML = node.innerHTML
    .split("\n")
    .map((item) => `<${tag} class="kiss-p">${item || "&nbsp;"}</${tag}>`)
    .join("");
}

function bnDivFixer(node) {
  return bnFixer(node, "div");
}

/**
 * 修复字体大小问题，如 baidu.com
 * @param {*} node
 */
function fontSizeFixer(node) {
  node.style.cssText += "font-size:1em;";
}

/**
 * 修复程序映射
 */
const fixerMap = {
  [FIXER_BR]: brFixer,
  [FIXER_BN]: bnFixer,
  [FIXER_BR_DIV]: brDivFixer,
  [FIXER_BN_DIV]: bnDivFixer,
  [FIXER_FONTSIZE]: fontSizeFixer,
};

/**
 * 查找、监听节点，并执行修复函数
 * @param {*} selector
 * @param {*} fixer
 * @param {*} rootSelector
 */
function run(selector, fixer, rootSelector) {
  var mutaObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (addNode) {
        if (addNode && addNode.querySelectorAll) {
          addNode.querySelectorAll(selector).forEach(function (node) {
            fixer(node);
          });
        }
      });
    });
  });

  var rootNodes = [document];
  if (rootSelector) {
    rootNodes = document.querySelectorAll(rootSelector);
  }

  rootNodes.forEach(function (rootNode) {
    rootNode.querySelectorAll(selector).forEach(function (node) {
      fixer(node);
    });
    mutaObserver.observe(rootNode, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * 同步远程数据
 * @param {*} url
 * @returns
 */
export const syncWebfix = async (url) => {
  const sites = await apiFetch(url);
  await setWebfix(url, sites);
  return sites;
};

/**
 * 从缓存或远程加载修复站点
 * @param {*} url
 * @returns
 */
export const loadOrFetchWebfix = async (url) => {
  try {
    let sites = await getWebfix(url);
    if (sites?.length) {
      return sites;
    }
    return syncWebfix(url);
  } catch (err) {
    console.log("[load webfix]", err.message);
    return DEFAULT_SITES;
  }
};

/**
 * 匹配站点
 */
export async function runWebfix({ injectWebfix }) {
  try {
    if (!injectWebfix) {
      return;
    }

    const href = document.location.href;
    const userSites = await getWebfixRulesWithDefault();
    const subSites = await loadOrFetchWebfix(process.env.REACT_APP_WEBFIXURL);
    const sites = [...userSites, ...subSites];
    for (var i = 0; i < sites.length; i++) {
      var site = sites[i];
      if (isMatch(href, site.pattern)) {
        if (fixerMap[site.fixer]) {
          run(site.selector, fixerMap[site.fixer], site.rootSelector);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[kiss-webfix]: ${err.message}`);
  }
}
