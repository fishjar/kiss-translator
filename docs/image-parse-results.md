# Structured image parsing

`parseImage` remains the image parsing capability. API 1 services may declare boolean `includesTranslation` and `includesLayout`; omitted values are false. These flags describe adapter support, not a request to generate those outputs. OCR text polygons (`coordinates`) remain distinct from layout regions.

## Prompts and protocol

Existing `vlm` prompts continue returning original text. The new image translation and bilingual parsing presets declare `protocol: "image-json"`. The selected prompt determines what the model should generate; the SDK appends a shared JSON wire contract, image dimensions, source/target language and glossary. No manufacturer-specific content-mode API parameter is needed. Custom copies preserve protocol metadata; JSON-looking legacy text is never auto-detected as this protocol.

The host supplies `protocol`, `sourceLanguage`, `targetLanguage` and `glossary` to structured image requests. New presets are available only for services declaring structured translation or layout support. Original extraction remains the default. Text-only and native services without an implementation of this contract are not silently upgraded.

## Result

```json
{
  "text": "Hello world.",
  "format": "text",
  "translation": {
    "text": "你好，世界。",
    "targetLanguage": "zh-CN",
    "format": "text"
  },
  "layout": {
    "regions": [
      {
        "id": "p1",
        "type": "paragraph",
        "order": 0,
        "poly": [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50]
        ],
        "text": "Hello world.",
        "translation": "你好，世界。"
      }
    ]
  }
}
```

Unrequested fields may be omitted. `text` and OCR `items[].text` always contain original text. Translation-only output is valid. Regions are ordered and identified by unique IDs. The adapter aggregates region contents; the host never guesses correspondence by splitting two documents into lines. Layout coordinates refer to the prepared image, then map to the original image. They are never fabricated as text-line coordinates.

Invalid translation fields are discarded while usable source text is retained. Invalid layouts are not drawn or used for cropping. Truncated or malformed structured responses fail and are not successful cache entries. Structural validation does not establish semantic translation or coordinate accuracy.

## Image/screenshot scheduling

The selected text translation service is a fallback. Valid image translations bypass it; only source content without valid target translations is translated. Recognition-only retains parsed content without calling fallback. A fallback failure preserves other successful items. Translation-only results have no synthetic original. Language changes invalidate parsed image results; changing the fallback service preserves image-generated translations and reuses source content.

Structured fusion skips automatic preceding layout analysis. Existing user selections take priority, empty selections process nothing, and returned content is not cropped and parsed again. Disabling the independent layout service does not disable layouts returned by image parsing. Explicit user-requested layout analysis still runs separately.

The first implementation applies this scheduling to the webpage image/screenshot panel. PDF and file-translation workflows retain their existing source-recognition behavior. No repainting or word-coordinate inference is added.

## Compatibility and release

The host checkout remains 2.2.5 during development. New official packages reserve `minHostVersion: "2.2.6"`; release maintainers must confirm the actual supporting release and adjust this floor if its version differs. Do not publish these packages before that host release. Production compatibility checks are unchanged. Plugin host tests may simulate that future version using the test-only `KISS_TRANSLATOR_TEST_VERSION=2.2.6` environment variable; this does not change the host checkout or runtime.
