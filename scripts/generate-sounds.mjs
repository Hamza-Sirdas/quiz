import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'public', 'sounds');

fs.mkdirSync(outDir, { recursive: true });

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // Byte rate
  buffer.writeUInt16LE(2, 32); // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(path.join(outDir, filename), buffer);
}

function envelope(t, duration, attack = 0.008, release = 0.04) {
  if (t < 0 || t > duration) return 0;
  if (t < attack) return t / Math.max(attack, 0.0001);
  if (t > duration - release) {
    return Math.max(0, (duration - t) / Math.max(release, 0.0001));
  }
  const decayProgress = (t - attack) / Math.max(duration - attack - release, 0.0001);
  return 1 - decayProgress * 0.25;
}

function renderSequence(totalDurationSec, notes) {
  const totalSamples = Math.floor(SAMPLE_RATE * totalDurationSec);
  const buffer = new Float32Array(totalSamples);

  for (const note of notes) {
    const {
      startSec,
      durationSec,
      freqStart,
      freqEnd = freqStart,
      gain = 0.28,
      harmonic = 0.16,
      attack = 0.008,
      release = Math.min(0.06, durationSec * 0.55),
    } = note;

    const startIdx = Math.floor(startSec * SAMPLE_RATE);
    const len = Math.floor(durationSec * SAMPLE_RATE);
    let phase = 0;

    for (let i = 0; i < len && startIdx + i < totalSamples; i += 1) {
      const t = i / SAMPLE_RATE;
      const ratio = i / Math.max(len - 1, 1);
      const freq = freqStart + (freqEnd - freqStart) * ratio;
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;

      const env = envelope(t, durationSec, attack, release);
      const tone =
        Math.sin(phase) +
        harmonic * Math.sin(phase * 2) +
        harmonic * 0.35 * Math.sin(phase * 3);

      buffer[startIdx + i] += (tone / (1 + harmonic * 1.35)) * env * gain;
    }
  }

  // Yumuşak tepe sınırlama (~0.35 pik hedefi)
  let maxAbs = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const targetPeak = 0.35;
  if (maxAbs > targetPeak && maxAbs > 0) {
    const scale = targetPeak / maxAbs;
    for (let i = 0; i < totalSamples; i += 1) {
      buffer[i] *= scale;
    }
  }

  return buffer;
}

// 1. game-start.wav: Sıcak yükselen C5-E5-G5 akoru (~0.45s)
writeWav(
  'game-start.wav',
  renderSequence(0.45, [
    { startSec: 0.0, durationSec: 0.16, freqStart: 523.25, gain: 0.26, harmonic: 0.14 },
    { startSec: 0.1, durationSec: 0.18, freqStart: 659.25, gain: 0.28, harmonic: 0.14 },
    { startSec: 0.2, durationSec: 0.24, freqStart: 783.99, gain: 0.32, harmonic: 0.12 },
  ]),
);

// 2. countdown-tick.wav: Yumuşak marimba / ahşap tık (~0.12s)
writeWav(
  'countdown-tick.wav',
  renderSequence(0.12, [
    {
      startSec: 0.0,
      durationSec: 0.11,
      freqStart: 680,
      freqEnd: 590,
      gain: 0.3,
      harmonic: 0.08,
      attack: 0.004,
      release: 0.075,
    },
  ]),
);

// 3. answer-select.wav: Hafif dokunsal UI tıklaması (~0.09s)
writeWav(
  'answer-select.wav',
  renderSequence(0.09, [
    {
      startSec: 0.0,
      durationSec: 0.085,
      freqStart: 560,
      freqEnd: 740,
      gain: 0.26,
      harmonic: 0.06,
      attack: 0.003,
      release: 0.05,
    },
  ]),
);

// 4. correct.wav: Hoş majör zili (E5-G#5-B5, ~0.38s)
writeWav(
  'correct.wav',
  renderSequence(0.38, [
    { startSec: 0.0, durationSec: 0.15, freqStart: 659.25, gain: 0.26, harmonic: 0.12 },
    { startSec: 0.08, durationSec: 0.17, freqStart: 830.61, gain: 0.28, harmonic: 0.1 },
    { startSec: 0.16, durationSec: 0.21, freqStart: 987.77, gain: 0.3, harmonic: 0.08 },
  ]),
);

// 5. wrong.wav: Rahatsız etmeyen yumuşak alçak çift ton (~0.30s)
writeWav(
  'wrong.wav',
  renderSequence(0.3, [
    {
      startSec: 0.0,
      durationSec: 0.13,
      freqStart: 311.13,
      freqEnd: 293.66,
      gain: 0.26,
      harmonic: 0.06,
      attack: 0.008,
      release: 0.06,
    },
    {
      startSec: 0.11,
      durationSec: 0.18,
      freqStart: 246.94,
      freqEnd: 233.08,
      gain: 0.25,
      harmonic: 0.05,
      attack: 0.008,
      release: 0.09,
    },
  ]),
);

// 6. score-gain.wav: Hafif yükselen arpej (~0.32s)
writeWav(
  'score-gain.wav',
  renderSequence(0.32, [
    { startSec: 0.0, durationSec: 0.11, freqStart: 587.33, gain: 0.22, harmonic: 0.1 },
    { startSec: 0.07, durationSec: 0.11, freqStart: 783.99, gain: 0.24, harmonic: 0.1 },
    { startSec: 0.14, durationSec: 0.17, freqStart: 1046.5, gain: 0.28, harmonic: 0.08 },
  ]),
);

// 7. question-end.wav: Temiz nötr çift gong uyarısı (~0.28s)
writeWav(
  'question-end.wav',
  renderSequence(0.28, [
    { startSec: 0.0, durationSec: 0.13, freqStart: 587.33, gain: 0.24, harmonic: 0.08 },
    { startSec: 0.11, durationSec: 0.16, freqStart: 440.0, gain: 0.26, harmonic: 0.08 },
  ]),
);

// 8. podium-celebration.wav: Kısa zarif final kadansı (C5-E5-G5-C6, ~1.1s)
writeWav(
  'podium-celebration.wav',
  renderSequence(1.1, [
    { startSec: 0.0, durationSec: 0.2, freqStart: 523.25, gain: 0.24, harmonic: 0.14 },
    { startSec: 0.14, durationSec: 0.2, freqStart: 659.25, gain: 0.25, harmonic: 0.14 },
    { startSec: 0.28, durationSec: 0.22, freqStart: 783.99, gain: 0.27, harmonic: 0.12 },
    { startSec: 0.42, durationSec: 0.65, freqStart: 1046.5, gain: 0.3, harmonic: 0.1, release: 0.35 },
    { startSec: 0.44, durationSec: 0.63, freqStart: 523.25, gain: 0.18, harmonic: 0.08, release: 0.35 },
    { startSec: 0.46, durationSec: 0.61, freqStart: 783.99, gain: 0.16, harmonic: 0.06, release: 0.35 },
  ]),
);

console.log('Generated 8 WAV files in', outDir);
