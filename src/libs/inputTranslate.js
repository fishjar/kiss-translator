import {
  DEFAULT_INPUT_RULE,
  DEFAULT_TRANS_APIS,
  DEFAULT_INPUT_SHORTCUT,
  OPT_LANGS_LIST,
} from "../config";
import { genEventName, removeEndchar, matchInputStr, sleep } from "./utils";
import { stepShortcutRegister } from "./shortcut";
import { apiTranslate } from "../apis";
import { loadingSvg } from "./svg";
import { kissLog } from "./log";

function isInputNode(node) {
  return node.nodeName === "INPUT" || node.nodeName === "TEXTAREA";
}

function isEditAbleNode(node) {
  return node.hasAttribute("contenteditable");
}

function selectContent(node) {
  node.focus();
  const range = document.createRange();
  range.selectNodeContents(node);

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function pasteContentEvent(node, text) {
  node.focus();
  const data = new DataTransfer();
  data.setData("text/plain", text);

  const event = new ClipboardEvent("paste", { clipboardData: data });
  document.dispatchEvent(event);
  data.clearData();
}

function pasteContentCommand(node, text) {
  node.focus();
  document.execCommand("insertText", false, text);
}

function collapseToEnd(node) {
  node.focus();
  const selection = window.getSelection();
  selection.collapseToEnd();
}

function getNodeText(node) {
  if (isInputNode(node)) {
    return node.value;
  }
  return node.innerText || node.textContent || "";
}

function addLoading(node, loadingId) {
  const div = document.createElement("div");
  div.id = loadingId;
  div.innerHTML = loadingSvg;
  div.style.cssText = `
      width: ${node.offsetWidth}px;
      height: ${node.offsetHeight}px;
      line-height: ${node.offsetHeight}px;
      position: absolute;
      text-align: center;
      left: ${node.offsetLeft}px;
      top: ${node.offsetTop}px;
      z-index: 2147483647;
    `;
  node.offsetParent?.appendChild(div);
}

function removeLoading(node, loadingId) {
  const div = node.offsetParent.querySelector(`#${loadingId}`);
  if (div) {
    div.remove();
  }
}

/**
 * 输入框翻译
 */
export default function inputTranslate({
  inputRule: {
    transOpen,
    triggerShortcut,
    translator,
    fromLang,
    toLang,
    triggerCount,
    triggerTime,
    transSign,
  } = DEFAULT_INPUT_RULE,
  transApis,
}) {
  if (!transOpen) {
    return;
  }

  const apiSetting = transApis?.[translator] || DEFAULT_TRANS_APIS[translator];
  if (triggerShortcut.length === 0) {
    triggerShortcut = DEFAULT_INPUT_SHORTCUT;
    triggerCount = 1;
  }

  stepShortcutRegister(
    triggerShortcut,
    async () => {
      let node = document.activeElement;

      if (!node) {
        return;
      }

      while (node.shadowRoot) {
        node = node.shadowRoot.activeElement;
      }

      if (!isInputNode(node) && !isEditAbleNode(node)) {
        return;
      }

      let initText = getNodeText(node);
      if (triggerShortcut.length === 1 && triggerShortcut[0].length === 1) {
        // todo: remove multiple char
        initText = removeEndchar(initText, triggerShortcut[0], triggerCount);
      }
      if (!initText.trim()) {
        return;
      }

      let text = initText;
      if (transSign) {
        const res = matchInputStr(text, transSign);
        if (res) {
          let lang = res[1];
          if (lang === "zh" || lang === "cn") {
            lang = "zh-CN";
          } else if (lang === "tw" || lang === "hk") {
            lang = "zh-TW";
          }
          if (lang && OPT_LANGS_LIST.includes(lang)) {
            toLang = lang;
          }
          text = res[2];
        }
      }

      // console.log("input -->", text);

      const loadingId = "kiss-" + genEventName();
      try {
        addLoading(node, loadingId);

        const [trText, isSame] = await apiTranslate({
          translator,
          text,
          fromLang,
          toLang,
          apiSetting,
        });
        if (!trText || isSame) {
          return;
        }

        if (isInputNode(node)) {
          node.value = trText;
          node.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true })
          );
          return;
        }

        selectContent(node);
        await sleep(200);

        pasteContentEvent(node, trText);
        await sleep(200);

        // todo: use includes?
        if (getNodeText(node).startsWith(initText)) {
          pasteContentCommand(node, trText);
          await sleep(100);
        } else {
          collapseToEnd(node);
        }
      } catch (err) {
        kissLog(err, "translate input");
      } finally {
        removeLoading(node, loadingId);
      }
    },
    triggerCount,
    triggerTime
  );
}
