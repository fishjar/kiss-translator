// 增量式流式 SHA-256 与 CRC-32（零大块内存分配，支持 GB 级模型文件流式校验）

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256 {
  private h0 = 0x6a09e667;
  private h1 = 0xbb67ae85;
  private h2 = 0x3c6ef372;
  private h3 = 0xa54ff53a;
  private h4 = 0x510e527f;
  private h5 = 0x9b05688c;
  private h6 = 0x1f83d9ab;
  private h7 = 0x5be0cd19;

  private readonly block = new Uint8Array(64);
  private readonly view = new DataView(this.block.buffer);
  private readonly w = new Uint32Array(64);
  private blockLen = 0;
  private totalBytes = 0;

  update(data: Uint8Array): this {
    let offset = 0;
    const len = data.byteLength;
    this.totalBytes += len;

    if (this.blockLen > 0) {
      const take = Math.min(64 - this.blockLen, len);
      this.block.set(data.subarray(0, take), this.blockLen);
      this.blockLen += take;
      offset += take;
      if (this.blockLen === 64) {
        this.compress(this.view, 0);
        this.blockLen = 0;
      }
    }

    if (len - offset >= 64) {
      const directView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      while (len - offset >= 64) {
        this.compress(directView, offset);
        offset += 64;
      }
    }

    if (offset < len) {
      const rem = len - offset;
      this.block.set(data.subarray(offset), 0);
      this.blockLen = rem;
    }

    return this;
  }

  digestHex(): string {
    this.block[this.blockLen++] = 0x80;
    if (this.blockLen > 56) {
      this.block.fill(0, this.blockLen, 64);
      this.compress(this.view, 0);
      this.blockLen = 0;
    }
    this.block.fill(0, this.blockLen, 56);

    const totalBits = this.totalBytes * 8;
    const hi = Math.floor(totalBits / 0x100000000);
    const lo = totalBits >>> 0;
    this.view.setUint32(56, hi, false);
    this.view.setUint32(60, lo, false);
    this.compress(this.view, 0);

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    outView.setUint32(0, this.h0, false);
    outView.setUint32(4, this.h1, false);
    outView.setUint32(8, this.h2, false);
    outView.setUint32(12, this.h3, false);
    outView.setUint32(16, this.h4, false);
    outView.setUint32(20, this.h5, false);
    outView.setUint32(24, this.h6, false);
    outView.setUint32(28, this.h7, false);

    return Array.from(out)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private compress(view: DataView, byteOffset: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(byteOffset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const v0 = w[i - 15]!;
      const s0 = ((v0 >>> 7) | (v0 << 25)) ^ ((v0 >>> 18) | (v0 << 14)) ^ (v0 >>> 3);
      const v1 = w[i - 2]!;
      const s1 = ((v1 >>> 17) | (v1 << 15)) ^ ((v1 >>> 19) | (v1 << 13)) ^ (v1 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = this.h0;
    let b = this.h1;
    let c = this.h2;
    let d = this.h3;
    let e = this.h4;
    let f = this.h5;
    let g = this.h6;
    let h = this.h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    this.h0 = (this.h0 + a) | 0;
    this.h1 = (this.h1 + b) | 0;
    this.h2 = (this.h2 + c) | 0;
    this.h3 = (this.h3 + d) | 0;
    this.h4 = (this.h4 + e) | 0;
    this.h5 = (this.h5 + f) | 0;
    this.h6 = (this.h6 + g) | 0;
    this.h7 = (this.h7 + h) | 0;
  }
}

export async function sha256Stream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const reader = stream.getReader();
  const hasher = new Sha256();
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        hasher.update(value);
      }
    }
    return hasher.digestHex();
  } finally {
    reader.releaseLock();
  }
}

export async function sha256Blob(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (typeof blob.stream === "function") {
    return sha256Stream(blob.stream(), signal);
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const buf = await blob.arrayBuffer();
  return new Sha256().update(new Uint8Array(buf)).digestHex();
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32Update(crc: number, chunk: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < chunk.byteLength; i++) {
    c = CRC32_TABLE[(c ^ chunk[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export async function crc32Blob(blob: Blob): Promise<number> {
  if (typeof blob.stream === "function") {
    const reader = blob.stream().getReader();
    let crc = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          crc = crc32Update(crc, value);
        }
      }
      return crc;
    } finally {
      reader.releaseLock();
    }
  }
  const buf = await blob.arrayBuffer();
  return crc32Update(0, new Uint8Array(buf));
}
