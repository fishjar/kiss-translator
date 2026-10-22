import fs from "fs";
import path from "path";
import vm from "vm";
import { MSG_IMAGE_TRANSLATE_PROGRESS } from "./config/msg";

const background = fs.readFileSync(
  path.join(__dirname, "background.js"),
  "utf8"
);
const handlerSource = background.slice(
  background.indexOf("[MSG_IMAGE_TRANSLATE_EXECUTE]:"),
  background.indexOf("[MSG_IMAGE_TRANSLATE_CANCEL]:")
);

test("image progress has increasing sequence numbers and stops after cancellation or completion", async () => {
  const activeImageTasks = new Map();
  const sendTabMsg = jest.fn();
  let report;
  let complete;
  const executeImagePipeline = jest.fn(({ onProgress }) => {
    report = onProgress;
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  const context = vm.createContext({
    MSG_IMAGE_TRANSLATE_EXECUTE: "execute",
    MSG_IMAGE_TRANSLATE_PROGRESS,
    activeImageTasks,
    sendTabMsg,
    executeImagePipeline,
    AbortController,
    Blob,
  });
  const execute = vm.runInContext(`({${handlerSource}}).execute`, context);
  const running = execute(
    { taskId: "first", imageBlob: new Blob(["image"]) },
    { tab: { id: 7 } }
  );
  report({ stage: "recognize", current: 0 });
  report({ stage: "recognize", current: 1 });
  expect(sendTabMsg).toHaveBeenCalledWith(
    "image_translate_progress",
    expect.objectContaining({ taskId: "first", sequence: 1 }),
    undefined,
    7
  );
  expect(sendTabMsg.mock.calls.map((call) => call[1].sequence)).toEqual([1, 2]);
  activeImageTasks.get("7:first").abort();
  report({ stage: "recognize", current: 2 });
  expect(sendTabMsg).toHaveBeenCalledTimes(2);
  complete({ items: [] });
  await running;
  const next = execute(
    { taskId: "second", imageBlob: new Blob(["image"]) },
    { tab: { id: 7 } }
  );
  report({ stage: "recognize", current: 0 });
  expect(sendTabMsg.mock.calls.at(-1)[1].sequence).toBe(1);
  complete({ items: [] });
  await next;
  report({ stage: "recognize", current: 1 });
  expect(sendTabMsg).toHaveBeenCalledTimes(3);
});
