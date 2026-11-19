# Structured image parsing

`parseImage` remains the image parsing capability. Services may declare boolean `includesTranslation` and `includesLayout`. Omitted values are false. When the selected service declares `includesLayout`, automatic whole-image recognition skips the separate layout service in the web, screenshot and file image workflows. Manual layout requests, explicit regions and PDF page layout still follow their existing workflows. OCR text polygons (`coordinates`) describe positions of text lines.

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

Explicitly selecting an independent layout service always runs that service; adapter capability declarations do not override the selection. Existing user selections take priority and empty selections process nothing. With no independent service selected, returned layout and content can be used without cropping and parsing them again. Disabling the independent layout service does not prohibit layouts returned by image parsing. Explicit user-requested layout analysis still runs separately.

The same request construction, provider invocation, validation and translation reuse rules now apply to webpage images/screenshots, file images and PDF document-region recognition. File images no longer automatically select a layout service when the saved selection is empty. Choose a service explicitly to retain a separate layout pass. Existing image repainting requires actual text coordinates, never layout-only polygons.

## File bridge and PDF regions

File pages wait for the latest pending scene save before starting visual recognition, so requests do not race saved languages, prompts or terminology. Native-only PDF parsing does not require structured-image support.

File protocol remains version 1. New file pages send `kind: "image" | "pdf"` with `recognizeImage`; the background reads the saved scene and resolves languages, terminology and prompts. The context advertises `features.structuredImageResults`, per-scene visual signatures and prompt fingerprints. Old source-recognition requests remain valid. New pages connected to an older host hide structured presets and reject unsupported structured selections with an upgrade message.

PDF Smart parsing retains its independent page-layout requirement; full-page fused layout is not part of this change. Only document-text crops and manual image-text extraction consume structured translations. Table HTML and formula LaTeX use their existing dedicated tasks, without the document translation prompt.

A structured PDF response becomes one aligned visual group, or stable-ID groups for returned regions. Whole-document original and translated Markdown are rendered independently and are not forced to have matching AST shapes. Translation-only groups retain a source-image reference and page fragments without inventing source text. Visual groups stay separate during page merging; returned layout only refines the current crop. Traditional text translation keeps its protected-resource and placeholder checks.

Recognition-only does not call text translation. Fallback-service changes preserve model translations and cached recognition; languages, selected visual prompts and terminology invalidate affected visual results. Parse and fallback caches remain separate. New cache namespaces reject stale structured entries while retaining unrelated inference caches. No extension or website publishing is performed by development builds.

## Compatibility and release

Publish API 2 packages after a host supporting API 2 is available. API 2 covers the structured image parsing workflows and bounded Worker timers used by these packages. The host continues to support API 1 packages and existing service instances.

## Plugin Origin rules

Image parsing declarations are available in a tooltip on the visual-parsing capability label, both in package details and instance settings. True means supported by the adapter; false or omitted means support is not declared. Disabled tasks remain inspectable without being enabled. Package/instance upgrade previews show changes to both declarations.

An optional top-level boolean `isFree` in the plugin manifest declares whether its default service is free to use. Only explicit true displays a green Free badge. The official catalog carries the same metadata; false/omitted does not imply a paid service. This metadata grants no capabilities and does not alter settings or requests.

`permissions.originRewrite` declares fixed HTTP/HTTPS origins requiring a same-origin Origin header. Entries must also appear in `permissions.network`; paths, queries, credentials and wildcards are forbidden. This permission is preserved in package and instance snapshots and displayed during import and upgrade. Normal request network validation still applies.

The host collects declarations from enabled, compatible and configured external instances with at least one enabled capability, deduplicates origins, and merges them with saved user rules. User rules take precedence; stored `orilist` is unchanged. Multiple plugins/instances sharing an origin produce one rule, retained until the last contributor disappears. Installing a template alone activates nothing; custom endpoints are not automatically included.

Startup and configuration changes synchronize the latest rules serially; unchanged rules do not write DNR. Affected requests await synchronization, without installing/removing rules per request. Synchronization failures block dependent calls while ordinary plugins remain unaffected. Only this extension's Origin rules are updated; CSP and other rules remain intact. Index declares `https://index-translate.bilibili.com` by default, so no manual Origin setting is needed.
