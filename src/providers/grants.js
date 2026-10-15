import { browser } from "../libs/browser";
import { providerError } from "./capabilities";

export const PLUGIN_GRANT_PREFIX = "kiss-provider-plugin-grant:";
export function providerGrantKey(pluginId) {
  if (typeof pluginId !== "string" || !/^[a-z][a-z0-9-]{1,100}$/.test(pluginId))
    throw providerError(
      "INVALID_CONFIG",
      "服务快照缺少有效的插件 ID，无法授权"
    );
  return `${PLUGIN_GRANT_PREFIX}${pluginId}`;
}
export function providerPluginId(instance) {
  const id = instance.provider?.source?.pluginId;
  providerGrantKey(id);
  return id;
}
export async function readPluginGrant(pluginId) {
  const key = providerGrantKey(pluginId);
  const grant = (await browser.storage.local.get(key))[key];
  return grant?.enabled === true && Array.isArray(grant.origins) ? grant : null;
}
export async function approvePlugin(pluginId, origins) {
  const previous = await readPluginGrant(pluginId);
  await browser.storage.local.set({
    [providerGrantKey(pluginId)]: {
      enabled: true,
      origins: [...new Set([...(previous?.origins || []), ...origins])],
    },
  });
}
export async function revokePlugin(pluginId) {
  await browser.storage.local.remove(providerGrantKey(pluginId));
}
export function requestedOrigins(instance) {
  const origins = new Set(instance.provider.permissions?.network || []);
  for (const field of instance.provider.permissions?.endpointFields || []) {
    if (instance.pluginConfig?.[field])
      origins.add(new URL(instance.pluginConfig[field]).origin);
  }
  return [...origins];
}
export async function approvedProviderOrigins(instance) {
  const grant = await readPluginGrant(providerPluginId(instance));
  if (
    !grant ||
    (instance.provider.permissions?.network || []).some(
      (origin) => !grant.origins.includes(origin)
    )
  )
    throw providerError(
      "PERMISSION_REQUIRED",
      "请前往接口插件授权此插件及其声明的固定网络地址"
    );
  return new Set(requestedOrigins(instance));
}
