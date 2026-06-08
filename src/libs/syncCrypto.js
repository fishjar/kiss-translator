/**
 * @file syncCrypto.js
 * @description 个人同步数据的端到端加密工具。只加密远端同步包中的 value 字段，
 * 外层 key/updateAt 保持明文，以兼容现有文件名与时间戳冲突判断。
 */

const SYNC_CRYPTO_VERSION = 1;
const SYNC_CRYPTO_ALG = "AES-GCM";
const SYNC_CRYPTO_KDF = "PBKDF2-SHA-256";
const SYNC_CRYPTO_ITERATIONS = 100000;
const SYNC_CRYPTO_SALT_LENGTH = 16;
const SYNC_CRYPTO_IV_LENGTH = 12;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const getSubtleCrypto = () => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is not available");
  }
  return subtle;
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBytes = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * 通过用户设定的同步加密口令和随机盐派生 AES-GCM 密钥。
 * @param {string} syncKey 用户设定的同步加密口令
 * @param {Uint8Array} salt 每次加密生成并随密文保存的随机盐
 * @returns {Promise<CryptoKey>}
 */
const deriveSyncKey = async (syncKey, salt) => {
  const subtle = getSubtleCrypto();
  const keyMaterial = await subtle.importKey(
    "raw",
    textEncoder.encode(syncKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: SYNC_CRYPTO_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: SYNC_CRYPTO_ALG, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

/**
 * 尝试识别新版加密 envelope；无法识别时按旧版明文 value 处理。
 * @param {string} value 远端同步包中的 value 字符串
 * @returns {Object|null}
 */
const parseSyncValueEnvelope = (value) => {
  try {
    const parsed = JSON.parse(value);
    if (
      parsed?.encrypted === true &&
      parsed.version &&
      parsed.alg &&
      parsed.kdf &&
      parsed.data
    ) {
      return parsed;
    }
  } catch {
    // 旧版明文同步数据本身也是普通 JSON 字符串，不需要在这里处理。
  }
  return null;
};

/**
 * 加密同步 value，并返回可直接写入远端 JSON 的 envelope 字符串。
 * @param {string} value 已序列化的业务数据
 * @param {string} syncKey 用户设定的同步加密口令
 * @returns {Promise<string>}
 */
export const encryptSyncValue = async (value, syncKey) => {
  const salt = globalThis.crypto.getRandomValues(
    new Uint8Array(SYNC_CRYPTO_SALT_LENGTH)
  );
  const iv = globalThis.crypto.getRandomValues(
    new Uint8Array(SYNC_CRYPTO_IV_LENGTH)
  );
  const key = await deriveSyncKey(syncKey, salt);
  const encrypted = await getSubtleCrypto().encrypt(
    { name: SYNC_CRYPTO_ALG, iv },
    key,
    textEncoder.encode(value)
  );

  return JSON.stringify({
    encrypted: true,
    version: SYNC_CRYPTO_VERSION,
    alg: SYNC_CRYPTO_ALG,
    kdf: SYNC_CRYPTO_KDF,
    iterations: SYNC_CRYPTO_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  });
};

/**
 * 解密新版同步 value；旧版明文 value 会原样返回并标记 encrypted=false。
 * @param {string} value 远端同步包中的 value 字符串
 * @param {string} syncKey 用户设定的同步加密口令
 * @returns {Promise<{value: string, encrypted: boolean}>}
 */
export const decryptSyncValue = async (value, syncKey) => {
  const envelope = parseSyncValueEnvelope(value);
  if (!envelope) {
    return { value, encrypted: false };
  }

  if (
    envelope.version !== SYNC_CRYPTO_VERSION ||
    envelope.alg !== SYNC_CRYPTO_ALG ||
    envelope.kdf !== SYNC_CRYPTO_KDF ||
    envelope.iterations !== SYNC_CRYPTO_ITERATIONS
  ) {
    throw new Error("Unsupported sync encryption format");
  }

  const key = await deriveSyncKey(syncKey, base64ToBytes(envelope.salt));
  const decrypted = await getSubtleCrypto().decrypt(
    { name: SYNC_CRYPTO_ALG, iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data)
  );

  return {
    value: textDecoder.decode(decrypted),
    encrypted: true,
  };
};
