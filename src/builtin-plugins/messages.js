// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const buildSystemRoleMessages = (systemPrompt) =>
  systemPrompt?.trim()
    ? [
        {
          role: "system",
          content: systemPrompt,
        },
      ]
    : [];

export { buildSystemRoleMessages };
