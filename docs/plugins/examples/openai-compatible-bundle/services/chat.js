// SDK v1 示例；用户脚本通过宿主提供的 ctx SDK 执行。
// 一个接口实例拥有 chat、translate 两项能力，共用请求实现。
async function complete(messages, config, ctx, translationInput) {
  if (!config.model || !config.baseUrl) {
    throw new Error("请配置模型和 API 基础地址");
  }
  // GPT-6 reasoning requests reject sampling parameters unless effort is none.
  var reasoning = /^gpt-6(?:[.-]|$)/.test(config.model)
    ? /^gpt-6-(luna|sol)(?:-|$)/.test(config.model)
      ? "none"
      : "low"
    : null;
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    messages: messages,
    stream: Boolean(ctx.options && ctx.options.streaming),
    ...(reasoning ? { reasoning_effort: reasoning } : {}),
    ...((!reasoning || reasoning === "none") &&
    typeof config.temperature === "number"
      ? { temperature: config.temperature }
      : {}),
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
  });
  if (!(ctx.options && ctx.options.streaming)) {
    var response = await ctx.http.request(request);
    return ctx.helpers.openai.chatCompletions.parseResponse(response);
  }
  var parser = ctx.helpers.openai.chatCompletions.createStreamParser();
  var translation = translationInput
    ? await ctx.helpers.translation.createStreamParser(translationInput)
    : null;
  for await (var frame of ctx.http.stream(request)) {
    if (frame.type !== "sse") continue;
    for (var event of parser.push(frame.data)) {
      if (translation) {
        if (event.type === "text.delta")
          for (var item of translation.push(event.text)) await ctx.emit(item);
      } else await ctx.emit(event);
    }
  }
  // Both the SSE terminal frame and every expected translation ID must be present.
  var result = parser.finish();
  return translation ? translation.finish() : result;
}

exports.chat = async function (input, config, ctx) {
  return complete(input.messages, config, ctx);
};

exports.translate = async function (input, config, ctx) {
  var messages = ctx.helpers.translation.buildMessages(input);
  var result = await complete(
    messages,
    Object.assign({}, config, { temperature: config.translationTemperature }),
    ctx,
    input
  );
  // 解析器负责格式、缺项、重复/未知 ID 校验，不直接按返回顺序配对。
  if (ctx.options && ctx.options.streaming) return result;
  return ctx.helpers.translation.parseResult(result.text, input);
};
