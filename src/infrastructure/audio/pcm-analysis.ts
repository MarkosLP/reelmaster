/** PCM measurements only: low-energy windows are not a speech recognizer. */
export function analyzePcm16(wav: Buffer) {
  if (
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  )
    throw Error("Expected RIFF WAV");
  let channels = 0,
    sampleRate = 0,
    data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4),
      end = offset + 8 + size;
    if (end > wav.length) throw Error("Truncated WAV chunk");
    const kind = wav.toString("ascii", offset, offset + 4);
    if (kind === "fmt ") {
      if (
        size < 16 ||
        wav.readUInt16LE(offset + 8) !== 1 ||
        wav.readUInt16LE(offset + 22) !== 16
      )
        throw Error("Expected PCM16");
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (kind === "data") data = wav.subarray(offset + 8, end);
    offset = end + (size % 2);
  }
  if (
    !data ||
    ![1, 2].includes(channels) ||
    sampleRate < 8000 ||
    data.length % (2 * channels) !== 0 ||
    !data.length
  )
    throw Error("Invalid PCM data");
  const sampleFrames = data.length / (2 * channels),
    windowFrames = Math.round(sampleRate / 10);
  const db = (value: number) => (value > 0 ? 20 * Math.log10(value) : null);
  const channelStats = Array.from({ length: channels }, () => ({
    peak: 0,
    sum: 0,
    squares: 0,
    fullScaleSamples: 0,
  }));
  const windows: Array<{
    startSeconds: number;
    endSeconds: number;
    rmsDbfs: number | null;
    peakDbfs: number | null;
  }> = [];
  let cross = 0,
    energy = 0,
    peak = 0;
  for (let frame = 0; frame < sampleFrames; frame++) {
    let left = 0,
      right = 0;
    for (let channel = 0; channel < channels; channel++) {
      const raw = data.readInt16LE((frame * channels + channel) * 2),
        value = raw / 32768,
        stats = channelStats[channel];
      if (channel === 0) left = value;
      else right = value;
      stats.peak = Math.max(stats.peak, Math.abs(value));
      stats.sum += value;
      stats.squares += value * value;
      if (raw === 32767 || raw === -32768) stats.fullScaleSamples++;
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    if (channels === 2) cross += left * right;
    if ((frame + 1) % windowFrames === 0 || frame === sampleFrames - 1) {
      const start = Math.floor(frame / windowFrames) * windowFrames,
        count = frame - start + 1;
      windows.push({
        startSeconds: start / sampleRate,
        endSeconds: (frame + 1) / sampleRate,
        rmsDbfs: db(Math.sqrt(energy / (count * channels))),
        peakDbfs: db(peak),
      });
      energy = 0;
      peak = 0;
    }
  }
  const levels = windows.map((w) => w.rmsDbfs ?? -120).sort((a, b) => a - b);
  const percentile = (p: number) =>
    levels[Math.min(levels.length - 1, Math.floor((levels.length - 1) * p))];
  return {
    sampleRate,
    channels,
    sampleFrames,
    durationSeconds: sampleFrames / sampleRate,
    channelStats: channelStats.map((s) => ({
      peakDbfs: db(s.peak),
      rmsDbfs: db(Math.sqrt(s.squares / sampleFrames)),
      dcOffset: s.sum / sampleFrames,
      fullScaleSamples: s.fullScaleSamples,
    })),
    stereoCorrelation:
      channels === 2 && channelStats[0].squares * channelStats[1].squares > 0
        ? cross / Math.sqrt(channelStats[0].squares * channelStats[1].squares)
        : null,
    windowRmsDbfs: {
      p10: percentile(0.1),
      p50: percentile(0.5),
      p90: percentile(0.9),
      minimum: levels[0],
    },
    lowEnergySeconds: [-45, -40, -35, -30].map((threshold) => ({
      thresholdDbfs: threshold,
      seconds: windows
        .filter((w) => (w.rmsDbfs ?? -120) < threshold)
        .reduce((n, w) => n + w.endSeconds - w.startSeconds, 0),
    })),
    windows,
  };
}
