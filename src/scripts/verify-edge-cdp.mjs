import fs from "node:fs/promises";

const port = 9333;
const res = await fetch(`http://127.0.0.1:${port}/json`);
const targets = await res.json();
const opt = targets.find((t) => t.url?.includes("options.html"));

class SimpleCdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.callbacks = new Map();
  }
  async connect() {
    return new Promise((resolve) => {
      this.ws.onopen = resolve;
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

const cdp = new SimpleCdp(opt.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

// 重新加载页面以拉取最新构建的 options.js 产物
console.log("重新加载 options.html 页面...");
await cdp.send("Page.reload");
await new Promise((r) => setTimeout(r, 2500));

// 确保在 DOC Tab
await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const docTab = tabs.find(t => t.textContent.trim() === 'DOC');
    if (docTab) docTab.click();
  })()`,
});
await new Promise((r) => setTimeout(r, 1200));

// 点击“运行日志”折叠栏使其展开
const expandResult = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const summary = document.querySelector('.MuiAccordionSummary-root');
    if (summary) {
      summary.click();
      return 'CLICKED_LOG_SUMMARY';
    }
    return 'SUMMARY_NOT_FOUND';
  })()`,
  returnByValue: true,
});
console.log("点击日志展开面板:", expandResult.result?.value);
await new Promise((r) => setTimeout(r, 600));

// 检查日志面板状态和位置
const evalState = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const cards = Array.from(document.querySelectorAll('.MuiCard-root'));
    const lastCard = cards[cards.length - 1];
    const logInLastCard = Boolean(lastCard && lastCard.querySelector('.MuiAccordion-root'));
    const isAccordionExpanded = Boolean(document.querySelector('.MuiAccordion-root.Mui-expanded'));
    const logText = document.querySelector('.MuiAccordionDetails-root')?.innerText;
    return {
      totalCards: cards.length,
      logInActionCard: logInLastCard,
      isAccordionExpanded,
      logContentPreview: logText?.slice(0, 300)
    };
  })()`,
  returnByValue: true,
});
console.log("日志与卡片结构检查:\n", JSON.stringify(evalState.result?.value, null, 2));

// 截图验证
const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
const artifactPath = "C:/Users/gabe/.gemini/antigravity/brain/31e308eb-e526-4055-9dfb-393b67baee3a/edge_doc_log_expanded.png";
await fs.writeFile(artifactPath, Buffer.from(screenshot.data, "base64"));
console.log("更新后展开日志截图已保存至:", artifactPath);

cdp.close();
