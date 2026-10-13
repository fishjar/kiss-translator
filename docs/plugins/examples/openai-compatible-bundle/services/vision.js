// OpenAI-compatible vision demonstrates task-owned binary reads, not fabricated OCR boxes.
exports.parseImage = async function (input, config, ctx) {
  var bytes = await ctx.assets.read(input.image);
  var imageUrl =
    "data:" +
    input.image.mimeType +
    ";base64," +
    ctx.helpers.encoding.bytesToBase64(bytes);
  var request = ctx.helpers.openai.chatCompletions.buildRequest({
    baseUrl: config.baseUrl,
    model: config.model,
    ...(/^gpt-6(?:[.-]|$)/.test(config.model)
      ? {
          reasoning_effort: /^gpt-6-(luna|sol)(?:-|$)/.test(config.model)
            ? "none"
            : "low",
        }
      : {}),
    auth: { type: "bearer", secret: ctx.secrets.ref("apiKey") },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              input.prompt ||
              "Extract the visible text faithfully. Output only the recognized text.",
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });
  var result = ctx.helpers.openai.chatCompletions.parseResponse(
    await ctx.http.request(request)
  );
  return {
    text: result.text,
    format: "text",
    items: result.text
      .split(/\r?\n/)
      .filter(Boolean)
      .map(function (text) {
        return { text: text, poly: null };
      }),
  };
};
