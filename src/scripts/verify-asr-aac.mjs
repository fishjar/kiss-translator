import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))(
  "esbuild"
);
const fixture = (await readFile("src/subtitle/asr/fixtures/tone.m4a")).toString(
  "base64"
);
await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import { IncrementalAacDecoder } from './src/subtitle/asr/aacDecoder.js';
    import { AsrPcmPipeline } from './src/subtitle/asr/pcmPipeline.js';
    import { asrWav } from './src/subtitle/asr/audioChunks.js';
    window.__kissAacGate = async () => {
      const bytes = Uint8Array.from(atob('${fixture}'), c => c.charCodeAt(0));
      const output = []; let firstOutputAt, fed = 0, energy = 0, values = 0;
      const chunks = []; let firstChunkAt;
      const pipeline = new AsrPcmPipeline(1, async chunk => {
        firstChunkAt ??= fed;
        const bytes = new DataView(await asrWav(chunk.audio).arrayBuffer());
        chunks.push({ start:chunk.startSample, end:chunk.endSample, rate:bytes.getUint32(24,true), length:bytes.getUint32(40,true)/2 });
      });
      const decoder = new IncrementalAacDecoder(async frame => {
        firstOutputAt ??= fed;
        output.push({ time: frame.timestamp, size: frame.channels[0].length, rate: frame.sampleRate });
        for(const sample of frame.channels[0]) { energy += sample * sample; values++; }
        await pipeline.push(frame);
      });
      try {
        for(let i=0; i<bytes.length; i+=1024) {
          const part = bytes.subarray(i,i+1024); fed += part.length;
          await decoder.append(part);
        }
        await decoder.finish();
        await pipeline.finish();
        const context = new AudioContext();
        let reference;
        try { reference = (await context.decodeAudioData(bytes.slice().buffer)).duration; }
        finally { await context.close(); }
        const duration = output.reduce((total, frame) => total + frame.size / frame.rate, 0);
        const result = { frames: output.length, duration, reference, firstOutputAt, firstChunkAt, chunks, bytes: bytes.length, progressive: firstOutputAt < bytes.length && firstChunkAt < bytes.length, rms: Math.sqrt(energy/values), durationErrorMs: Math.abs(duration-reference)*1000, closed: decoder.closed };
        if(!result.progressive || result.durationErrorMs > 100 || result.rms < 0.01) throw Error(JSON.stringify(result));
        return result;
      } finally { decoder.close(); }
    };`,
  },
  bundle: true,
  format: "iife",
  outfile: "tmp/asr-incremental-browser-gate.js",
});
