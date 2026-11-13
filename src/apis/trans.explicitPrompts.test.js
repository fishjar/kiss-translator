jest.mock("../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({ title: "", description: "", summary: "" }),
}));

jest.mock("../libs/stream", () => ({
  parseStreamingSegments: jest.fn(),
  createStreamingJsonParser: jest.fn(),
  createStreamingSubtitleParser: jest.fn(),
  createRealtimeStreamParser: jest.fn(),
  detectStreamFormat: jest.fn(),
}));

import { fetchData } from "../libs/fetch";
import { genTransReq, handleNativeSummarize, handleNativeDict } from "./trans";
import { sendBgMsg } from "../libs/msg";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_OPENAI,
  OPT_TRANS_LOCALAI,
} from "../config";
import { buildMessages } from "../providers/sdk/translation";
import { buildTextTaskMessages } from "../providers/sdk/textTasks";
import { withDefaultPromptInput } from "../providers/defaultPrompts";
const api = {
  ...DEFAULT_API_LIST.find((a) => a.apiType === OPT_TRANS_OPENAI),
  url: "https://example.com/chat/completions",
  key: "test",
  tone: "formal",
  aiTerms: "bank,shore",
  useStream: false,
};
const request = async (extra) => {
  const [, init] = await genTransReq({
    ...api,
    useBatchFetch: false,
    texts: ["INPUT"],
    from: "English",
    to: "Chinese",
    nobatchPrompt: "Rules",
    nobatchUserPrompt: "{{title}}",
    ...extra,
  });
  return JSON.parse(init.body).messages;
};
beforeEach(() => fetchData.mockReset());
test("inserted fields are never scanned again and dollars are literal", async () => {
  const title = "literal {{tone}} {{to}} {{text}} $$ $& $` $'";
  const messages = await request({
    nobatchPrompt: "{{title}}",
    docInfo: { title },
  });
  expect(messages[0].content).toBe(title);
  expect(messages[1].content).toBe(`Title: ${title}`);
});
test.each(["line", "xml", "json"])(
  "%s system-only segments do not duplicate into user",
  async (batchProtocol) => {
    const messages = await request({
      useBatchFetch: true,
      batchProtocol,
      systemPrompt: "{{segments}}",
      batchUserPrompt: "",
    });
    expect(messages[0].content).toContain("INPUT");
    expect(messages.some((m) => m.role === "user")).toBe(false);
    const fixed = await request({
      useBatchFetch: true,
      batchProtocol,
      systemPrompt: "Fixed",
      batchUserPrompt: "No input",
    });
    expect(fixed.map((m) => m.content)).toEqual(["Fixed", "No input"]);
  }
);
test("native empty templates use a complete default pair", async () => {
  const messages = await request({
    nobatchPrompt: null,
    nobatchUserPrompt: null,
  });
  expect(messages.find((m) => m.role === "user").content).toContain("INPUT");
  expect(messages).toEqual(
    await request({ nobatchPrompt: "", nobatchUserPrompt: "" })
  );
});
test.each([undefined, null, {}, { systemPrompt: "", userPrompt: "" }])(
  "empty summary uses the video summary default (%#)",
  async (prompt) => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "Summary" } }],
    });
    await handleNativeSummarize({
      title: "Video",
      transcript: "Transcript",
      apiSetting: api,
      prompt,
    });
    const messages = JSON.parse(fetchData.mock.calls[0][1].body).messages;
    expect(messages[0].content).toContain("Output Markdown with two sections");
    expect(messages[1].content).toContain("Transcript");
  }
);
test("network summary preserves literal template tokens in transcript", async () => {
  fetchData.mockResolvedValueOnce({
    choices: [{ message: { content: "Summary" } }],
  });
  const transcript =
    "literal {{tone}} {{glossary}} {{title}} {{to}} {{text}} $$ $&";
  await handleNativeSummarize({
    title: "Video",
    transcript,
    apiSetting: api,
    prompt: { userPrompt: "{{transcript}}" },
  });
  const messages = JSON.parse(fetchData.mock.calls[0][1].body).messages;
  expect(messages.find((m) => m.role === "user").content).toBe(transcript);
  expect(messages.some((m) => m.role === "system" && m.content.trim())).toBe(
    false
  );
});
test("dictionary accepts a user-only template", async () => {
  fetchData.mockResolvedValueOnce({
    choices: [{ message: { content: "Definition" } }],
  });
  await expect(
    handleNativeDict({
      text: "bank",
      fromLang: "en",
      toLang: "zh",
      apiSetting: { ...api, dictPrompt: "", dictUserPrompt: "{{text}}" },
    })
  ).resolves.toBe("Definition");
});
test("SDK message builders choose defaults only for empty pairs", () => {
  const input = {
    items: [{ id: "a", text: "bank" }],
    targetLanguage: "zh",
    outputProtocol: "text",
  };
  expect(buildMessages(input).find((m) => m.role === "user").content).toContain(
    "bank"
  );
  expect(buildMessages({ ...input, systemPrompt: "{{text}}" })).toEqual([
    { role: "system", content: "bank" },
  ]);
  expect(
    buildTextTaskMessages("dictionary", { text: "bank" })[1].content
  ).toContain("bank");
  expect(
    buildTextTaskMessages("summarize", { text: "bank", instructions: "Fixed" })
  ).toEqual([{ role: "system", content: "Fixed" }]);
});
test.each([null, ""])(
  "plugin custom half never inherits preset (%#)",
  (systemPrompt) => {
    const instance = {
      provider: {
        defaultPrompts: {
          nobatch: [
            {
              id: "default",
              systemPrompt: "Default",
              userPrompt: "{{text}}",
              protocol: "text",
            },
          ],
        },
      },
    };
    const output = withDefaultPromptInput(instance, "translate", {
      translationMode: "single",
      systemPrompt,
    });
    expect(output.userPrompt).toBe("{{text}}");
  }
);

test.each(["{{title}}", "{{context}}"])(
  "blank rendered messages reject (%#)",
  async (template) => {
    await expect(
      request({
        nobatchPrompt: template,
        nobatchUserPrompt: template,
        docInfo: {},
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
);
test.each(["line", "xml", "json"])(
  "%s tokens embedded in metadata remain literal",
  async (batchProtocol) => {
    const messages = await request({
      useBatchFetch: true,
      batchProtocol,
      systemPrompt: "{{title}}",
      batchUserPrompt: "Fixed",
      docInfo: { title: "literal {{segments}} {{glossary}} $$ $&" },
    });
    expect(messages[0].content).toBe("literal {{segments}} {{glossary}} $$ $&");
    expect(messages[1].content).toBe("Fixed");
  }
);
test("native systems and users each expand explicit segments exactly once", async () => {
  const messages = await request({
    useBatchFetch: true,
    batchProtocol: "line",
    texts: ["literal {{segments}}"],
    systemPrompt: "{{segments}}",
    batchUserPrompt: "{{segments}}",
  });
  expect(messages.map((m) => m.content)).toEqual([
    "0 | literal {{segments}}",
    "0 | literal {{segments}}",
  ]);
});

test.each([OPT_TRANS_LOCALAI, OPT_TRANS_OPENAI])(
  "%s summary messages preserve the same literal transcript",
  async (apiType) => {
    const transcript =
      "literal {{tone}} {{glossary}} {{title}} {{to}} {{text}} $$ $&";
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "Summary" } }],
    });
    sendBgMsg.mockResolvedValueOnce({ text: "Summary" });
    await handleNativeSummarize({
      title: "Video",
      transcript,
      apiSetting: { ...api, apiType },
      prompt: { systemPrompt: "Summarize", userPrompt: "{{transcript}}" },
    });
    const messages =
      apiType === OPT_TRANS_LOCALAI
        ? sendBgMsg.mock.calls.at(-1)[1].payload.messages
        : JSON.parse(fetchData.mock.calls[0][1].body).messages;
    expect(messages.map((m) => m.content)).toEqual(["Summarize", transcript]);
  }
);

test("OpenAI system-only templates omit empty user messages", async () => {
  expect(
    await request({ nobatchPrompt: "System only", nobatchUserPrompt: "" })
  ).toEqual([{ role: "system", content: "System only" }]);
});
test.each(["Claude", "Gemini"])(
  "%s rejects system-only configuration before sending",
  async (apiType) => {
    await expect(
      genTransReq({
        ...api,
        apiType,
        url: "https://example.com/generateContent",
        texts: ["Source"],
        nobatchPrompt: "System only",
        nobatchUserPrompt: "",
        useBatchFetch: false,
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetchData).not.toHaveBeenCalled();
  }
);

test.each([OPT_TRANS_OPENAI, OPT_TRANS_LOCALAI])(
  "%s summary capability preparation reaches the native request",
  async (apiType) => {
    const { resolveApiPromptSettings } = require("../config/prompt");
    const {
      applyTestPrompt,
      createTestInput,
    } = require("../providers/testInput");
    const { createNativeRegistry } = require("../builtin-plugins/runtime");
    const resolved = resolveApiPromptSettings({
      ...api,
      apiSlug: "summary-test",
      apiType,
      modelRef: "qwen2.5-0.5b",
      isDisabled: false,
    });
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "Summary" } }],
    });
    sendBgMsg.mockResolvedValueOnce({ text: "Summary" });
    const input = applyTestPrompt(
      "summarize",
      createTestInput("summarize", "Transcript"),
      resolved
    );
    await expect(
      createNativeRegistry(() => resolved).invoke(
        resolved.apiSlug,
        "summarize",
        input,
        { streaming: "disabled" }
      ).result
    ).resolves.toMatchObject({ text: "Summary" });
    const messages =
      apiType === OPT_TRANS_LOCALAI
        ? sendBgMsg.mock.calls.at(-1)[1].payload.messages
        : JSON.parse(fetchData.mock.calls[0][1].body).messages;
    expect(messages.find((m) => m.role === "user").content).toContain(
      "Transcript"
    );
  }
);

test("explicit advanced request bodies are validated after their messages are applied", async () => {
  const [, init] = await genTransReq({
    ...api,
    apiType: "Claude",
    texts: ["Source"],
    nobatchPrompt: "System only",
    nobatchUserPrompt: "",
    useBatchFetch: false,
    customBody: JSON.stringify({
      messages: [{ role: "user", content: "Explicit body input" }],
    }),
  });
  expect(JSON.parse(init.body).messages).toEqual([
    { role: "user", content: "Explicit body input" },
  ]);
});

describe.each([
  [
    "Claude",
    "https://api.anthropic.com/v1/messages",
    "messages",
    { role: "user", content: "Previous" },
    { role: "assistant", content: "Reply" },
  ],
  [
    "Gemini",
    "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    "contents",
    { role: "user", parts: [{ text: "Previous" }] },
    { role: "model", parts: [{ text: "Reply" }] },
  ],
  [
    "Gemini",
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    "input",
    { type: "user_input", content: [{ type: "text", text: "Previous" }] },
    { type: "model_output", content: [{ type: "text", text: "Reply" }] },
  ],
])("%s template conversation at %s", (apiType, url, field, previous, reply) => {
  const options = {
    ...api,
    apiType,
    url,
    texts: ["Source"],
    nobatchPrompt: "Rules",
    nobatchUserPrompt: "",
    useBatchFetch: false,
    hisMsgs: [previous, reply],
  };

  test.each(["", " \n\t"])(
    "history cannot replace a blank current input %p",
    async (nobatchUserPrompt) => {
      await expect(
        genTransReq({ ...options, nobatchUserPrompt })
      ).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(fetchData).not.toHaveBeenCalled();
    }
  );

  test("a valid current input retains history", async () => {
    const [, init] = await genTransReq({
      ...options,
      nobatchUserPrompt: "{{text}}",
    });
    const messages = JSON.parse(init.body)[field];
    expect(messages.slice(0, 2)).toEqual([previous, reply]);
    expect(JSON.stringify(messages.at(-1))).toContain("Source");
  });

  test("hook-returned empty conversation preserves INVALID_INPUT", async () => {
    await expect(
      genTransReq({
        ...options,
        nobatchUserPrompt: "{{text}}",
        reqHook: `(args, req) => ({ ...req, body: { ...req.body, ${field}: [] } })`,
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  test("hook exceptions retain their wrapper", async () => {
    await expect(
      genTransReq({
        ...options,
        nobatchUserPrompt: "{{text}}",
        reqHook: '() => { throw new Error("hook failed"); }',
      })
    ).rejects.toThrow("Request hook error: hook failed");
  });

  test.each(["customBody", "reqHook"])(
    "explicit %s input is validated after history is excluded",
    async (override) => {
      const body = { [field]: [previous] };
      const [, init] = await genTransReq({
        ...options,
        ...(override === "customBody"
          ? { customBody: JSON.stringify(body) }
          : {
              reqHook: `(args, req) => ({ ...req, body: { ...req.body, ...${JSON.stringify(body)} } })`,
            }),
      });
      expect(JSON.parse(init.body)[field]).toEqual([previous]);
    }
  );
});

test.each([
  ["", "React"],
  ["  \t", "React"],
  ["前端库", "前端库"],
  ["literal {{text}} $$ $& $'", "literal {{text}} $$ $& $'"],
])(
  "dictionary renderers agree on glossary value %p",
  async (value, expected) => {
    const glossary = { React: value };
    const sdk = buildTextTaskMessages("dictionary", {
      instructions: "{{glossary}}",
      glossary,
    });
    expect(sdk[0].content).toBe(`- React: ${expected}`);
    expect(
      (
        await request({
          nobatchPrompt: "{{glossary}}",
          nobatchUserPrompt: "",
          aiTerms: "",
          glossary,
        })
      )[0].content
    ).toBe(sdk[0].content);
  }
);

test("dictionary renderers keep an absent glossary empty", async () => {
  const sdk = buildTextTaskMessages("dictionary", {
    instructions: "{{glossary}}",
    userPrompt: "Fixed",
    glossary: {},
  });
  expect(sdk).toEqual([{ role: "user", content: "Fixed" }]);
  expect(
    await request({
      nobatchPrompt: "{{glossary}}",
      nobatchUserPrompt: "Fixed",
      aiTerms: "",
      glossary: {},
    })
  ).toEqual(sdk);
});

test("native and SDK summaries remove empty placeholder lines without rescanning input", async () => {
  const transcript = "literal {{title}} $$ $&";
  const prompt = {
    systemPrompt: "Summary",
    userPrompt: "{{title}}\n{{description}}\n{{transcript}}",
  };
  fetchData.mockResolvedValueOnce({
    choices: [{ message: { content: "Summary" } }],
  });
  await handleNativeSummarize({
    title: "",
    description: "",
    transcript,
    apiSetting: api,
    prompt,
  });
  const messages = JSON.parse(fetchData.mock.calls[0][1].body).messages;
  expect(messages).toEqual(
    buildTextTaskMessages("summarize", {
      text: transcript,
      instructions: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
    })
  );
  expect(messages[1].content).toBe(transcript);
});
