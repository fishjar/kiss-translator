import { isMatch } from "./utils";

/**
 * 需要修复的站点列表
 * - pattern 匹配网址
 * - selector 需要修复的选择器
 * - rootSlector 需要监听的选择器，可留空
 * - fixer 修复函数，可针对不同网址，选用不同修复函数
 */
export const sites = [
  {
    pattern: "www.phoronix.com",
    selector: ".content",
    rootSlector: "",
    fixer: brFixer,
  },
  {
    pattern: "t.me/s/*",
    selector: ".tgme_widget_message_text",
    rootSlector: ".tgme_channel_history",
    fixer: brFixer,
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
function brFixer(node) {
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
      html += "<p>";
    }

    if (gapTags.indexOf(child.nodeName) !== -1) {
      html += "</p><p>";
    } else if (newlineTags.indexOf(child.nodeName) !== -1) {
      html += "</p>" + child.outerHTML + "<p>";
    } else if (child.outerHTML) {
      html += child.outerHTML;
    } else if (child.nodeValue) {
      html += child.nodeValue;
    }

    if (index === node.childNodes.length - 1) {
      html += "</p>";
    }
  });
  node.innerHTML = html;
}

/**
 * 查找、监听节点，并执行修复函数
 * @param {*} selector
 * @param {*} fixer
 * @param {*} rootSlector
 */
function run(selector, fixer, rootSlector) {
  var mutaObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (addNode) {
        addNode.querySelectorAll(selector).forEach(fixer);
      });
    });
  });

  var rootNodes = [document];
  if (rootSlector) {
    rootNodes = document.querySelectorAll(rootSlector);
  }

  rootNodes.forEach(function (rootNode) {
    rootNode.querySelectorAll(selector).forEach(fixer);
    mutaObserver.observe(rootNode, {
      childList: true,
    });
  });
}

/**
 * 匹配站点
 */
export function webfix(href, { injectWebfix }) {
  try {
    if (!injectWebfix) {
      return;
    }

    for (var i = 0; i < sites.length; i++) {
      var site = sites[i];
      if (isMatch(href, site.pattern)) {
        run(site.selector, site.fixer, site.rootSlector);
        break;
      }
    }
  } catch (err) {
    console.error(`[kiss-webfix]: ${err.message}`);
  }
}
