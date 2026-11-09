import type { ModelManifest } from "./types";

export const DOC_MODEL_ID = "pp-doclayout-v3-onnx";

function manifest(
  m: Omit<ModelManifest, "size"> & { size?: number }
): ModelManifest {
  const size = m.size ?? m.files.reduce((s, f) => s + f.size, 0);
  return { ...m, size };
}

// Kokoro v1 的 36 个官方音色（voice .bin = 510 行 × 256 维 float32）。
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: "zf_xiaoxiao", name: "Xiaoxiao", lang: "z", gender: "f" },
  { id: "zf_xiaoni", name: "Xiaoni", lang: "z", gender: "f" },
  { id: "zf_xiaobei", name: "Xiaobei", lang: "z", gender: "f" },
  { id: "zf_xiaoyi", name: "Xiaoyi", lang: "z", gender: "f" },
  { id: "zm_yunjian", name: "Yunjian", lang: "z", gender: "m" },
  { id: "zm_yunxi", name: "Yunxi", lang: "z", gender: "m" },
  { id: "zm_yunxia", name: "Yunxia", lang: "z", gender: "m" },
  { id: "zm_yunyang", name: "Yunyang", lang: "z", gender: "m" },
  { id: "af_heart", name: "Heart", lang: "a", gender: "f" },
  { id: "af_bella", name: "Bella", lang: "a", gender: "f" },
  { id: "af_aoede", name: "Aoede", lang: "a", gender: "f" },
  { id: "af_nicole", name: "Nicole", lang: "a", gender: "f" },
  { id: "af_kore", name: "Kore", lang: "a", gender: "f" },
  { id: "af_sarah", name: "Sarah", lang: "a", gender: "f" },
  { id: "af_nova", name: "Nova", lang: "a", gender: "f" },
  { id: "af_sky", name: "Sky", lang: "a", gender: "f" },
  { id: "af_alloy", name: "Alloy", lang: "a", gender: "f" },
  { id: "af_jessica", name: "Jessica", lang: "a", gender: "f" },
  { id: "af_river", name: "River", lang: "a", gender: "f" },
  { id: "am_fenrir", name: "Fenrir", lang: "a", gender: "m" },
  { id: "am_michael", name: "Michael", lang: "a", gender: "m" },
  { id: "am_puck", name: "Puck", lang: "a", gender: "m" },
  { id: "am_echo", name: "Echo", lang: "a", gender: "m" },
  { id: "am_eric", name: "Eric", lang: "a", gender: "m" },
  { id: "am_liam", name: "Liam", lang: "a", gender: "m" },
  { id: "am_onyx", name: "Onyx", lang: "a", gender: "m" },
  { id: "am_adam", name: "Adam", lang: "a", gender: "m" },
  { id: "am_santa", name: "Santa", lang: "a", gender: "m" },
  { id: "bf_emma", name: "Emma", lang: "b", gender: "f" },
  { id: "bf_isabella", name: "Isabella", lang: "b", gender: "f" },
  { id: "bf_alice", name: "Alice", lang: "b", gender: "f" },
  { id: "bf_lily", name: "Lily", lang: "b", gender: "f" },
  { id: "bm_fable", name: "Fable", lang: "b", gender: "m" },
  { id: "bm_george", name: "George", lang: "b", gender: "m" },
  { id: "bm_lewis", name: "Lewis", lang: "b", gender: "m" },
  { id: "bm_daniel", name: "Daniel", lang: "b", gender: "m" },
];

// 各音色 voice .bin 的内容哈希（与 KOKORO_VOICES 一一对应，下载/导入时校验）
export const KOKORO_VOICE_SHA: Record<string, string> = {
  zf_xiaoxiao: "03adb5d5e3ddd88b047954e974e651cb0a4b524c985057e5d872e962c7be1169",
  zf_xiaoni: "08892b62a39af0a615cd0581238db7e19e44c578e8fa0bfd0e586e93327d9cba",
  zf_xiaobei: "5dde6e1c9c4f12c8b327bc29c0cee361a23b52b952c04636858ba637ec66e640",
  zf_xiaoyi: "bc1555c5c486099196ac254bae5e0bb543c121952a3092f50b7d8724f1bc36b3",
  zm_yunjian: "de48a00bdbf3649f07162269a2b6e0513604389bfac8a2e6c75cb34b323ad6fa",
  zm_yunxi: "7243892fb4e560d47014090ddf010f8b8b790f3c6b029ff82b2ac06aa4e27c8b",
  zm_yunxia: "6b2b8fc15b3df19a368daebe5c581c7fabf433ee5b8a17ffd6b3d723cff8936d",
  zm_yunyang: "261e2c89470534dbbcb8fd98b8fdc495ec94063d9bb6c8277f7be43cccba3f42",
  af_heart: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b",
  af_bella: "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b",
  af_aoede: "4a004c33430762e2461eedb2013fad808ef4ab3121f5300f554476caf58d8361",
  af_nicole: "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a",
  af_kore: "9be5221b6a941c04b561959b8ff0b06e809444dcc4ab7e75a7b23606f691819e",
  af_sarah: "4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a",
  af_nova: "18778272caa0d0eebaea251c35fd635f038434f9eee5e691d02a174bd328414f",
  af_sky: "4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9",
  af_alloy: "c4a6b876047fd7fb472edf4ebd63cfac7c3b958a7cae7c106e8f038ca6308c45",
  af_jessica: "a240a5e3c15b43563d6e923bdca8ef5613a23471d9b77653694012435df23bd8",
  af_river: "00a2bcf82b1d86e8f19902ede58c65ccf6c0e43b44b7d74fad54e5d8933c9c30",
  am_fenrir: "c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43",
  am_michael: "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1",
  am_puck: "fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0",
  am_echo: "3968b92c3c4cd1c4416dbded36c13eaa388a90d5788d02a13e4d781f5f8cf3c3",
  am_eric: "e8b5be17edd1e3636901ce7598baafe2dc8dd8ff707a0c23bf9e461add7e2832",
  am_liam: "52403be32fd047c6a44517cb0bcd6b134f2a18baa73e70ef41651e0eab921ade",
  am_onyx: "da5d135b424164916d75a68ffb4c2abce3d7d5ccc82dd1ee6cf447ce286145e6",
  am_adam: "162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716",
  am_santa: "61150cf726ab6c5ed7a99f90a304f91f5a72c00c592e89ec94e5df11c319227a",
  bf_emma: "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73",
  bf_isabella: "3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f",
  bf_alice: "08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573",
  bf_lily: "5e0ee32ebe64a467124976b14e69590746f1c4ce41a12b587a50c862edfea335",
  bm_fable: "f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1",
  bm_george: "c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc",
  bm_lewis: "b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97",
  bm_daniel: "6b3194bbceffb746733cbc22c8f593dd44e401a71d53895a2dca891bc595a1e8",
};

// Piper 音色：一个音色即一个独立模型（model.onnx + .onnx.json），
// 每个音色在 CATALOG 中对应一个 manifest（id = `piper-${v.id}`）。
export interface PiperVoice {
  id: string;
  name: string;
  sampleRate: number;
  espeak: string;
  onnxSize: number;
  jsonSize: number;
  onnxSha256: string;
  jsonSha256: string;
}

export const PIPER_VOICES: PiperVoice[] = [];

export function getPiperVoiceByDir(dir: string): PiperVoice | undefined {
  return PIPER_VOICES.find((v) => `tts/piper/${v.id}` === dir);
}

export const CATALOG: ModelManifest[] = [
  manifest({
    id: DOC_MODEL_ID,
    name: "PP-DocLayoutV3 (ONNX · 文档布局)",
    version: "Bei0001/PP-DocLayoutV3-ONNX@ff677269004f03007705f3e7f1bc8d0f4546d299",
    revision: "ff677269004f03007705f3e7f1bc8d0f4546d299",
    license: "Apache-2.0",
    task: "doc-layout", runtime: "onnx", format: "onnx",
    backend: ["wasm"],
    source: "Bei0001/PP-DocLayoutV3-ONNX",
    dir: "doc/pp-doclayout-v3",
    files: [
      { path: "PP-DocLayoutV3.onnx", size: 5088167, sha256: "c0721928ff08741bb208ebed539c77170db5234a68cb7e546e6cc9bc172a695b" },
      { path: "PP-DocLayoutV3.onnx.data", size: 136774480, sha256: "34df3e4b79d7bbbf82abce1b4f3cde3d540fa57ad42ec8905c352b97c408d437" },
      { path: "config.json", size: 2460, sha256: "3cf834b91d23a756b1519bce4db42c09e852f3e35c35092dd5a3e253a50c071a" },
      { path: "preprocessor_config.json", size: 575, sha256: "519fe0187a43a1ca429e3ad8317bab8700f0d5e8fb3a6e3a0a413ffac078ba42" },
    ],
  }),
  // 词级时间戳版：decoder 额外导出 cross_attentions，transformers.js 内置
  // cross-attention + DTW 对齐产出精确词时间戳（generation_config 含 alignment_heads）
  manifest({
    id: "whisper-base-timestamped",
    name: "Whisper Base (int8, 词级时间戳)",
    version: "onnx-community/whisper-base_timestamped@main",
    task: "asr",
    runtime: "transformers",
    format: "onnx",
    backend: ["webgpu"],
    languages: ["multilingual"],
    multilingual: true,
    wordTimestamps: true,
    source: "onnx-community/whisper-base_timestamped",
    dir: "asr/whisper-base-timestamped",
    files: [
      { path: "onnx/encoder_model_int8.onnx", size: 23159150, sha256: "152da96dd8ff3f28f3fadabc2e8960405a277846453ff94ed411fe935a72917f" },
      { path: "onnx/decoder_model_merged_int8.onnx", size: 53712708, sha256: "cf9a8d5bcddc0917a0078135b484cedcaf44f28909cd91910abd29dced9171db" },
      { path: "config.json", size: 2243, sha256: "f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b" },
      { path: "tokenizer.json", size: 2480466, sha256: "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566" },
      { path: "tokenizer_config.json", size: 282682, sha256: "2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573" },
      { path: "special_tokens_map.json", size: 2194, sha256: "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691" },
      { path: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a" },
      { path: "merges.txt", size: 493869, sha256: "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6" },
      { path: "preprocessor_config.json", size: 339, sha256: "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d" },
      { path: "generation_config.json", size: 3832, sha256: "61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0" },
    ],
  }),
  // 词级时间戳版 small：ts 仓库的 _int8 文件即真量化（encoder 92MB /
  // decoder 156MB，与 fp32 的 1/4 量级相符），直接引用
  manifest({
    id: "whisper-small-timestamped",
    name: "Whisper Small (int8, 词级时间戳)",
    version: "onnx-community/whisper-small_timestamped@main",
    task: "asr",
    runtime: "transformers",
    format: "onnx",
    backend: ["webgpu"],
    languages: ["multilingual"],
    multilingual: true,
    wordTimestamps: true,
    source: "onnx-community/whisper-small_timestamped",
    dir: "asr/whisper-small-timestamped",
    files: [
      { path: "onnx/encoder_model_int8.onnx", size: 92240465, sha256: "496dac83b9392d70cc6f5d54a0abf0d6965e3fbf429910377e8c30dfecb2e1a7" },
      { path: "onnx/decoder_model_merged_int8.onnx", size: 156795750, sha256: "c831996a6d5a535cf17447b0d7ecc36da6b72696e6fb906852ba6136b9199abb" },
      { path: "config.json", size: 2227, sha256: "457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18" },
      { path: "generation_config.json", size: 3893, sha256: "f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0" },
      { path: "tokenizer.json", size: 2480466, sha256: "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566" },
      { path: "tokenizer_config.json", size: 282683, sha256: "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce" },
      { path: "special_tokens_map.json", size: 2194, sha256: "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691" },
      { path: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a" },
      { path: "merges.txt", size: 493869, sha256: "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6" },
      { path: "preprocessor_config.json", size: 339, sha256: "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d" },
      { path: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1" },
      { path: "normalizer.json", size: 52666, sha256: "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd" },
    ],
  }),
  // 词级时间戳版 medium：decoder 采用 4-bit 量化版（decoder_model_merged_q4.onnx，
  // 448MB，FP32 激活与 int8 encoder 兼容），通过 remotePath 改名落盘供 int8 管线加载
  manifest({
    id: "whisper-medium-timestamped",
    name: "Whisper Medium (int8/q4, 词级时间戳)",
    version: "onnx-community/whisper-medium_timestamped@main",
    task: "asr",
    runtime: "transformers",
    format: "onnx",
    backend: ["webgpu"],
    languages: ["multilingual"],
    multilingual: true,
    wordTimestamps: true,
    source: "onnx-community/whisper-medium_timestamped",
    dir: "asr/whisper-medium-timestamped",
    files: [
      { path: "onnx/encoder_model_int8.onnx", size: 313154498, sha256: "7ef9cf0d146604b787bdd1474003df8ac4a25e48e36d31def4712dc993a84e63" },
      { path: "onnx/decoder_model_merged_int8.onnx", size: 469359189, sha256: "c3282b5f111d07d954368f65830d1ba54019625799532ac5559b683e76db6567", remotePath: "onnx/decoder_model_merged_q4.onnx" },
      { path: "config.json", size: 1417, sha256: "8690388eab438c28ffc0697e2551a60b4f062c7e110e381115c6d9922658293a" },
      { path: "generation_config.json", size: 3779, sha256: "6e52512ad5b2131ce01b4c52378617fe6ec5322b452e1598ce929e903da58f94" },
      { path: "tokenizer.json", size: 3930494, sha256: "7b469ff15eb7816315aa45eec391f5943d639b9d73d110f5c003df5192fd54e3" },
      { path: "tokenizer_config.json", size: 282713, sha256: "21a4fc0483c14b87f4e0bbc177a9a357479bfa7c95aaf21ad53d71e9c5afafb9" },
      { path: "special_tokens_map.json", size: 2194, sha256: "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691" },
      { path: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a" },
      { path: "merges.txt", size: 493869, sha256: "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6" },
      { path: "preprocessor_config.json", size: 339, sha256: "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d" },
      { path: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1" },
      { path: "normalizer.json", size: 52666, sha256: "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd" },
    ],
  }),
  // large-v3-turbo（809M，decoder 仅 4 层）：greedy 解码下标点显著更稳，
  // ts 仓库的 _int8 即真量化文件（与 _quantized 同 sha），无需 remotePath 改名
  manifest({
    id: "whisper-large-v3-turbo-timestamped",
    name: "Whisper Large-v3 Turbo (int8, 词级时间戳)",
    version: "onnx-community/whisper-large-v3-turbo_timestamped@main",
    task: "asr",
    runtime: "transformers",
    format: "onnx",
    backend: ["webgpu"],
    languages: ["multilingual"],
    multilingual: true,
    wordTimestamps: true,
    source: "onnx-community/whisper-large-v3-turbo_timestamped",
    dir: "asr/whisper-large-v3-turbo-timestamped",
    files: [
      { path: "onnx/encoder_model_int8.onnx", size: 644883258, sha256: "3cb43fe7c779110a2f33635fbe24d0db175720834215cb1e4dcc51d4786af156" },
      { path: "onnx/decoder_model_merged_int8.onnx", size: 439997434, sha256: "b4ab1c92a9bcf8c8fdc49deacb57ac51b707d5248bc7868af42371b896c3ae52" },
      { path: "config.json", size: 1330, sha256: "32c02d1dfb9a93ff236cdcf0f741f8f3a4cedb437c407a361a022451ac009131" },
      { path: "generation_config.json", size: 3797, sha256: "8568ddf83476167b4607014956b87142763fa6923e71259a606734beb39bdfc8" },
      { path: "tokenizer.json", size: 2480645, sha256: "b3c8202bbf06d8ee4232c5984baa563784ac4737e2e7fdc42fa180200d3cfcdb" },
      { path: "tokenizer_config.json", size: 282843, sha256: "844b642c73a91359722f47b35705f7174686df33d252695d8572cf9ac03a6389" },
      { path: "special_tokens_map.json", size: 2186, sha256: "baea4ea09372eb4fca86b4e4346139fd73cb807d5087e9de0948e971739c3e74" },
      { path: "vocab.json", size: 1036558, sha256: "e2aa043ef015641d363d8288e7c241c85e36a5c761fb303598e0710233344387" },
      { path: "merges.txt", size: 493869, sha256: "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6" },
      { path: "preprocessor_config.json", size: 340, sha256: "7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711" },
      { path: "added_tokens.json", size: 34648, sha256: "3c51f66c4c21f9e126970078f11ae77a78c74aee8df606ee9daba86e467108e0" },
      { path: "normalizer.json", size: 52666, sha256: "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd" },
    ],
  }),
  // 阿里 FunAudioLLM SenseVoiceSmall（INT8 量化 CTC 模型，原生支持中/粤/英/日/韩 + ITN 标点 + 情感/事件识别，
  // 走 ORT 直接推理，同时映射 HF DennisHuang648/SenseVoiceSmall-onnx 与 ModelScope iic/SenseVoiceSmall-onnx）
  manifest({
    id: "sensevoice-small",
    name: "SenseVoice Small (int8, 中/粤/英/日/韩)",
    version: "iic/SenseVoiceSmall-onnx@master",
    task: "asr",
    runtime: "onnx",
    format: "onnx",
    backend: ["wasm", "webgpu"],
    languages: ["zh", "yue", "en", "ja", "ko"],
    multilingual: true,
    wordTimestamps: true,
    source: "DennisHuang648/SenseVoiceSmall-onnx",
    modelscopeSource: "iic/SenseVoiceSmall-onnx",
    dir: "asr/sensevoice-small",
    files: [
      { path: "model_quant.onnx", size: 241216270, sha256: "21dc965f689a78d1604717bf561e40d5a236087c85a95584567835750549e822" },
      { path: "tokens.json", size: 352064, sha256: "a2594fc1474e78973149cba8cd1f603ebed8c39c7decb470631f66e70ce58e97" },
      { path: "am.mvn", size: 11203, sha256: "29b3c740a2c0cfc6b308126d31d7f265fa2be74f3bb095cd2f143ea970896ae5" },
      { path: "config.yaml", size: 1855, sha256: "f71e239ba36705564b5bf2d2ffd07eece07b8e3f2bbf6d2c99d8df856339ac19" },
    ],
  }),
  manifest({
    id: "ppocr-v5-mobile-det",
    name: "PP-OCRv5 mobile 检测",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-detection",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v5-mobile/detection",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv5_mobile_det_onnx_infer.tar", size: 4843520, sha256: "781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30" }],
  }),
  manifest({
    id: "ppocr-v5-mobile-rec",
    name: "PP-OCRv5 mobile 识别",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-recognition",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v5-mobile/recognition",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv5_mobile_rec_onnx_infer.tar", size: 16701440, sha256: "f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c" }],
  }),
  manifest({
    id: "ppocr-v6-tiny-det",
    name: "PP-OCRv6 tiny 检测",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-detection",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v6-tiny/detection",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv6_tiny_det_onnx_infer.tar", size: 1792000, sha256: "ff6ab415b0a6e0c488550f2fb5d5046f1719848df220b2dc21b56402a65bc05d" }],
  }),
  manifest({
    id: "ppocr-v6-tiny-rec",
    name: "PP-OCRv6 tiny 识别",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-recognition",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v6-tiny/recognition",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv6_tiny_rec_onnx_infer.tar", size: 4526080, sha256: "1e13b22717b1edd89d4cde4fda272b6c17d5b505c97c2baea99da1a3a2d54b29" }],
  }),
  manifest({
    id: "ppocr-v6-small-det",
    name: "PP-OCRv6 small 检测",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-detection",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v6-small/detection",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv6_small_det_onnx_infer.tar", size: 9891840, sha256: "d218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4" }],
  }),
  manifest({
    id: "ppocr-v6-small-rec",
    name: "PP-OCRv6 small 识别",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-recognition",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v6-small/recognition",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv6_small_rec_onnx_infer.tar", size: 21319680, sha256: "d267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1" }],
  }),
  manifest({
    id: "ppocr-v6-medium-det",
    name: "PP-OCRv6 medium 检测",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-detection",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v6-medium/detection",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv6_medium_det_onnx_infer.tar", size: 62044160, sha256: "c5adb0b15de1b1838934eba1dd72e7529e7d80132216c6ee6d26eba6fa054fcf" }],
  }),
  manifest({
    id: "ppocr-v6-medium-rec",
    name: "PP-OCRv6 medium 识别",
    version: "PaddleX official@paddle3.0.0",
    task: "ocr-recognition",
    runtime: "paddleocr",
    format: "tar",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    source: "paddle-model-ecology",
    dir: "ocr/ppocr-v6-medium/recognition",
    base: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0",
    files: [{ path: "PP-OCRv6_medium_rec_onnx_infer.tar", size: 76718080, sha256: "d8cc46c7163c83a151aef8fce5856b965860df90a875029216d605b0f607eaec" }],
  }),
  manifest({
    id: "kokoro-82m",
    name: "Kokoro 82M (q8, 英+中)",
    version: "onnx-community/Kokoro-82M-v1.0-ONNX@main",
    task: "tts",
    runtime: "transformers",
    format: "onnx",
    backend: ["webgpu", "wasm"],
    languages: ["en", "zh"],
    source: "onnx-community/Kokoro-82M-v1.0-ONNX",
    dir: "tts/kokoro-82m",
    files: [
      { path: "onnx/model_quantized.onnx", size: 92361116, sha256: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478" },
      { path: "config.json", size: 44, sha256: "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f" },
      { path: "tokenizer.json", size: 3497, sha256: "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34" },
      { path: "tokenizer_config.json", size: 113, sha256: "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20" },
      ...KOKORO_VOICES.map((v) => ({
        path: `voices/${v.id}.bin`,
        size: 522240,
        sha256: KOKORO_VOICE_SHA[v.id]!,
      })),
    ],
  }),
  manifest({
    // Audio8 TTS Preview 0.1B ONNX INT8（DualAR Falcon-H1 混合慢速自回归 + 快速码本自回归 + FP16 44.1kHz 神经音频编解码器）；
    // 支持中、粤、英、日、韩、法、德、西、意、荷、波 11 种语言零样本语音合成。
    id: "audio8-tts-0.1b-int8",
    name: "Audio8 TTS 0.1B (ONNX INT8, 中/粤/英/日/韩等 11 语言)",
    version: "Edge0/audio8-TTS-0.1B-ONNX-INT8@main",
    task: "tts",
    runtime: "onnx",
    format: "onnx",
    backend: ["wasm"],
    languages: ["zh", "yue", "en", "ja", "ko", "fr", "de", "es", "it", "nl", "pl"],
    multilingual: true,
    source: "Edge0/audio8-TTS-0.1B-ONNX-INT8",
    dir: "tts/audio8-tts-0.1b-int8",
    files: [
      {
        path: "slow_ar_int8.onnx",
        size: 4820700,
        sha256: "5aa5263d5c7e94cc58c81c969710045d313b4de87deae847f5388c126722bd3a",
      },
      {
        path: "slow_ar_int8.onnx.data",
        size: 133471232,
        sha256: "4cf0f7ee7d5a9e817caaed310cc2f62dc08ebd37a1b87300dd4255ff0c45dace",
      },
      {
        path: "fast_ar_int8.onnx",
        size: 511306,
        sha256: "6cfc5c8e85d83d27d508d11351d8ca7d2749d6ff2990dc9efd048f86c27ff371",
      },
      {
        path: "fast_ar_int8.onnx.data",
        size: 36718592,
        sha256: "cef092e658d8daad329117f9e9c3b09730deb3e39ea6f6634cd4d1ec8426eb9d",
      },
      {
        path: "codec_decoder_fp16.onnx",
        size: 594319,
        sha256: "25379b866ad555b9a55226c46325344d2ebfafea1b474c29de5223a9d01ea533",
      },
      {
        path: "codec_decoder_fp16.onnx.data",
        size: 260741440,
        sha256: "b9bc968a84f41b86a9a3d19bc6c42b00b5de576512a87501d0c66ff7f896c954",
      },
      {
        path: "reference_codes.npy",
        size: 8928,
        sha256: "7a4fbf777804d88df906982b2b055f579229b0a2044208a4c9bc7680948c4471",
      },
      {
        path: "runtime_manifest.json",
        size: 1424,
        sha256: "c7dc8c2490bcad21739ac01994f0ed2dfc71f76e8e9695239c9606eac03e6b62",
      },
      {
        path: "config.json",
        size: 2651,
        sha256: "65c299d24934dcb47c34cea10c39ad401a817fb785f041dde37b8dde65b77e4e",
      },
      {
        path: "tokenizer/tokenizer.json",
        size: 5852397,
        sha256: "f1c5ac4973f74a007635d81dafcb2cf0e5c4578c7426f48f53ab0ebf5b978bef",
      },
    ],
  }),
  ...PIPER_VOICES.map((v) =>
    manifest({
      id: `piper-${v.id}`,
      name: `Piper ${v.id}（英文，WASM）`,
      version: "SMDfarook/Jarvis@main",
      task: "tts",
      runtime: "piper",
      format: "onnx",
      backend: ["wasm"],
      languages: ["en"],
      source: "SMDfarook/Jarvis",
      dir: `tts/piper/${v.id}`,
      files: [
        { path: `${v.id}.onnx`, size: v.onnxSize, sha256: v.onnxSha256 },
        { path: `${v.id}.onnx.json`, size: v.jsonSize, sha256: v.jsonSha256 },
      ],
    })
  ),
  manifest({
    id: "qwen2.5-0.5b",
    name: "Qwen2.5 0.5B Instruct (q4_k_m)",
    version: "Qwen/Qwen2.5-0.5B-Instruct-GGUF@main",
    task: "llm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    dir: "llm/qwen2.5-0.5b",
    files: [
      {
        path: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        size: 491400032,
        sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
      },
    ],
  }),
  manifest({
    id: "qwen2.5-1.5b",
    name: "Qwen2.5 1.5B Instruct (q4_k_m)",
    version: "Qwen/Qwen2.5-1.5B-Instruct-GGUF@main",
    task: "llm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    dir: "llm/qwen2.5-1.5b",
    files: [
      {
        path: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        size: 1117320736,
        sha256: "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e",
      },
    ],
  }),
  manifest({
    id: "qwen2.5-3b",
    name: "Qwen2.5 3B Instruct (q4_k_m)",
    version: "Qwen/Qwen2.5-3B-Instruct-GGUF@main",
    task: "llm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    dir: "llm/qwen2.5-3b",
    files: [
      {
        path: "qwen2.5-3b-instruct-q4_k_m.gguf",
        size: 2104932768,
        sha256: "626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d",
      },
    ],
  }),
  manifest({
    // VLM 端到端文档解析（智谱 GLM-OCR 0.9B，ONNX Q4 量化版，OmniDocBench V1.5 榜首）；
    // transformers.js 原生内置 GlmOcrForConditionalGeneration + Glm46VProcessor，
    // Q4 权重搭配 FP32 激活（不强制依赖 WebGPU shader-f16），支持 WebGPU 与 WASM。
    id: "glm-ocr-onnx-q4",
    name: "GLM-OCR 0.9B (ONNX Q4, 中/英/多语文档解析)",
    version: "onnx-community/GLM-OCR-ONNX@main",
    task: "ocr-vlm",
    runtime: "transformers",
    format: "onnx",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en", "ja", "ko", "fr", "de", "es", "ru"],
    multilingual: true,
    source: "onnx-community/GLM-OCR-ONNX",
    dir: "ocr/glm-ocr-onnx-q4",
    files: [
      {
        path: "onnx/decoder_model_merged_q4.onnx",
        size: 313836,
        sha256: "65ba95641621739e5ba7da0aeab0acb2684d379ba502351c9d5ba3b92c44d2ff",
      },
      {
        path: "onnx/decoder_model_merged_q4.onnx_data",
        size: 373217280,
        sha256: "a0e1b1af9019761f493e93502010c5602a88a222ad5149c713e3d1f890a779c4",
      },
      {
        path: "onnx/embed_tokens_q4.onnx",
        size: 854,
        sha256: "e65cf5c2a4c4cc11452e4559818853e9c3aed760b4043204ac27a1fe780a82cc",
      },
      {
        path: "onnx/embed_tokens_q4.onnx_data",
        size: 58441728,
        sha256: "5b285463da8b2a61a4cf4638320b45350199f231cce71ae7762afa9dd2d8bf39",
      },
      {
        path: "onnx/vision_encoder_q4.onnx",
        size: 424697,
        sha256: "23da873106bb5c2ffe544a338df577f5d60b555d8135eeebde5baefae560dea3",
      },
      {
        path: "onnx/vision_encoder_q4.onnx_data",
        size: 304547840,
        sha256: "58be7ff915214b0816f4392edd992af45fa097676f85d458e9576caefac5adab",
      },
      {
        path: "chat_template.jinja",
        size: 4606,
        sha256: "062e7ee4cc8defa88a5938b5d456dc60366ffd80647f918946ee747bf09ddc7c",
      },
      {
        path: "config.json",
        size: 2022,
        sha256: "8bf81b89d42ae98917084dfeaca5a1dc20ac20d6145f088ec2aac8840c1e4b9f",
      },
      {
        path: "generation_config.json",
        size: 166,
        sha256: "8da3eae088e11c06a32660d428ce0ac170fefb50e6439469515c82f031d6be45",
      },
      {
        path: "preprocessor_config.json",
        size: 366,
        sha256: "0d4b3cf5190e6b5b53ac52b1880b111163888bfc975db396561ee78887942fe4",
      },
      {
        path: "processor_config.json",
        size: 1495,
        sha256: "8dd8262e7ac5495801a1e6b8d6c6035331b2381b930b23eb262fc46604527074",
      },
      {
        path: "tokenizer.json",
        size: 5420559,
        sha256: "c3e229a66a06267194e62055f70cf5580af83b3582f46928fefee8cb9618f499",
      },
      {
        path: "tokenizer_config.json",
        size: 5855,
        sha256: "49feefa948a21a9386864992b4b5fb7cabc9866a71e57edecb13009afe118fa5",
      },
    ],
  }),
  manifest({
    // VLM 端到端文档解析（百度飞桨 PaddleOCR-VL 1.6，iaa2005/PaddleOCR-VL-1.6-ONNX INT8 量化版）；
    // 采用三阶段 ONNX 图（vision_encoder_q8 + embedding + decoder_q8，共 ~1.16 GB），
    // FP32 激活 + INT8 权重，不强制依赖 shader-f16，支持 WebGPU 与 WASM。
    id: "paddleocr-vl-1.6-onnx-q8",
    name: "PaddleOCR-VL 1.6 (ONNX INT8, 中/英/多语文档解析)",
    version: "iaa2005/PaddleOCR-VL-1.6-ONNX@main",
    task: "ocr-vlm",
    runtime: "onnx",
    format: "onnx",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en", "multilingual"],
    multilingual: true,
    source: "iaa2005/PaddleOCR-VL-1.6-ONNX",
    dir: "ocr/paddleocr-vl-1.6-onnx-q8",
    files: [
      {
        path: "onnx/vision_encoder_q8.onnx",
        size: 446261993,
        sha256: "d3c3721a65b2266d9102f0048b2c972f91746b07f46cb9e7b03f7f1e0aed7c8c",
      },
      {
        path: "onnx/decoder_q8.onnx",
        size: 363265016,
        sha256: "bce4e3504082e8a7c3f718abb933004403b4af3f24074eaceb9952b168e1c022",
      },
      {
        path: "onnx/embedding.onnx",
        size: 423624912,
        sha256: "a3cd4e685f455c9c634f1d62e4ead57eb2965de5cd6cd2b291407b61d5cfdd91",
      },
      {
        path: "added_tokens.json",
        size: 25381,
        sha256: "f59f889088e0fe21c523e7cf121bb6dca3b0bb148cb7159fbb4572c74dfc5644",
      },
      {
        path: "chat_template.jinja",
        size: 1474,
        sha256: "2f27812dab7f333e471884e0c803d807f11953d5453140dfb1aaba234f872bc8",
      },
      {
        path: "config.json",
        size: 2059,
        sha256: "ce7f4565f8b1db78532ad5d1b9ebe55c2139d49bd4cb04778b580a08a598f171",
      },
      {
        path: "generation_config.json",
        size: 133,
        sha256: "a6701d78ab3b4d972307cdec3b69d4c13f46e0d5140514f50ab7d84259324b94",
      },
      {
        path: "preprocessor_config.json",
        size: 641,
        sha256: "111872ab1e8bb7fd040ac5087bfced7ab8f011f02139b088cba294964c3b1d0e",
      },
      {
        path: "processor_config.json",
        size: 137,
        sha256: "1568858960a9760c54431dae693a6152e601ff55cdf6d2eab97a4a99958faea0",
      },
      {
        path: "special_tokens_map.json",
        size: 1151,
        sha256: "d3a125c03103deb2acaf7730791bdbbf196f620e5a2213b664511ff9b4b25bab",
      },
      {
        path: "tokenizer.json",
        size: 11189060,
        sha256: "c8a215a59183d0d0781adc33bacd3ce6162716f7fd568fb30234a74d69803a7d",
      },
      {
        path: "tokenizer_config.json",
        size: 186947,
        sha256: "1f979337347cc0cb72a6282d8a23ed183539aa81a87a906f022aee2bab83c7c5",
      },
    ],
  }),
  manifest({
    // VLM 端到端文档解析（百度 PaddleOCR-VL 1.6，paddleocr + clip 架构 Q4 量化版）；
    // 主模型 Q4_K_M (286MB) + 视觉投影 mmproj-Q8_0 (570MB)，wllama 原生支持。
    id: "paddleocr-vl-1.6-q4",
    name: "PaddleOCR-VL 1.6 (GGUF Q4_K_M + mmproj-Q8_0)",
    version: "LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4@main",
    task: "ocr-vlm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en", "multilingual"],
    multilingual: true,
    source: "LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4",
    dir: "ocr/paddleocr-vl-1.6-q4",
    files: [
      {
        path: "PaddleOCR-VL-1.6-Q4_K_M.gguf",
        size: 300219360,
        sha256: "d79bfabcb904eaf078f1f8a9a4bfd865f0ad6cda17b6441df7ce4bdf641a2651",
      },
      {
        path: "mmproj-Q8_0.gguf",
        size: 597565600,
        sha256: "cc4e8e42afe3b45e40168eb4769aad8b491c5fb7aaca937d8e9746f5f0e6f425",
      },
    ],
  }),
  manifest({
    // VLM 端到端文档解析（Unlimited-OCR，deepseek2-ocr 架构）；
    // 主 GGUF + mmproj（clip 架构）双文件，wllama 按架构自动分离。
    id: "unlimited-ocr-iq2m",
    name: "Unlimited-OCR (IQ2_M + mmproj)",
    version: "sahilchachra/Unlimited-OCR-GGUF@main",
    task: "ocr-vlm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "sahilchachra/Unlimited-OCR-GGUF",
    dir: "ocr/unlimited-ocr-iq2m",
    files: [
      {
        path: "Unlimited-OCR-IQ2_M.gguf",
        size: 1232148224,
        sha256: "fecb9e983f0fadbc11c6cce00611c05179dd7b6003abfad3956404778595d59e",
      },
      {
        path: "mmproj-Unlimited-OCR-F16.gguf",
        size: 811876448,
        sha256: "4f28c295e1fcf67a97488e356f2b4372da4702b77fdfad0fa138b5821325743c",
      },
    ],
  }),
  manifest({
    // 翻译专用模型（33 语言互译）；HF 源 tencent/Hy-MT2-1.8B-GGUF，
    // ModelScope 同名仓库组织名为 Tencent-Hunyuan/，通过 modelscopeSource 区分。
    id: "hy-mt2-1.8b",
    name: "Hy-MT2 1.8B 翻译 (Q4_K_M)",
    version: "tencent/Hy-MT2-1.8B-GGUF@main",
    task: "llm",
    runtime: "wllama",
    format: "gguf",
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "tencent/Hy-MT2-1.8B-GGUF",
    modelscopeSource: "Tencent-Hunyuan/Hy-MT2-1.8B-GGUF",
    dir: "llm/hy-mt2-1.8b",
    files: [
      {
        path: "Hy-MT2-1.8B-Q4_K_M.gguf",
        size: 1133080448,
        sha256: "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699",
      },
    ],
  }),
  manifest({
    // Hy-MT2 翻译模型 ONNX 版（transformers.js + ORT）；单文件 q4f16。
    // 与 GGUF 版互为补充：ONNX 走 ORT WebGPU，不受 wllama 2GB wasm 堆限制。
    // 仅存在于 HF（ModelScope 无此仓库）。
    id: "hy-mt2-1.8b-onnx",
    name: "Hy-MT2 1.8B 翻译 (ONNX q4f16)",
    version: "DavidLuong/Hy-MT2-1.8B-ONNX-q4f16@main",
    task: "llm",
    runtime: "transformers",
    format: "onnx",
    // q4f16 需 WebGPU shader-f16；旧 GPU（如 K2100M）缺失时 worker 自动回退 WASM
    backend: ["webgpu", "wasm"],
    languages: ["zh", "en"],
    source: "DavidLuong/Hy-MT2-1.8B-ONNX-q4f16",
    dir: "llm/hy-mt2-1.8b-onnx",
    files: [
      {
        path: "onnx/model_q4f16.onnx",
        size: 1373443906,
        sha256: "c0f5921fe143b05a420334392c59c175389d87dcfd60dc2554ca1c629eebec2a",
      },
      { path: "chat_template.jinja", size: 654, sha256: "b7491ec0e9c869dfce20f2176758099bf248d979dd05530ede99deb21698acee" },
      { path: "config.json", size: 1518, sha256: "c0621df26e008b9a9d3a288062aebd150169e25aa707400c58fecd410e20d8f8" },
      { path: "generation_config.json", size: 221, sha256: "0e28667f1cb4c7b880b9223b2d87978f88e79ed7ae037de1021f826c18d4ed6f" },
      { path: "special_tokens_map.json", size: 488, sha256: "bb9f59990034dae326581b9c62471523975417869f78a244b7ae2ce8cbb085eb" },
      { path: "tokenizer.json", size: 9527287, sha256: "b475bbef1b0b2fd57dcb865332b546475bd1ede2deb3bb91bafd0c047a8a530a" },
      { path: "tokenizer_config.json", size: 166491, sha256: "273eea0d246839923aa90d4e376e4bce6ae9ad2ea82ff17c1db76a99d6a50e92" },
    ],
  }),
  manifest({
    id: "laya-multilingual-fp16",
    name: "Laya Multilingual (FP16 · JEV 决策引擎 · 100+ 语言)",
    version: "mizchi/laya-multilingual-onnx@main",
    task: "decision",
    runtime: "onnx",
    format: "onnx",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    multilingual: true,
    source: "mizchi/laya-multilingual-onnx",
    dir: "decision/laya-multilingual-fp16",
    files: [
      {
        path: "model.onnx",
        size: 646870871,
        sha256: "0b095e005a4c295cae74d47b7eb6931c369d48f5b720b45278d774165798310c",
      },
      {
        path: "rl_agent_config.json",
        size: 473,
        sha256: "9a669a70961064c3c6cc76d2afb8bc5fb10dcd8349bb66e5f7b9b1afb74440d5",
      },
      {
        path: "onnx_config.json",
        size: 332,
        sha256: "13db475255d076da580a3435f28904e3360fe7f6380d7e3c75ee586e966ca5f0",
      },
      {
        path: "tokenizer/tokenizer.json",
        size: 34363188,
        sha256: "609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f",
      },
      {
        path: "tokenizer/tokenizer_config.json",
        size: 524,
        sha256: "6c6b2d8e3c84ce0e671c129cd6b374b235d6f9863042a5836358d00a89bbb5a1",
      },
    ],
  }),
  manifest({
    id: "laya-multilingual-int8",
    name: "Laya Multilingual (INT8 量化 · JEV 决策引擎 · WebGPU/WASM)",
    version: "soyelmismo/laya-multilingual-onnx@main",
    task: "decision",
    runtime: "onnx",
    format: "onnx",
    backend: ["webgpu", "wasm"],
    languages: ["multilingual"],
    multilingual: true,
    source: "soyelmismo/laya-multilingual-onnx",
    dir: "decision/laya-multilingual-int8",
    files: [
      {
        path: "model-int8.onnx",
        size: 325734062,
        sha256: "d389d2304822a59569387e257067360a84e016aed43b407f1cfde87dadb7e485",
      },
      {
        path: "rl_agent_config.json",
        size: 473,
        sha256: "9a669a70961064c3c6cc76d2afb8bc5fb10dcd8349bb66e5f7b9b1afb74440d5",
      },
      {
        path: "tokenizer.json",
        size: 34363188,
        sha256: "609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f",
      },
    ],
  }),
];

export function getCatalogModel(id: string): ModelManifest | undefined {
  return CATALOG.find((m) => m.id === id);
}

// OCR 模型组：det+rec 必须成对加载。name 须与 tar 内 inference.yml 的 model_name 一致。
export interface OcrModelGroup {
  id: string;
  name: string;
  detId: string;
  recId: string;
  detName: string;
  recName: string;
}

// Kokoro v1 音色：lang 首字母即语言码（a=美式, b=英式, z=普通话），
// 中文音色的 g2p 由本项目 pinyin-pro 移植实现（官方 kokoro-js 未含中文）。
export interface KokoroVoice {
  id: string;
  name: string;
  lang: "a" | "b" | "z";
  gender: "f" | "m";
}

export const OCR_GROUPS: OcrModelGroup[] = [
  {
    id: "ppocr-v5-mobile",
    name: "PP-OCRv5 mobile (中英)",
    detId: "ppocr-v5-mobile-det",
    recId: "ppocr-v5-mobile-rec",
    detName: "PP-OCRv5_mobile_det",
    recName: "PP-OCRv5_mobile_rec",
  },
  {
    id: "ppocr-v6-tiny",
    name: "PP-OCRv6 tiny (中英日/法德西等 50 语言, 轻量快速)",
    detId: "ppocr-v6-tiny-det",
    recId: "ppocr-v6-tiny-rec",
    detName: "PP-OCRv6_tiny_det",
    recName: "PP-OCRv6_tiny_rec",
  },
  {
    id: "ppocr-v6-small",
    name: "PP-OCRv6 small (中英日/法德西等 50 语言)",
    detId: "ppocr-v6-small-det",
    recId: "ppocr-v6-small-rec",
    detName: "PP-OCRv6_small_det",
    recName: "PP-OCRv6_small_rec",
  },
  {
    id: "ppocr-v6-medium",
    name: "PP-OCRv6 medium (中英日/法德西等 50 语言)",
    detId: "ppocr-v6-medium-det",
    recId: "ppocr-v6-medium-rec",
    detName: "PP-OCRv6_medium_det",
    recName: "PP-OCRv6_medium_rec",
  },
];

/**
 * 获取模型或 OCR 组合的国际化显示名称
 */
export function getModelDisplayName(
  item: { id?: string; name?: string } | string | null | undefined,
  i18n?: (key: string, fallback?: string) => string
): string {
  if (!item) return "";
  const id = typeof item === "string" ? item : item.id;
  const rawName = typeof item === "object" ? item.name : undefined;
  const fallback = rawName || id || "";
  if (!id || !i18n) return fallback;

  if (id.startsWith("piper-")) {
    const voiceId = id.replace("piper-", "");
    return i18n("model_name_piper", `Piper ${voiceId}（英文，WASM）`).replace(
      "{0}",
      voiceId
    );
  }

  const i18nKey = `model_name_${id.replace(/[-.]/g, "_")}`;
  return i18n(i18nKey, fallback);
}
