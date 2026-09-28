/**
 * @file webdav-stub.js
 * @description 油猴脚本等轻量运行环境的 WebDAV 依赖空实现 Stub，避免将庞大的 webdav 客户端协议栈编入单文件脚本。
 */

export const createClient = () => ({
  exists: async () => false,
  createDirectory: async () => {},
  getFileContents: async () => "",
  putFileContents: async () => {},
});

export const getPatcher = () => ({
  patch: () => {},
});

const defaultExport = {
  createClient,
  getPatcher,
};

export default defaultExport;
