import { storage } from "../libs/storage";
import { STOKEY_SETTING, STOKEY_RULES } from "../config/storage";
import { instanceTestSignature, replaceServiceReferences } from "./upgrade";
import { resolveApiPromptSettings } from "../config/prompt";

/** Both reference sets and their sync metadata commit under the existing storage coordinator. */
export async function commitServiceReplacement(
  oldSlug,
  newSlug,
  selected,
  tested
) {
  if (!selected.length) return;
  const timestamp = Date.now();
  return storage.withTransaction(async (transaction) => {
    const setting = await transaction.getObj(STOKEY_SETTING);
    const rules = (await transaction.getObj(STOKEY_RULES)) || [];
    const api = setting?.transApis?.find((item) => item.apiSlug === newSlug);
    if (!api) throw new Error("新实例已被删除");
    const signature = instanceTestSignature(
      resolveApiPromptSettings(api, setting.prompts, setting.subtitleSetting)
    );
    if (selected.some((item) => tested[item.capability] !== signature))
      throw new Error("请先测试所有选中引用所需的能力；配置变化后需重新测试");
    const next = replaceServiceReferences(
      setting,
      rules,
      oldSlug,
      api,
      selected
    );
    if (selected.some((item) => item.scope === "setting"))
      await transaction.saveEdit(
        STOKEY_SETTING,
        () => next.setting,
        undefined,
        {
          timestamp,
        }
      );
    if (selected.some((item) => item.scope === "rules"))
      await transaction.saveEdit(STOKEY_RULES, () => next.rules, undefined, {
        timestamp,
      });
  });
}
