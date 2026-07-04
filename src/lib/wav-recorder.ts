// Simple mic → WAV recorder using Web Audio API.
// Produces a decodable 16-bit mono WAV (16 kHz) that any STT provider accepts.

export class WavRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    this.sampleRate = this.ctx.sampleRate;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessorNode is deprecated but universally supported and simple.
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  async stop(): Promise<Blob> {
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      const total = this.chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of this.chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      // Downsample to 16 kHz for lighter uploads.
      const targetRate = 16000;
      const downsampled = downsample(merged, this.sampleRate, targetRate);
      const wav = encodeWav(downsampled, targetRate);
      return new Blob([wav], { type: "audio/wav" });
    } finally {
      if (this.ctx && this.ctx.state !== "closed") {
        await this.ctx.close().catch(() => {});
      }
      this.ctx = null;
      this.stream = null;
      this.source = null;
      this.processor = null;
      this.chunks = [];
    }
  }

  cancel(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.chunks = [];
  }
}

function downsample(buffer: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return buffer;
  const ratio = from / to;
  const outLen = Math.floor(buffer.length / ratio);
  const out = new Float32Array(outLen);
  let pos = 0;
  let i = 0;
  while (pos < outLen) {
    const next = Math.floor((pos + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (; i < next && i < buffer.length; i++) {
      sum += buffer[i];
      count++;
    }
    out[pos] = count > 0 ? sum / count : 0;
    pos++;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
