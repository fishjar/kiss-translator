// Generic HMAC example; /dictionary is a mock/custom endpoint, not an OpenAI API.
exports.dictionary = async function (input, config, ctx) {
  var body = { text: input.text, language: input.language || "" };
  var signature = await ctx.secrets.sign(ctx.secrets.ref("apiKey"), {
    data: JSON.stringify(body),
  });
  var response = await ctx.http.request({
    url: config.baseUrl.replace(/\/+$/, "") + "/dictionary",
    method: "POST",
    headers: { "X-Signature": signature },
    bodyType: "json",
    body: body,
    responseType: "text",
  });
  var result = JSON.parse(response.body);
  return { text: result.text, format: result.format || "text" };
};
