// Sine wave 320hz → 190hz with filtered noise underneath. Gentle exhale.
function breathSound(ctx, volume) {
  const now = ctx.currentTime;
  const duration = 0.5;

  // Pitched sine dropping in frequency — the "exhale" body
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(190, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0, now);
  oscGain.gain.linearRampToValueAtTime(volume * 0.28, now + 0.06);
  oscGain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);

  // Filtered noise underneath — the breath texture
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * t), 1.5);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.7;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(volume * 0.12, now + 0.06);
  noiseGain.gain.linearRampToValueAtTime(0, now + duration);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
}

soundRegistry.register('breath', breathSound);
