# Rapid-MLX

[Rapid-MLX](https://rapidmlx.com) is a local OpenAI-compatible inference server for Apple Silicon Macs.

Install it on the Mac that will run inference:

```sh
pip install rapid-mlx
```

Start the server with permission for KISS Translator's Chrome Web Store extension origin:

```sh
rapid-mlx serve qwen3.5-4b-4bit --cors-origins chrome-extension://bdiifdefkgmcblbcghdlonllpjhhjgof
```

Rapid-MLX rejects requests carrying a foreign `Origin` unless it is allowed.
For an unpacked Chrome build or another Chromium browser, replace the origin with
`chrome-extension://<EXTENSION_ID>` using the actual ID shown on its extensions
page. For Firefox, use `--cors-origins moz-extension://<uuid>` with the actual
extension UUID shown in `about:debugging#/runtime/this-firefox`.

In **Settings → Service configuration**, add a built-in **Rapid-MLX** service:

- API endpoint: `http://127.0.0.1:8000/v1/chat/completions`
- Model list URL: `http://127.0.0.1:8000/v1/models`
- API key: leave blank by default. If you started the server with `--api-key`, enter that key here.
- Model: focus the Model field to fetch the list, then select an ID returned by your server. No model is selected by default.

These fields take full endpoint URLs, rather than a base URL. If using another
port, change it in both URLs. Test and save the service, assign it to the webpage
translation scenario, then press `Alt+Q` on a page to translate it. Streaming,
batch translation, and conversation context use the existing translation controls.

## 中文说明

在 Apple Silicon Mac 上安装 `pip install rapid-mlx`，然后使用上面的启动命令。
Chrome 商店版的来源为 `chrome-extension://bdiifdefkgmcblbcghdlonllpjhhjgof`；
本地加载或其他 Chromium 浏览器请替换为实际的 `chrome-extension://<EXTENSION_ID>`，
Firefox 请使用 `--cors-origins moz-extension://<uuid>` 并填入实际 UUID。
必须允许扩展的来源，否则 Rapid-MLX 会拒绝请求。

在「服务配置」中添加内置的 **Rapid-MLX**，填写上面的完整 API 和模型列表地址，
默认 API Key 留空（仅在服务端设置 `--api-key` 时填写）。聚焦 Model 输入框后，
选择服务端返回的模型 ID，测试并保存，再将该服务用于网页翻译场景，按 `Alt+Q` 翻译。
