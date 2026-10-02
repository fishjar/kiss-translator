import { isInBlacklist } from "../../libs/blacklist";
import { kissLog } from "../../libs/log";
import { deriveRuleContext } from "../../libs/rules";
import {
  getDisabledSubRules,
  getRulesWithDefault,
  getSettingWithDefault,
  getSubRules,
} from "../../libs/storage";

/** Describe a stored disabled site without starting its page runtime. */
export async function loadDisabledPopupData(tab) {
  const href = tab?.url;
  try {
    if (!href || tab.pendingUrl) return undefined;
    if (!["http:", "https:", "file:"].includes(new URL(href).protocol)) {
      return undefined;
    }
    const setting = await getSettingWithDefault();
    if (
      typeof setting?.blacklist !== "string" ||
      !isInBlacklist(href, setting.blacklist)
    ) {
      return undefined;
    }
    const personalRules = await getRulesWithDefault();
    const subscription = setting.injectRules
      ? setting.subrulesList?.find((item) => item.selected)
      : null;
    const [subRules, disabledPatterns] = subscription?.url
      ? await Promise.all([
          getSubRules(subscription.url),
          getDisabledSubRules(subscription.url),
        ])
      : [[], []];
    // Use cached subscription rules only. Opening a disabled site must not
    // fetch a subscription, write its cache, or start page translation.
    const { effective: rule } = deriveRuleContext(href, {
      personalRules,
      subRules: subRules || [],
      disabledPatterns: disabledPatterns || [],
    });
    return {
      rule,
      setting,
      isDisabledPage: true,
      isTopFrame: true,
      capabilities: {
        pageTranslation: false,
        ruleEditor: false,
        selectionTranslation: true,
        hoverTranslation: true,
        inputTranslation: true,
      },
    };
  } catch (error) {
    kissLog("load disabled popup page", error);
    return undefined;
  }
}
