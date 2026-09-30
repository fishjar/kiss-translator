import { describe, expect, it } from "vitest";
import { TASK_PRIORITY, TaskScheduler } from "../../runtime/taskScheduler";
import { RuntimePool } from "../../runtime/runtimePool";
import { RuntimeManager } from "../../runtime/runtimeManager";
import {
  ChromiumOffscreenHost,
  InPageRuntimeHost,
} from "../../runtime/runtimeHostAdapter";
import { LlmClient } from "../llmClient";
import { AsrClient } from "../asrClient";
import { JevClient } from "../jevClient";
import { OcrClient } from "../ocrClient";
import { RemoteModelManager } from "../modelManager";
import type { RpcChannelEnvelope } from "../../runtime/rpc";

/** 构造可控的内存级 Mock Worker */
function createMockWorker(
  handler: (
    msg: any,
    postToHost: (data: any) => void,
    isTerminated: () => boolean
  ) => void,
  onTerminate?: () => void
): Worker {
  let terminated = false;
  const workerObj: any = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
    postMessage(msg: any) {
      if (terminated) return;
      handler(
        msg,
        (data) => {
          if (terminated) return;
          workerObj.onmessage?.({ data } as MessageEvent);
        },
        () => terminated
      );
    },
    terminate() {
      if (!terminated) {
        terminated = true;
        onTerminate?.();
      }
    },
  };
  return workerObj as Worker;
}

describe("1. 模型状态失真与会话版本控制 (Model State & Session Version)", () => {
  it("LLM 页与 OCR(VLM) 页共用 LLM 服务：两页分别加载模型后，从第一页发起对话明确报『模型已切换』且不交给当前 Worker", async () => {
    let workerChatCount = 0;
    let activeModelDir = "";

    const mgr = new RuntimeManager({
      workerFactories: {
        createLlmWorker: () =>
          createMockWorker((msg, reply) => {
            if (msg.type === "load") {
              activeModelDir = msg.dir;
              setTimeout(() => reply({ type: "ready", backend: "webgpu" }), 5);
            } else if (msg.type === "chat") {
              workerChatCount++;
              setTimeout(
                () =>
                  reply({
                    type: "done",
                    text: `来自 ${activeModelDir} 的回复`,
                    elapsedMs: 10,
                  }),
                5
              );
            }
          }),
      },
    });

    const host = new InPageRuntimeHost({ manager: mgr });
    const llmPageClient = new LlmClient(host);
    const ocrVlmClient = new LlmClient(host);

    const stateEvents: Array<{ ready: boolean; reason?: string }> = [];
    llmPageClient.onStateChange = (ready, reason) => {
      stateEvents.push({ ready, reason });
    };

    // 1. 第一页（LLM 页）加载 qwen2.5-0.5b
    await llmPageClient.load({
      runtime: "wllama",
      dir: "llm/qwen2.5-0.5b",
      file: "qwen.gguf",
      device: "webgpu",
      nCtx: 2048,
    });
    expect(llmPageClient.loaded).toBe(true);
    expect(llmPageClient.sessionVersion).toBe(1);

    // 2. 第二页（OCR 页 VLM）加载 unlimited-ocr-iq2m
    await ocrVlmClient.load({
      runtime: "wllama",
      dir: "ocr/unlimited-ocr-iq2m",
      file: "vlm.gguf",
      device: "webgpu",
      nCtx: 8192,
    });
    expect(ocrVlmClient.loaded).toBe(true);
    expect(ocrVlmClient.sessionVersion).toBe(2);

    // 第一页客户端收到 service-state 广播，就绪状态已自动失效
    expect(llmPageClient.loaded).toBe(false);
    expect(stateEvents.some((e) => !e.ready && e.reason?.includes("模型已切换"))).toBe(
      true
    );

    // 3. 若从第一页带着旧版本发起对话，宿主直接拒绝并报 MODEL_SWITCHED，绝不交给当前 Worker
    await expect(
      llmPageClient.chat(
        [{ role: "user", content: "你好" }],
        64,
        () => undefined
      )
    ).rejects.toThrow(/MODEL_SWITCHED: 模型已切换/);
    expect(workerChatCount).toBe(0);

    // 4. 第二页（当前版本持有者）发起推理正常执行
    const vlmRes = await ocrVlmClient.chat(
      [{ role: "user", content: "解析文档" }],
      64,
      () => undefined
    );
    expect(vlmRes.text).toBe("来自 ocr/unlimited-ocr-iq2m 的回复");
    expect(workerChatCount).toBe(1);
  });

  it("模型被 RuntimePool 淘汰时，对应客户端就绪状态立即失效且旧版本请求被拒绝", async () => {
    const mgr = new RuntimeManager({
      maxResidentModels: 1,
      workerFactories: {
        createLlmWorker: () =>
          createMockWorker((msg, reply) => {
            if (msg.type === "load") reply({ type: "ready", backend: "webgpu" });
          }),
        createAsrWorker: () =>
          createMockWorker((msg, reply) => {
            if (msg.type === "load") reply({ type: "ready" });
          }),
      },
    });

    const host = new InPageRuntimeHost({ manager: mgr });
    const llmClient = new LlmClient(host);
    const asrClient = new AsrClient(host);

    await llmClient.load({
      runtime: "wllama",
      dir: "llm/qwen2.5-0.5b",
      file: "qwen.gguf",
      device: "webgpu",
      nCtx: 2048,
    });
    expect(llmClient.loaded).toBe(true);

    // 加载 ASR 模型，由于 maxResidentModels = 1，RuntimePool 自动淘汰空闲的 LLM
    await asrClient.load({
      source: "onnx-community/whisper-base",
      dir: "asr/whisper-base",
      device: "webgpu",
      dtype: "int8",
      multilingual: true,
      wordTimestamps: false,
    });

    // LLM 客户端就绪状态已因淘汰广播而自动失效
    expect(llmClient.loaded).toBe(false);

    // 尝试在已淘汰的客户端上发起对话，明确报 MODEL_UNLOADED
    await expect(
      llmClient.chat([{ role: "user", content: "测试" }], 32, () => undefined)
    ).rejects.toThrow(/MODEL_UNLOADED/);
  });
});

describe("2. 活跃任务取消、超时与 GPU 互斥保证 (Execution Cancellation & GPU Exclusivity)", () => {
  it("不可中断的活跃任务被取消或超时后：立即终止底层 Worker，绝不在旧任务结束前抢跑下一项，随后 P0 任务正常继续执行", async () => {
    const timeline: string[] = [];
    let asrWorkerTerminated = false;
    let gpuOccupiedByAsr = false;
    let overlapDetected = false;

    const mgr = new RuntimeManager({
      workerFactories: {
        createAsrWorker: () =>
          createMockWorker(
            (msg, reply) => {
              if (msg.type === "load") {
                reply({ type: "ready" });
              } else if (msg.type === "transcribe") {
                gpuOccupiedByAsr = true;
                timeline.push("asr-gpu-start");
                // 模拟卡死/长耗时的不可中断推理，不主动返回
              }
            },
            () => {
              asrWorkerTerminated = true;
              gpuOccupiedByAsr = false;
              timeline.push("asr-worker-terminated");
            }
          ),
        createJevWorker: () =>
          createMockWorker((msg, reply) => {
            if (msg.type === "load") {
              reply({ type: "ready", backend: "webgpu" });
            } else if (msg.type === "predict") {
              if (gpuOccupiedByAsr) {
                overlapDetected = true;
              }
              timeline.push("jev-p0-gpu-start");
              setTimeout(() => {
                timeline.push("jev-p0-gpu-end");
                reply({
                  type: "result",
                  id: msg.id,
                  result: {
                    model: "laya-rl-agent",
                    answers: {},
                    usage: { input_tokens: 10, output_tokens: 0 },
                  },
                });
              }, 10);
            }
          }),
      },
    });

    const host = new InPageRuntimeHost({ manager: mgr });
    const asrClient = new AsrClient(host);
    const jevClient = new JevClient(host);

    await asrClient.load({
      source: "onnx-community/whisper-base",
      dir: "asr/whisper-base",
      device: "webgpu",
      dtype: "int8",
      multilingual: true,
      wordTimestamps: false,
    });
    await jevClient.load({
      modelId: "laya-multilingual-int8",
      source: "soyelmismo/laya-multilingual-onnx",
      dir: "decision/laya-multilingual-int8",
      modelFile: "model_quantized.onnx",
      tokenizerFile: "tokenizer.json",
      configFile: "config.json",
      device: "webgpu",
    });

    // 发起一个 40ms 超时的 ASR 识别任务（占用唯一 GPU 槽位）
    const pAsr = host.request({
      id: "asr-stuck-req",
      service: "asr",
      method: "transcribe",
      payload: { audio: new Float32Array(160), language: "zh-hans" },
      deadlineMs: 40,
    });

    // 紧接着入队一个高优先级 P0 JEV 决策请求
    const pJev = jevClient.predict({ text: "hello" }, {});

    await expect(pAsr).rejects.toThrow(/REQUEST_TIMEOUT/);
    const jevRes = await pJev;

    expect(asrWorkerTerminated).toBe(true);
    expect(asrClient.loaded).toBe(false); // Worker 已重建/终止，客户端状态已失效
    expect(overlapDetected).toBe(false);
    expect(jevRes.model).toBe("laya-rl-agent");
    // 严格顺序：ASR 开始 -> ASR Worker 被终止释放 GPU -> P0 JEV 启动 -> P0 JEV 完成
    expect(timeline).toEqual([
      "asr-gpu-start",
      "asr-worker-terminated",
      "jev-p0-gpu-start",
      "jev-p0-gpu-end",
    ]);
  });

  it("可中断的 LLM 活跃任务收到 stop 时，等待 Worker 优雅停止后再运行排队的 P0 任务", async () => {
    const timeline: string[] = [];
    let llmGpuBusy = false;
    let overlap = false;

    const mgr = new RuntimeManager({
      llmStopGraceMs: 300,
      workerFactories: {
        createLlmWorker: () =>
          createMockWorker((msg, reply) => {
            if (msg.type === "load") {
              reply({ type: "ready", backend: "webgpu" });
            } else if (msg.type === "chat") {
              llmGpuBusy = true;
              timeline.push("llm-chat-start");
            } else if (msg.type === "stop") {
              timeline.push("llm-received-stop");
              // 模拟 25ms 后完成当前 step 并返回 aborted done
              setTimeout(() => {
                llmGpuBusy = false;
                timeline.push("llm-stopped-cleanly");
                reply({
                  type: "done",
                  text: "半句回复",
                  elapsedMs: 25,
                  aborted: true,
                });
              }, 25);
            }
          }),
        createJevWorker: () =>
          createMockWorker((msg, reply) => {
            if (msg.type === "load") {
              reply({ type: "ready", backend: "webgpu" });
            } else if (msg.type === "predict") {
              if (llmGpuBusy) overlap = true;
              timeline.push("jev-p0-run");
              reply({
                type: "result",
                id: msg.id,
                result: {
                  model: "laya-rl-agent",
                  answers: {},
                  usage: { input_tokens: 5, output_tokens: 0 },
                },
              });
            }
          }),
      },
    });

    const host = new InPageRuntimeHost({ manager: mgr });
    const llmClient = new LlmClient(host);
    const jevClient = new JevClient(host);

    await llmClient.load({
      runtime: "wllama",
      dir: "llm/qwen2.5-0.5b",
      file: "qwen.gguf",
      device: "webgpu",
      nCtx: 2048,
    });
    await jevClient.load({
      modelId: "laya-multilingual-int8",
      source: "soyelmismo/laya-multilingual-onnx",
      dir: "decision/laya-multilingual-int8",
      modelFile: "model_quantized.onnx",
      tokenizerFile: "tokenizer.json",
      configFile: "config.json",
      device: "webgpu",
    });

    const pChat = llmClient.chat(
      [{ role: "user", content: "写一篇长文" }],
      512,
      () => undefined
    );

    await new Promise((r) => setTimeout(r, 10));
    const pJev = jevClient.predict({ text: "check" }, {});

    // 触发停止
    llmClient.stop();

    await expect(pChat).rejects.toThrow(/REQUEST_CANCELLED/);
    await pJev;

    expect(overlap).toBe(false);
    expect(timeline).toEqual([
      "llm-chat-start",
      "llm-received-stop",
      "llm-stopped-cleanly",
      "jev-p0-run",
    ]);
  });
});

describe("3. RPC 完整结束路径与 Offscreen 宿主关闭/重建 (Complete RPC Lifecycle)", () => {
  it("Offscreen 在请求进行中关闭时：清理所有 pending 计时器与 Map、拒绝旧请求且不重发；宿主重建后新请求正常成功", async () => {
    // 构建一对内存互通的模拟 BroadcastChannel
    const peers = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
    const createMemoryChannel = (): BroadcastChannel => {
      const peer: any = {
        onmessage: null,
        postMessage(data: RpcChannelEnvelope) {
          for (const other of peers) {
            if (other !== peer) {
              queueMicrotask(() =>
                other.onmessage?.({ data } as MessageEvent<RpcChannelEnvelope>)
              );
            }
          }
        },
        close() {
          peers.delete(peer);
        },
      };
      peers.add(peer);
      return peer as BroadcastChannel;
    };

    let hostOnline = false;
    let inferenceExecCount = 0;
    const serverChannel = createMemoryChannel();

    serverChannel.onmessage = (e: MessageEvent<RpcChannelEnvelope>) => {
      if (!hostOnline) return;
      const env = e.data;
      if (env.kind === "ping") {
        serverChannel.postMessage({ kind: "pong", id: env.id });
      } else if (env.kind === "request") {
        const req = env.request;
        if (req.method === "load") {
          serverChannel.postMessage({
            kind: "response",
            response: {
              id: req.id,
              ok: true,
              result: {
                backend: "webgpu",
                modelId: "llm/qwen2.5-0.5b",
                sessionVersion: 1,
              },
            },
          });
        } else if (req.method === "chat") {
          inferenceExecCount++;
          // 第一个推理请求模拟进行中（不立即返回，等待宿主关闭）
          if (inferenceExecCount > 1) {
            serverChannel.postMessage({
              kind: "response",
              response: {
                id: req.id,
                ok: true,
                result: { text: "重建后成功回复", elapsedMs: 12 },
              },
            });
          }
        }
      }
    };

    const offscreenHost = new ChromiumOffscreenHost({
      defaultTimeoutMs: 2000,
      channelFactory: () => createMemoryChannel(),
      ensureOffscreenFn: async () => {
        hostOnline = true;
      },
      closeOffscreenFn: async () => {
        hostOnline = false;
      },
    });

    const llmClient = new LlmClient(offscreenHost);
    await llmClient.load({
      runtime: "wllama",
      dir: "llm/qwen2.5-0.5b",
      file: "qwen.gguf",
      device: "webgpu",
      nCtx: 2048,
    });
    expect(llmClient.loaded).toBe(true);

    // 发起第一个对话请求（处于进行中 pending）
    const inFlightChat = llmClient.chat(
      [{ role: "user", content: "第一次请求" }],
      64,
      () => undefined
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(offscreenHost.getPendingCount()).toBe(1);

    // 在请求进行中关闭 Offscreen 宿主
    await offscreenHost.close();

    // 1. 进行中的请求立即以 HOST_CLOSED 结算，且 pending Map 已清空
    await expect(inFlightChat).rejects.toThrow(/HOST_CLOSED/);
    expect(offscreenHost.getPendingCount()).toBe(0);
    // 2. 客户端就绪状态已同步失效
    expect(llmClient.loaded).toBe(false);
    // 3. 旧请求绝未被自动重发（仍为 1 次）
    expect(inferenceExecCount).toBe(1);

    // 4. 宿主重建后，重新加载并发起新请求正常成功
    await llmClient.load({
      runtime: "wllama",
      dir: "llm/qwen2.5-0.5b",
      file: "qwen.gguf",
      device: "webgpu",
      nCtx: 2048,
    });
    const secondRes = await llmClient.chat(
      [{ role: "user", content: "第二次请求" }],
      64,
      () => undefined
    );
    expect(secondRes.text).toBe("重建后成功回复");
    expect(inferenceExecCount).toBe(2);
  });
});

// ============================================================================
// 4. 生成期间切换 LLM 模型：等旧生成真正停止后再启动新加载
// ============================================================================
describe("4. 生成期间切换 LLM 模型 (Wait for Old Generation Stop Before New Load)", () => {
  it("旧 Worker 延迟响应 stop 时，新模型加载必须等旧 Worker 返回 done 释放槽位后才开始", async () => {
    const timeline: string[] = [];

    const manager = new RuntimeManager({
      workerFactories: {
        createLlmWorker: () =>
          createMockWorker((msg, post) => {
            if (msg.type === "load") {
              timeline.push(`worker:load:${msg.dir}`);
              setTimeout(() => post({ type: "ready", backend: "webgpu" }), 10);
            } else if (msg.type === "chat") {
              timeline.push("worker:chat:start");
            } else if (msg.type === "stop") {
              timeline.push("worker:stop:received");
              // 模拟旧 Worker 延迟 80ms 才完成停止并返回 done
              setTimeout(() => {
                timeline.push("worker:chat:done-after-stop");
                post({
                  type: "done",
                  text: "partial",
                  elapsedMs: 80,
                  aborted: true,
                });
              }, 80);
            }
          }),
      },
      llmStopGraceMs: 500,
    });

    const host = new InPageRuntimeHost({ manager });
    const llmTabClient = new LlmClient(host);
    const ocrVlmClient = new LlmClient(host);

    // 1. 先加载第一个 LLM 模型
    await llmTabClient.load({
      runtime: "wllama",
      dir: "llm/qwen2.5-0.5b",
      file: "qwen.gguf",
      device: "webgpu",
      nCtx: 2048,
    });
    expect(timeline).toEqual(["worker:load:llm/qwen2.5-0.5b"]);

    // 2. 发起长对话生成
    const chatPromise = llmTabClient.chat(
      [{ role: "user", content: "长文生成中..." }],
      256,
      () => undefined
    );

    // 等待生成任务真正开始执行
    await new Promise((r) => setTimeout(r, 15));
    expect(timeline).toContain("worker:chat:start");

    // 3. 在生成期间切换到 VLM 模型（发起新 load）
    const switchLoadPromise = ocrVlmClient.load({
      runtime: "wllama",
      dir: "ocr/unlimited-ocr-iq2m",
      file: "vlm.gguf",
      mmprojFile: "mmproj.gguf",
      device: "webgpu",
      nCtx: 8192,
    });

    // 关键断言：此时距离发起切换仅过 25ms（旧 Worker 收到 stop 后需 80ms 才返回 done），新模型 load 绝对不能提前开始！
    await new Promise((r) => setTimeout(r, 25));
    expect(timeline).toEqual([
      "worker:load:llm/qwen2.5-0.5b",
      "worker:chat:start",
      "worker:stop:received",
    ]);

    // 旧对话请求应以 MODEL_SWITCHED 被拒绝
    await expect(chatPromise).rejects.toThrow(/MODEL_SWITCHED/);

    // 4. 等待新模型加载完成，验证时间线严格顺序：done-after-stop 在 load:ocr/unlimited-ocr-iq2m 之前
    await switchLoadPromise;
    expect(timeline).toEqual([
      "worker:load:llm/qwen2.5-0.5b",
      "worker:chat:start",
      "worker:stop:received",
      "worker:chat:done-after-stop",
      "worker:load:ocr/unlimited-ocr-iq2m",
    ]);
    expect(ocrVlmClient.loaded).toBe(true);
    expect(llmTabClient.loaded).toBe(false);
  });
});

// ============================================================================
// 5. 下载与导入 RPC 只负责启动任务（不受普通 RPC 超时限制）
// ============================================================================
describe("5. 下载与导入 RPC 只负责启动任务 (Download/Import Start-Only RPC)", () => {
  it("使用极短 RPC 超时 (40ms) 模拟长耗时下载 (180ms) 与导入 (160ms)：调用方不误报超时且最终状态正确", async () => {
    const manager = new RuntimeManager();
    manager.modelManager.init = async () => undefined;
    let downloadExecFinished = false;

    // 模拟耗时 180ms 的长下载（远超 40ms 的 RPC 超时）
    const targetId = "whisper-base-timestamped";
    manager.modelManager.download = async (id: string) => {
      const rec = manager.modelManager.get(id)!;
      rec.state = "queued";
      (manager.modelManager as any).emit(id, { ...rec }, true);
      await new Promise((r) => setTimeout(r, 60));
      rec.state = "downloading";
      (manager.modelManager as any).emit(id, { ...rec }, true);
      await new Promise((r) => setTimeout(r, 120));
      rec.state = "installed";
      rec.downloadedAt = Date.now();
      downloadExecFinished = true;
      (manager.modelManager as any).emit(id, { ...rec }, true);
    };

    // 模拟耗时 160ms 的大文件导入（远超 40ms 的 RPC 超时）
    manager.modelManager.importFiles = async (
      id: string,
      files: { name: string; file: File }[]
    ) => {
      const rec = manager.modelManager.get(id)!;
      rec.state = "verifying";
      (manager.modelManager as any).emit(id, { ...rec }, true);
      await new Promise((r) => setTimeout(r, 160));
      const nextFiles = { ...rec.files };
      for (const f of rec.manifest.files) {
        nextFiles[f.path] = { state: "installed", downloaded: f.size };
      }
      rec.files = nextFiles;
      rec.state = "installed";
      rec.downloadedAt = Date.now();
      (manager.modelManager as any).emit(id, { ...rec, files: nextFiles }, true);
      return files.length;
    };

    // 使用 40ms 的极短 RPC 超时构造跨通道 Host
    const peers = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
    const createChannel = (): BroadcastChannel => {
      const peer: any = {
        onmessage: null,
        postMessage(data: RpcChannelEnvelope) {
          for (const other of peers) {
            if (other !== peer) {
              queueMicrotask(() =>
                other.onmessage?.({ data } as MessageEvent<RpcChannelEnvelope>)
              );
            }
          }
        },
        close() {
          peers.delete(peer);
        },
      };
      peers.add(peer);
      return peer as BroadcastChannel;
    };

    const serverChannel = createChannel();
    manager.setCallbacks({
      onModelBroadcast: (id, record) => {
        serverChannel.postMessage({ kind: "model-broadcast", id, record });
      },
      onModelImportResult: (result) => {
        serverChannel.postMessage({ kind: "model-import-result", result });
      },
    });
    serverChannel.onmessage = (e: MessageEvent<RpcChannelEnvelope>) => {
      const msg = e.data;
      if (msg.kind === "ping") {
        serverChannel.postMessage({ kind: "pong", id: msg.id });
      } else if (msg.kind === "request") {
        void manager.handleRequest(msg.request).then((response) => {
          serverChannel.postMessage({ kind: "response", response });
        });
      }
    };

    const shortTimeoutHost = new ChromiumOffscreenHost({
      defaultTimeoutMs: 40,
      channelFactory: () => createChannel(),
      ensureOffscreenFn: async () => undefined,
    });

    const remoteModels = new RemoteModelManager("hf-mirror", shortTimeoutHost);
    const observedStates: string[] = [];
    remoteModels.subscribe((id, rec) => {
      if (id === targetId) observedStates.push(rec.state);
    });

    // 1. 触发 download：RPC 立即确认启动并返回（耗时 < 20ms，不会触发 40ms RPC 超时）
    await expect(remoteModels.download(targetId)).resolves.toBeUndefined();
    expect(remoteModels.get(targetId)?.state).toBe("queued");
    expect(downloadExecFinished).toBe(false);

    // 等待 220ms 让后台下载完成，通过 model-broadcast 验证最终状态为 installed
    await new Promise((r) => setTimeout(r, 220));
    expect(downloadExecFinished).toBe(true);
    expect(remoteModels.get(targetId)?.state).toBe("installed");
    expect(observedStates).toContain("downloading");
    expect(observedStates[observedStates.length - 1]).toBe("installed");

    // 2. 触发 importFiles：RPC 同样立即返回启动确认，随后通过 model-import-result 完成，不触发 40ms 超时
    const importTargetId = "qwen2.5-0.5b";
    const dummyFile = new File([new Uint8Array(8)], "dummy.gguf");
    const importedCount = await remoteModels.importFiles(importTargetId, [
      { name: "dummy.gguf", file: dummyFile },
    ]);
    expect(importedCount).toBeGreaterThan(0);
    expect(remoteModels.get(importTargetId)?.state).toBe("installed");
  });

  it("导入进行中关闭 Offscreen 或导入校验失败时：通过关联 taskId 统一结算（拒绝等待、清理 importWaiters、模型状态置为 error），不会无限挂起", async () => {
    const manager = new RuntimeManager();
    manager.modelManager.init = async () => undefined;

    let shouldFailWithSha256 = false;
    manager.modelManager.importFiles = async (id: string) => {
      const rec = manager.modelManager.get(id)!;
      rec.state = "verifying";
      (manager.modelManager as any).emit(id, { ...rec }, true);
      if (shouldFailWithSha256) {
        await new Promise((r) => setTimeout(r, 20));
        rec.state = "error";
        rec.error = "dummy.gguf SHA256 校验失败";
        (manager.modelManager as any).emit(id, { ...rec }, true);
        throw new Error("dummy.gguf SHA256 校验失败");
      }
      // 模拟一个长时间卡在校验/落盘中的导入（5 秒），期间 Offscreen 被关闭
      await new Promise((r) => setTimeout(r, 5000));
      return 1;
    };

    const peers = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
    const createChannel = (): BroadcastChannel => {
      const peer: any = {
        onmessage: null,
        postMessage(data: RpcChannelEnvelope) {
          for (const other of peers) {
            if (other !== peer) {
              queueMicrotask(() =>
                other.onmessage?.({ data } as MessageEvent<RpcChannelEnvelope>)
              );
            }
          }
        },
        close() {
          peers.delete(peer);
        },
      };
      peers.add(peer);
      return peer as BroadcastChannel;
    };

    const serverChannel = createChannel();
    manager.setCallbacks({
      onModelBroadcast: (id, record) => {
        serverChannel.postMessage({ kind: "model-broadcast", id, record });
      },
      onModelImportResult: (result) => {
        serverChannel.postMessage({ kind: "model-import-result", result });
      },
    });
    serverChannel.onmessage = (e: MessageEvent<RpcChannelEnvelope>) => {
      const msg = e.data;
      if (msg.kind === "ping") {
        serverChannel.postMessage({ kind: "pong", id: msg.id });
      } else if (msg.kind === "request") {
        void manager.handleRequest(msg.request).then((response) => {
          serverChannel.postMessage({ kind: "response", response });
        });
      }
    };

    const host = new ChromiumOffscreenHost({
      defaultTimeoutMs: 2000,
      channelFactory: () => createChannel(),
      ensureOffscreenFn: async () => undefined,
      closeOffscreenFn: async () => undefined,
    });

    const remoteModels = new RemoteModelManager("hf-mirror", host);
    const importId = "qwen2.5-0.5b";
    const dummyFile = new File([new Uint8Array(8)], "dummy.gguf");

    // 场景 A：导入过程中发生 SHA256 校验失败，通过 model-import-result 通知立即拒绝
    shouldFailWithSha256 = true;
    await expect(
      remoteModels.importFiles(importId, [{ name: "dummy.gguf", file: dummyFile }])
    ).rejects.toThrow(/SHA256 校验失败/);
    expect(host.getPendingCount()).toBe(0);
    expect(remoteModels.get(importId)?.state).toBe("error");

    // 场景 B：导入启动 RPC 已返回、正处于后台校验中时 Offscreen 关闭
    shouldFailWithSha256 = false;
    const inFlightImport = remoteModels.importFiles(importId, [
      { name: "dummy.gguf", file: dummyFile },
    ]);

    // 等待启动 RPC 完成并进入后台 verifying 等待阶段
    await new Promise((r) => setTimeout(r, 25));
    expect(remoteModels.get(importId)?.state).toBe("verifying");
    expect(host.getPendingCount()).toBe(1);

    // 在导入途中关闭 Offscreen
    await host.close();

    // 1. 导入 Promise 立即以 HOST_CLOSED 被拒绝，不会无限等待
    await expect(inFlightImport).rejects.toThrow(/HOST_CLOSED/);
    // 2. importWaiters 已被清理
    expect(host.getPendingCount()).toBe(0);
    // 3. 本地模型记录已从 verifying 置为 error，UI 不会卡在“校验中”
    expect(remoteModels.get(importId)?.state).toBe("error");
    expect(remoteModels.get(importId)?.error).toMatch(/HOST_CLOSED/);
  });

  it("OCR 加载模型支持推导补齐 detFile / recFile / detName / recName，并由 createOcrInstance 成功加载", async () => {
    let capturedSpec: any = null;
    const mgr = new RuntimeManager({
      workerFactories: {
        createOcrInstance: async (spec) => {
          capturedSpec = spec;
          return {
            getInitializationSummary: () => ({
              detProvider: "webgpu",
              recProvider: "webgpu",
              elapsedMs: 120,
            }),
            recognize: async () => ({}),
            dispose: async () => {},
          } as any;
        },
      },
    });

    const host = new InPageRuntimeHost({ manager: mgr });
    const ocrClient = new OcrClient(host);

    const info = await ocrClient.load({
      detModelId: "ppocr-v6-medium-det",
      recModelId: "ppocr-v6-medium-rec",
      source: "paddle-model-ecology",
      detDir: "ocr/ppocr-v6-medium/detection",
      recDir: "ocr/ppocr-v6-medium/recognition",
      device: "webgpu",
    } as any);

    expect(info.detProvider).toBe("webgpu");
    expect(capturedSpec).toBeTruthy();
    expect(capturedSpec.detFile).toBe("PP-OCRv6_medium_det_onnx_infer.tar");
    expect(capturedSpec.recFile).toBe("PP-OCRv6_medium_rec_onnx_infer.tar");
    expect(capturedSpec.detName).toBe("PP-OCRv6_medium_det");
    expect(capturedSpec.recName).toBe("PP-OCRv6_medium_rec");
  });

  it("OCR 初始化失败后清除加载状态和驻留记录", async () => {
    const mgr = new RuntimeManager({
      workerFactories: {
        createOcrInstance: async () => {
          throw new Error("another WebGPU EP inference session is being created.");
        },
      },
    });
    const response = await mgr.handleRequest({
      id: "ocr-failed-load",
      service: "ocr",
      method: "load",
      payload: {
        detModelId: "ppocr-v6-medium-det",
        recModelId: "ppocr-v6-medium-rec",
        device: "webgpu",
      },
    });
    expect(response.ok).toBe(false);
    expect(mgr.getSessionState("ocr").state).toBe("unloaded");
    expect(mgr.pool.list().some((entry) => entry.key === "ocr")).toBe(false);
  });
});
