# CEFR Original Word Annotation Design

## Context

Kiss Translator already supports whole-page bilingual translation by leaving the original text in place and inserting a translated wrapper after each translated node group. The repository also already contains a CEFR dictionary asset, a prototype CEFR settings page, and a draft post-processing hook that annotates translated English output. That prototype does not match the intended product behavior.

The desired feature is:

- ship a built-in common 30k-word CEFR dictionary
- after installation, guide the user to take an internal CEFR level assessment from A1 to C2
- during whole-page bilingual translation, when the original page text is English, show a Chinese gloss above words that are harder than the user's current level
- keep the existing bilingual translation behavior intact
- keep annotation rendering out of normal document flow so the original page layout is not stretched by the gloss labels

## Goals

- Preserve the existing whole-page bilingual translation pipeline and treat CEFR annotation as an enhancement layer rather than a dependency.
- Annotate only original English source text in the whole-page translation experience.
- Render gloss labels above difficult words using absolute positioning so the line box and surrounding document flow are not expanded.
- Prompt first-time users to take an internal CEFR assessment and keep a persistent entry point in both the popup and settings.
- Allow users to retake the assessment or manually override the detected CEFR level later.

## Non-Goals

- No support in this phase for selection translation, subtitle translation, input-box translation, or hover translation.
- No official CEFR certification claim; the assessment is an internal placement quiz for product behavior.
- No spaced repetition, vocabulary review workflow, or personal word-learning dashboard.
- No floating global overlay system for clipped labels caused by site-specific `overflow: hidden` containers.
- No context-sensitive multi-sense word disambiguation beyond the primary built-in Chinese gloss.

## Product Decisions

### Onboarding and entry points

- On browser install, only the `install` reason triggers CEFR onboarding. Extension updates do not auto-open the CEFR page.
- The extension opens the options page directly to `options.html#/cefr`.
- The CEFR settings page shows a dedicated onboarding card when the user has not completed assessment yet. The card explains the built-in dictionary, the purpose of the quiz, and the post-translation word gloss behavior.
- Popup and settings retain long-term CEFR entry points:
  - when assessment is incomplete, show a prominent "Take CEFR test" entry
  - when assessment is complete, show the current level plus actions to retake or adjust manually

### CEFR setting model

The existing CEFR setting shape should be expanded from a minimal `{ enabled, level }` object into a state model that can distinguish between feature enablement, completion status, and the source of the current level:

```js
{
  enabled: false,
  level: 0,
  assessmentCompleted: false,
  levelSource: "unset", // "unset" | "quiz" | "manual"
  lastPromptFrom: "" // "", "install", "popup", "settings"
}
```

This state remains stored in the existing settings storage so sync behavior stays aligned with the rest of extension settings.

### Annotation scope

- Annotation runs only for whole-page translation.
- Annotation runs only when the detected source language for the translated node group is English.
- Annotation never modifies the translated wrapper DOM.
- Annotation only decorates original source text nodes that remain visible in bilingual mode.
- Difficulty comparison uses `wordLevelScore > userLevelScore`, not `>=`, because the feature should show words harder than the user's current level.

## Technical Design

### High-level architecture

The current whole-page translator flow in `src/libs/translator.js` should remain responsible for:

1. collecting text nodes into a translatable node group
2. serializing and sending text to the translation service
3. inserting the translated wrapper next to the original content

CEFR annotation is added as a post-translation enhancement step that runs only after the translated wrapper has been created successfully. This keeps translation correctness and CEFR rendering decoupled. If CEFR fails, the user still gets the same bilingual translation result they get today.

### Annotation pipeline

For each successfully translated node group:

1. Reuse the detected source language for that group.
2. Exit immediately unless:
   - CEFR is enabled
   - assessment is complete
   - the source language is English
   - original content is still present in the DOM
3. Walk the original text nodes in the translated group.
4. Tokenize simple English words using the existing low-risk pattern for first release: `/\\b[a-zA-Z]+\\b/g`
5. Lookup each normalized token in the CEFR dictionary.
6. Annotate only words whose CEFR score is strictly greater than the user's level.
7. Replace the matched text segment with wrapped DOM that keeps the visible English word unchanged and injects a separate gloss label span positioned above it.

### Annotation DOM shape

Each annotated word should render as:

```html
<span class="kiss-cefr-word" data-kiss-cefr="1" data-word="ubiquitous">
  ubiquitous
  <span class="kiss-cefr-gloss" aria-hidden="true">普遍的</span>
</span>
```

Key rendering requirements:

- `kiss-cefr-word` uses `position: relative` and `display: inline-block`
- `kiss-cefr-gloss` uses `position: absolute`, anchored above the word
- gloss labels use `pointer-events: none`
- gloss labels use `white-space: nowrap`
- gloss labels have a small offset and modest z-index so they read clearly without aggressively covering surrounding content
- English text itself remains selectable and visually unchanged in the first release

The implementation must not use `<ruby>` and `<rt>` because those elements participate in layout and can stretch line height, which directly violates the requirement to avoid impacting document flow.

### Translator integration

The existing `maybeAnnotateTranslatedText(...)` hook in `src/libs/cefr.js` is aimed at translated English output and should no longer be the primary behavior for this feature. The CEFR module should instead expose helpers oriented around original DOM annotation, such as:

- loading and caching the CEFR dictionary
- mapping CEFR levels to numeric scores
- deciding whether a token is harder than the user level
- annotating a text node or fragment into DOM wrappers
- removing or restoring CEFR wrappers cleanly

`src/libs/translator.js` should call a new DOM-oriented CEFR helper after translation success and should register enough bookkeeping to clean those wrappers whenever translated content is removed or rebuilt.

### Cleanup and lifecycle

CEFR annotation must behave like a first-class part of the translation lifecycle:

- When translation is disabled, CEFR wrappers must be removed together with translated wrappers.
- When a translated node group is refreshed or retranslated, existing CEFR wrappers for that group must be unwrapped before reapplying annotation.
- Cleanup should restore plain text nodes and normalize the parent container so the DOM does not accumulate fragmented text nodes.
- Annotation must be idempotent; rerunning on an already annotated group must not double-wrap the same word.

The safest implementation is to store CEFR wrapper bookkeeping alongside translator bookkeeping so removal happens from the same cleanup paths already used by whole-page translation.

## UI Design

### Options page

`src/views/Options/CEFRSetting.js` should be evolved from the current prototype into a complete CEFR workflow page with three states:

1. onboarding state
   - shown after install or whenever assessment has never been completed
   - explains the feature and presents a primary action to start the quiz
2. configured state
   - shows the current CEFR level
   - lets the user retake the quiz
   - lets the user manually override the level
   - lets the user enable or disable original-word annotation
3. skipped-but-unset state
   - shown if the user dismissed onboarding without finishing
   - keeps a strong reminder card and start action visible

### Popup

`src/views/Popup/PopupCont.js` should include a compact CEFR card near the top of the popup:

- if no assessment is completed, show a CTA that opens the CEFR settings page
- if assessment exists, show the current level and quick access to retake or adjust in settings

This preserves discoverability after the one-time install prompt has been dismissed.

## Error Handling and Fallbacks

- If the CEFR dictionary asset fails to load, annotation is skipped silently and translation continues normally.
- If the user's CEFR level is unset or invalid, annotation is skipped.
- If source language detection is not English, annotation is skipped.
- If a node cannot be safely tokenized or rewritten, annotation is skipped for that node only.
- If onboarding auto-open fails on install, the extension still installs normally and the popup/settings entry points remain available.

The rule is simple: CEFR failure must never block, alter, or regress the existing translation result.

## Performance Considerations

- Reuse the existing per-node-group translation flow instead of scanning the entire page independently.
- Reuse the current lazy-loaded dictionary cache from the CEFR module.
- Restrict first-release tokenization to simple ASCII English words to reduce parsing complexity and DOM churn.
- Skip annotation entirely for node groups that are too short, non-English, or otherwise filtered out by the existing translator safeguards.

This keeps CEFR work proportional to already translated content and avoids adding a second page-wide observer or scanning pass.

## Testing Strategy

### Unit tests

Add or revise tests in `src/libs/cefr.test.js` to cover:

- non-English source language skips annotation
- words at or below the user level are not annotated
- words above the user level are annotated
- generated DOM uses absolute-position gloss wrappers instead of ruby tags
- cleanup restores original text correctly

### Translator integration tests

Add integration-focused coverage for `src/libs/translator.js` to verify:

- translated wrappers still render normally
- original English words receive CEFR gloss wrappers when eligible
- disabling translation removes both translated wrappers and CEFR annotations
- rerunning translation does not double-wrap words

### UI tests

Add coverage for:

- install-time onboarding flag behavior
- CEFR options page onboarding and configured states
- popup reminder card visibility for unset vs configured users
- retake and manual override flows storing the expected CEFR setting values

## Risks and Accepted Trade-offs

- Some sites may clip gloss labels because of ancestor `overflow: hidden`. This is accepted for the first release to keep the implementation simple and low-risk.
- Single-word Chinese glosses will sometimes be semantically imperfect because they are dictionary hints, not contextual translations.
- Restricting first release tokenization to simple English words means contractions, hyphenated words, and named entities may be skipped. This is acceptable for an initial rollout focused on stability.

## Implementation Impact

The expected main touch points are:

- `src/background.js` for install-time onboarding
- `src/config/setting.js` for CEFR state expansion
- `src/views/Options/CEFRSetting.js` for onboarding, retake, and manual override UI
- `src/views/Popup/PopupCont.js` for the persistent reminder card
- `src/libs/cefr.js` for DOM-oriented annotation helpers and cleanup helpers
- `src/libs/translator.js` for post-translation annotation and lifecycle cleanup integration

This design deliberately builds on the existing partial CEFR prototype in the repository while redirecting it from translated-output annotation to original-English DOM enhancement.
