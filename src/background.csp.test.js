import fs from "fs";
import path from "path";
import vm from "vm";
import { PADDLEOCR_ORIGIN } from "./config/apiConstants";
import { normalizeOriginRewriteList } from "./libs/originRules";

// 只截取 updateCspRules，避免加载整个 background.js 的副作用。
const source = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
const start = source.indexOf("async function updateCspRules");
const end = source.indexOf("\n/**", start);
const updateCspRulesSource = source.slice(start, end);

const CSP_RULE_START_ID = 1000;
const ORI_RULE_START_ID = 2000;
const EXTENSION_INITIATOR_DOMAIN = "kiss-translator";

function createHarness(oldRules) {
  const browser = {
    declarativeNetRequest: {
      getDynamicRules: jest.fn(async () => oldRules),
      updateDynamicRules: jest.fn(async () => undefined),
    },
  };
  const context = vm.createContext({
    browser,
    normalizeOriginRewriteList,
    CSP_REMOVE_HEADERS: ["content-security-policy"],
    CSP_RULE_START_ID,
    ORI_RULE_START_ID,
    EXTENSION_INITIATOR_DOMAIN,
    logger: { child: () => ({ info: jest.fn() }) },
  });
  vm.runInContext(
    `${updateCspRulesSource}\nthis.updateCspRules = updateCspRules;`,
    context
  );
  return { browser, updateCspRules: context.updateCspRules };
}

const originRules = () => [
  { id: ORI_RULE_START_ID },
  { id: ORI_RULE_START_ID + 1 },
];

test("editing the CSP list keeps existing Origin rules", async () => {
  const { browser, updateCspRules } = createHarness([
    { id: CSP_RULE_START_ID },
    ...originRules(),
  ]);
  await updateCspRules({ csplist: "https://example.com" });
  const [update] =
    browser.declarativeNetRequest.updateDynamicRules.mock.calls[0];
  // 只移除并重建 CSP 段，Origin 段必须原样保留。
  expect(update.removeRuleIds).toEqual([CSP_RULE_START_ID]);
  expect(update.addRules.map((rule) => rule.id)).toEqual([CSP_RULE_START_ID]);
});

test("editing the Origin list rebuilds it and always keeps PaddleOCR", async () => {
  const { browser, updateCspRules } = createHarness(originRules());
  await updateCspRules({ orilist: "https://dict.youdao.com" });
  const [update] =
    browser.declarativeNetRequest.updateDynamicRules.mock.calls[0];
  expect(update.removeRuleIds).toEqual([
    ORI_RULE_START_ID,
    ORI_RULE_START_ID + 1,
  ]);
  expect(update.addRules.map((rule) => rule.condition.urlFilter)).toEqual([
    "https://dict.youdao.com",
    PADDLEOCR_ORIGIN,
  ]);
});
