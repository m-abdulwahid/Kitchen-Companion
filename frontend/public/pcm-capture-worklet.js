/* Converts microphone Float32 samples to 24 kHz mono PCM16 for the live relay. */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = new Float32Array(0);
    this.position = 0;
    this.output = [];
    this.targetRate = 24000;
    this.chunkSamples = 2400; // 100 ms at 24 kHz
    // The browser noise-suppression constraint is helpful but device-specific.
    // Require two 100 ms voice-level chunks before audio can reach Realtime, so
    // a short knock, footsteps, or a pan clatter cannot interrupt Ella. Keep
    // 300 ms of pre-roll and a one-second hangover so normal speech stays whole.
    this.voiceEnergyThreshold = 0.018;
    this.activationChunks = 2;
    this.preRollChunks = 3;
    this.hangoverChunks = 10;
    this.loudChunkCount = 0;
    this.activeChunkCount = 0;
    this.preRoll = [];
  }

  energy(samples) {
    let total = 0;
    for (let index = 0; index < samples.length; index += 1) total += samples[index] ** 2;
    return Math.sqrt(total / samples.length);
  }

  postChunk(buffer) {
    this.port.postMessage(buffer, [buffer]);
  }

  gateChunk(samples, buffer) {
    const isVoiceLevel = this.energy(samples) >= this.voiceEnergyThreshold;
    if (this.activeChunkCount > 0) {
      this.postChunk(buffer);
      this.activeChunkCount = isVoiceLevel ? this.hangoverChunks : this.activeChunkCount - 1;
      return;
    }

    this.preRoll.push(buffer);
    if (this.preRoll.length > this.preRollChunks) this.preRoll.shift();
    this.loudChunkCount = isVoiceLevel ? this.loudChunkCount + 1 : 0;
    if (this.loudChunkCount < this.activationChunks) return;

    for (const queued of this.preRoll) this.postChunk(queued);
    this.preRoll = [];
    this.loudChunkCount = 0;
    this.activeChunkCount = this.hangoverChunks;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    const merged = new Float32Array(this.pending.length + input.length);
    merged.set(this.pending);
    merged.set(input, this.pending.length);

    const sourcePerTarget = sampleRate / this.targetRate;
    while (this.position + 1 < merged.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      this.output.push(merged[index] * (1 - fraction) + merged[index + 1] * fraction);
      this.position += sourcePerTarget;
    }

    const consumed = Math.floor(this.position);
    this.pending = merged.slice(consumed);
    this.position -= consumed;

    while (this.output.length >= this.chunkSamples) {
      const samples = this.output.splice(0, this.chunkSamples);
      const pcm = new Int16Array(samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        const value = Math.max(-1, Math.min(1, samples[index]));
        pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
      }
      this.gateChunk(samples, pcm.buffer);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
