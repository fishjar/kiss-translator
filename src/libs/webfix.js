/**
 * 修复程序类型
 */
const FIXER_NONE = "-";
const FIXER_BR = "br";
const FIXER_BN = "bn";
const FIXER_BR_DIV = "brToDiv";
const FIXER_BN_DIV = "bnToDiv";

export const FIXER_ALL = [
  FIXER_NONE,
  FIXER_BR,
  FIXER_BN,
  FIXER_BR_DIV,
  FIXER_BN_DIV,
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

  const gapTags = ["BR", "WBR"];
  const newlineTags = [
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
    "BLOCKQUOTE",
  ];

  let html = "";
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
    } else if (child.textContent) {
      html += child.textContent;
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
 * 修复程序映射
 */
const fixerMap = {
  [FIXER_BR]: brFixer,
  [FIXER_BN]: bnFixer,
  [FIXER_BR_DIV]: brDivFixer,
  [FIXER_BN_DIV]: bnDivFixer,
};

/**
 * 查找、监听节点，并执行修复函数
 * @param {*} selector
 * @param {*} fixer
 * @param {*} rootSelector
 */
function run(selector, fixer, rootSelector) {
  const mutaObserver = new MutationObserver(function (mutations) {
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

  let rootNodes = [document];
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
 * 执行fixer
 * @param {*} param0
 */
export async function runFixer(selector, fixer = "-", rootSelector) {
  try {
    if (Object.keys(fixerMap).includes(fixer)) {
      run(selector, fixerMap[fixer], rootSelector);
    }
  } catch (err) {
    console.error(`[kiss-webfix run]: ${err.message}`);
  }
}
