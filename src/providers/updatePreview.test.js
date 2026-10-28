import {
  previewPackageUpdate,
  previewServiceUpdate,
  packageSourceLabel,
} from "./updatePreview";

test.each([
  undefined,
  { id: "test", source: { kind: "file" } },
  { manifest: null },
  { manifest: { id: "test", version: "1.0.0" } },
])(
  "missing previous manifest data produces an incomplete preview: %j",
  (previous) => {
    expect(
      previewPackageUpdate(previous, { source: { kind: "zip" } })
    ).toMatchObject({ incomplete: true, source: expect.any(Array) });
  }
);

test.each([undefined, []])(
  "new shared and service fields can be previewed without old settings: %j",
  (settings) => {
    const api = {
      provider: settings ? { settings } : {},
      pluginConfig: { added: "unmatched" },
    };
    const original = JSON.stringify(api);
    const preview = previewServiceUpdate(
      api,
      { sharedSettings: [{ key: "shared", type: "text" }] },
      { settings: [{ key: "added", type: "number" }] }
    );
    expect(preview.fields).toEqual({
      added: ["shared", "added"],
      removed: [],
      changed: [],
    });
    expect(preview.fieldDetails).toEqual([
      {
        key: "shared",
        before: null,
        after: expect.objectContaining({ type: "text" }),
      },
      {
        key: "added",
        before: null,
        after: expect.objectContaining({ type: "number" }),
      },
    ]);
    expect(preview.skipped).toEqual([]);
    expect(JSON.stringify(api)).toBe(original);
  }
);

test("template preview identifies added/removed origins, endpoints, services and per-service capabilities", () => {
  const previous = {
    source: { kind: "github", repoUrl: "https://github.com/old/plugin" },
    manifest: {
      permissions: {
        network: ["https://old.invalid"],
        endpointFields: ["url"],
      },
      services: [
        { id: "chat", capabilities: { chat: {} } },
        { id: "removed", capabilities: {} },
      ],
    },
  };
  const incoming = {
    source: {
      kind: "zip",
      url: "https://user:password@example.invalid/plugin.zip?key=SECRET#SECRET",
    },
    manifest: {
      permissions: {
        network: ["https://new.invalid"],
        endpointFields: ["baseUrl"],
      },
      services: [
        { id: "chat", capabilities: { translate: {} } },
        { id: "added", capabilities: {} },
      ],
    },
  };
  const preview = previewPackageUpdate(previous, incoming);
  expect(preview.network).toEqual({
    added: ["https://new.invalid"],
    removed: ["https://old.invalid"],
  });
  expect(preview.endpoints).toEqual({ added: ["baseUrl"], removed: ["url"] });
  expect(preview.services).toEqual({ added: ["added"], removed: ["removed"] });
  expect(preview.capabilities).toEqual({
    added: ["chat/translate"],
    removed: ["chat/chat"],
  });
  expect(JSON.stringify(preview)).not.toMatch(/password|SECRET/);
  expect(previewPackageUpdate(undefined, incoming)).toMatchObject({
    incomplete: true,
  });
  expect(packageSourceLabel({ kind: "file" })).toBe("file");
});

test("instance preview reports changed constraints, removed settings, model changes and redacts prompt credentials", () => {
  const api = {
    provider: {
      settings: [
        { key: "key", type: "password" },
        { key: "count", type: "number" },
        { key: "removed", type: "text" },
      ],
      models: [{ id: "old" }, { id: "same", name: "before" }],
      defaultPrompts: {
        batch: [{ id: "default", name: "Default", systemPrompt: "OLD_SECRET" }],
        nobatch: [{ id: "default", name: "Default", userPrompt: "keep" }],
      },
    },
    pluginConfig: { key: "OLD_SECRET", count: 5, removed: "PRIVATE_CONFIG" },
  };
  const manifest = { sharedSettings: [] };
  const service = {
    settings: [
      { key: "key", type: "text" },
      { key: "count", type: "number", required: true, max: 2 },
    ],
    models: [{ id: "new" }, { id: "same", name: "after" }],
    defaultPrompts: {
      batch: [
        { id: "default", name: "Default", systemPrompt: "new OLD_SECRET" },
      ],
      nobatch: [{ id: "default", name: "Default", userPrompt: "keep" }],
    },
  };
  const original = JSON.stringify(api);
  const preview = previewServiceUpdate(api, manifest, service);
  expect(preview.fields.changed).toEqual(["key", "count"]);
  expect(preview.fields.removed).toEqual(["removed"]);
  expect(preview.fieldDetails[1].after).toMatchObject({
    required: true,
    max: 2,
  });
  expect(preview.models).toEqual({
    added: ["new"],
    removed: ["old"],
    changed: ["same"],
  });
  expect(preview.skipped).toEqual(["key", "count", "removed"]);
  expect(preview.prompts.map((item) => item.slot)).toEqual(["batch"]);
  expect(JSON.stringify(preview)).not.toMatch(/OLD_SECRET|PRIVATE_CONFIG/);
  expect(JSON.stringify(preview)).toContain("[REDACTED]");
  expect(JSON.stringify(api)).toBe(original);
});

test("prompt redaction happens before JSON escaping of credentials", () => {
  const secret = 'key"with\\slashes';
  const api = {
    provider: {
      settings: [{ key: "key", type: "password" }],
      defaultPrompts: {},
    },
    pluginConfig: { key: secret },
  };
  const preview = previewServiceUpdate(
    api,
    {},
    {
      settings: [],
      defaultPrompts: {
        batch: [
          {
            id: "default",
            name: "Default",
            systemPrompt: `prefix ${secret} suffix`,
          },
        ],
      },
    }
  );
  expect(JSON.parse(preview.prompts[0].after)[0].systemPrompt).toBe(
    "prefix [REDACTED] suffix"
  );
});
