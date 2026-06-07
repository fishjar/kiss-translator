import {
  APP_LCNAME,
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_WORDS_KEY,
  KV_RULES_SHARE_KEY,
  KV_SALT_SHARE,
  OPT_SYNCTYPE_WEBDAV,
  OPT_SYNCTYPE_GIST,
} from "../config";
import {
  getSyncWithDefault,
  putSync,
  getSettingWithDefault,
  getRulesWithDefault,
  getWordsWithDefault,
  setSetting,
  setRules,
  setWords,
} from "./storage";
import {
  apiSyncData,
  apiCreateGist,
  apiListGists,
  apiGetGist,
  apiUpdateGistFile,
  apiFetchText,
} from "../apis";
import { sha256, removeEndchar } from "./utils";
import { createClient, getPatcher } from "webdav";
import { fetchPatcher } from "./fetch";
import { kissLog } from "./log";

let webdavRequestPatched = false;

/**
 * 确保 WebDAV 库的 request 通道只被补丁一次。
 *
 * @returns {void}
 */
const ensureWebdavRequestPatched = () => {
  if (webdavRequestPatched) return;
  webdavRequestPatched = true;

  // WebDAV 同步只在实际使用前安装补丁，避免模块导入时产生隐式全局副作用。
  getPatcher().patch("request", (opts) => {
    return fetchPatcher(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.data,
    });
  });
};

/**
 * 使用 WebDAV 同步规则或设置数据。
 * @param {Object} data 待同步的数据结构
 * @param {string} data.key 数据保存的唯一键值名 (如 setting/rules)
 * @param {string} data.value 数据序列化后的字符串
 * @param {number} data.updateAt 本地最后更新时间戳
 * @param {Object} params WebDAV 连接参数
 * @param {string} params.syncUrl 云端 WebDAV 地址
 * @param {string} params.syncUser 账号用户名
 * @param {string} params.syncKey 账号密码或应用授权码
 * @returns {Promise<Object>} 返回最终云端与本地同步判定后的最新数据对象
 */
const syncByWebdav = async (data, { syncUrl, syncUser, syncKey }) => {
  ensureWebdavRequestPatched();

  const client = createClient(syncUrl, {
    username: syncUser,
    password: syncKey,
  });
  const pathname = `/${APP_LCNAME}`;
  const filename = `/${APP_LCNAME}/${data.key}`;

  // 1. 若云端应用根目录不存在，则创建对应文件夹
  if ((await client.exists(pathname)) === false) {
    await client.createDirectory(pathname);
  }

  // 2. 若云端文件已存在，则读取云端内容，对比 updateAt 时间戳以决定“谁覆盖谁”
  const isExist = await client.exists(filename);
  if (isExist) {
    const cont = await client.getFileContents(filename, { format: "text" });
    const webData = JSON.parse(cont);

    // REVIEW: 纯时间戳机制。若云端数据版本更新或与本地一致，则放弃本地上传，返回云端数据以更新本地
    if (webData.updateAt >= data.updateAt) {
      return webData;
    }
  }

  // 3. 若云端没有该文件或本地数据更新，则把本地最新数据上传覆盖云端文件
  await client.putFileContents(filename, JSON.stringify(data, null, 2));
  return data;
};

/**
 * 通过自建 Worker 转发接口同步数据。
 * @param {Object} data 同步数据
 * @param {Object} params Worker 连接参数
 * @param {string} params.syncUrl 自建 Worker API 的基础路径
 * @param {string} params.syncKey 访问 Worker 的校验密钥
 * @returns {Promise<Object>} 同步后的最新数据
 */
const syncByWorker = async (data, { syncUrl, syncKey }) => {
  syncUrl = removeEndchar(syncUrl, "/");
  return await apiSyncData(`${syncUrl}/sync`, syncKey, data);
};

export const getGistId = (input = "") => {
  const value = input.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return value;
  }
};

const getGistDescription = async (syncKey) => {
  const description = "kiss translator sync files";
  const gists = await apiListGists(syncKey);
  if (gists.some((gist) => gist.description === description)) {
    return `${description}-${Date.now()}`;
  }
  return description;
};

const getGistFilename = (key) => {
  if (key.startsWith("kiss-rules_")) return `sync-rules_${key}`;
  if (key === KV_WORDS_KEY) return `sync-words_${key}`;
  return key;
};

const syncByGist = async (data, { syncUrl, syncKey }) => {
  const gistId = getGistId(syncUrl);
  const filename = getGistFilename(data.key);
  const content = JSON.stringify(data, null, 2);

  if (!gistId) {
    const gist = await apiCreateGist(
      syncKey,
      {
        key: filename,
        content,
      },
      await getGistDescription(syncKey)
    );
    await putSync({ syncUrl: gist.id });
    return data;
  }

  const gist = await apiGetGist(gistId, syncKey);
  const file = gist.files?.[filename] || gist.files?.[data.key];
  if (file) {
    const fileContent = file.content || (await apiFetchText(file.raw_url));
    const gistData = JSON.parse(fileContent);
    if (gistData.updateAt >= data.updateAt) {
      return gistData;
    }
  }

  await apiUpdateGistFile(gistId, syncKey, filename, content);
  return data;
};

/**
 * 核心同步调度器。根据配置的 syncType（WebDAV / Worker）执行对应的网络同步，
 * 并依据“最新修改时间戳”双向更新本地 Storage 与云端。
 * @param {string} key 存储键值 (如 KV_SETTING_KEY, KV_RULES_KEY)
 * @param {*} value 本地最新的状态数据值
 * @returns {Promise<{value: *, isNew: boolean}|undefined>}
 *          value: 最终判定采用的最新数据值，isNew: 标识该数据是否比本地之前的数据新
 */
export const syncData = async (key, value) => {
  // 获取同步服务配置
  const {
    syncType,
    syncUrl,
    syncUser,
    syncKey,
    syncMeta = {},
  } = await getSyncWithDefault();

  // 若未填写必要的同步参数，则直接退出不报错
  if (
    !syncKey ||
    (syncType !== OPT_SYNCTYPE_GIST && !syncUrl) ||
    (syncType === OPT_SYNCTYPE_WEBDAV && !syncUser)
  ) {
    return;
  }

  let { updateAt = 0, syncAt = 0 } = syncMeta[key] || {};
  if (syncAt === 0) {
    updateAt = 0; // 若从未同步过，将更新时间置 0 以触发首次拉取云端
  }

  const data = {
    key,
    value: JSON.stringify(value),
    updateAt,
  };
  const args = {
    syncUrl,
    syncUser,
    syncKey,
  };

  // 根据同步类型执行不同的同步方法
  const res =
    syncType === OPT_SYNCTYPE_WEBDAV
      ? await syncByWebdav(data, args)
      : syncType === OPT_SYNCTYPE_GIST
        ? await syncByGist(data, args)
        : await syncByWorker(data, args);

  if (!res) {
    throw new Error("sync data got err", key);
  }

  const newVal = JSON.parse(res.value);
  // 若返回的云端数据更新时间戳晚于本地，则说明云端有新更改需要覆盖本地
  const isNew = res.updateAt > updateAt;

  // 更新本地同步元数据，包含云端的最新修改时间及当前的同步操作时间
  syncMeta[key] = {
    updateAt: res.updateAt,
    syncAt: Date.now(),
  };
  await putSync({ syncMeta });

  return { value: newVal, isNew };
};

/**
 * 同步用户设置 (Setting)。若云端设置更新，则覆盖本地设置。
 */
const syncSetting = async () => {
  const value = await getSettingWithDefault();
  const res = await syncData(KV_SETTING_KEY, value);
  if (res?.isNew) {
    await setSetting(res.value);
  }
};

/**
 * 包装错误捕获的设置同步入口，避免网络错误阻断其他逻辑。
 */
export const trySyncSetting = async () => {
  try {
    await syncSetting();
  } catch (err) {
    kissLog("sync setting", err.message);
  }
};

/**
 * 同步规则 (Rules)。若云端规则更新，则覆盖本地规则。
 */
const syncRules = async () => {
  const value = await getRulesWithDefault();
  const res = await syncData(KV_RULES_KEY, value);
  if (res?.isNew) {
    await setRules(res.value);
  }
};

/**
 * 包装错误捕获的规则同步入口。
 */
export const trySyncRules = async () => {
  try {
    await syncRules();
  } catch (err) {
    kissLog("sync user rules", err.message);
  }
};

/**
 * 同步生词本词汇 (Fav Words)。若云端有更新，则覆盖本地。
 */
const syncWords = async () => {
  const value = await getWordsWithDefault();
  const res = await syncData(KV_WORDS_KEY, value);
  if (res?.isNew) {
    await setWords(res.value);
  }
};

/**
 * 包装错误捕获的生词本同步入口。
 */
export const trySyncWords = async () => {
  try {
    await syncWords();
  } catch (err) {
    kissLog("sync fav words", err.message);
  }
};

/**
 * 同步并公开分享当前规则。
 * 将用户的规则数组推送到 Worker 云端服务，并生成一个基于 sha256 签名的唯一订阅分享链接。
 * @param {Object} params
 * @param {Array<Object>} params.rules 待分享的规则数组
 * @param {string} params.syncUrl 分享 Worker 端点
 * @param {string} params.syncKey 分享校验密钥
 * @returns {Promise<string>} 返回生成的规则订阅分享 URL
 */
export const syncShareRules = async ({ rules, syncUrl, syncKey }) => {
  const data = {
    key: KV_RULES_SHARE_KEY,
    value: JSON.stringify(rules, null, 2),
    updateAt: Date.now(),
  };
  const args = {
    syncUrl,
    syncKey,
  };

  // REVIEW: 分享规则采用 Worker 接口，直接将全部规则上传云端
  await syncByWorker(data, args);

  // 利用 SHA256 密钥对生成预共享密钥 (psk) 并加固定盐，保障分享接口的鉴权
  // WARNING: 鉴权参数 psk 暴露在 URL 中作为查询参数。如果用户在非 HTTPS 环境下传输或分享该链接，
  // 可能会因网络中间人嗅探或浏览器历史记录泄露该 psk，存在未授权访问或篡改风险。建议强制提示使用 HTTPS URL。
  const psk = await sha256(syncKey, KV_SALT_SHARE);
  const shareUrl = `${syncUrl}/rules?psk=${psk}`;
  return shareUrl;
};

/**
 * 顺序同步个人设置、自定义规则以及生词本。
 */
export const syncSettingAndRules = async () => {
  await syncSetting();
  await syncRules();
  await syncWords();
};

/**
 * 包装错误捕获的完整同步链入口。
 */
export const trySyncSettingAndRules = async () => {
  await trySyncSetting();
  await trySyncRules();
  await trySyncWords();
};
