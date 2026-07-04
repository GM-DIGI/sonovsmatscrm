// Simple mic → WAV recorder using Web Audio API.
// Produces a decodable 16-bit mono WAV (16 kHz) that any STT provider accepts.

export class WavRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private peak = 0;
  onLevel?: (level: number) => void;

  async start(): Promise<void> {
    // Enable AGC so quiet built-in mics get boosted; keep NS/EC off so speech
    // isn't zeroed out. If getUserMedia rejects these constraints, retry bare.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
    this.sampleRate = this.ctx.sampleRate;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    // Sink to destination via gain=0 so the mic is NOT played back through speakers
    // (avoids feedback) while still driving the ScriptProcessor.
    this.silentGain = this.ctx.createGain();
    this.silentGain.gain.value = 0;
    this.chunks = [];
    this.peak = 0;
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
      let localPeak = 0;
      for (let i = 0; i < input.length; i++) {
        const v = Math.abs(input[i]);
        if (v > localPeak) localPeak = v;
      }
      if (localPeak > this.peak) this.peak = localPeak;
      this.onLevel?.(localPeak);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.ctx.destination);
  }

  getPeak(): number {
    return this.peak;
  }

  async stop(): Promise<Blob> {
    try {
      this.processor?.disconnect();
      this.silentGain?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      const total = this.chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of this.chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      // Downsample to 16 kHz for lighter uploads, then normalize quiet mics.
      const targetRate = 16000;
      const downsampled = downsample(merged, this.sampleRate, targetRate);
      const normalized = normalizeSpeech(downsampled);
      const wav = encodeWav(normalized, targetRate);
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

function normalizeSpeech(samples: Float32Array): Float32Array {
  if (samples.length === 0) return samples;

  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const dcOffset = sum / samples.length;

  let peak = 0;
  const centered = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] - dcOffset;
    centered[i] = value;
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
  }

  // Very quiet laptop/phone mics often produce valid WAV files that the STT
  // model treats as silence. Boost real but low speech before upload.
  if (peak < 0.0005) return centered;
  const gain = Math.min(40, 0.85 / peak);
  if (gain <= 1.05) return centered;

  const boosted = new Float32Array(centered.length);
  for (let i = 0; i < centered.length; i++) {
    boosted[i] = Math.max(-1, Math.min(1, centered[i] * gain));
  }
  return boosted;
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
