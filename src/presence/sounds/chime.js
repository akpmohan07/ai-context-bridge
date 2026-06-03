// Two notes in sequence: 440hz then 554hz. A minor lift. "Here you go."
function chimeSound(ctx, volume) {
  const notes = [
    { freq: 440, delay: 0 },    // A4
    { freq: 554, delay: 0.2 },  // C#5
  ];

  notes.forEach(({ freq, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume * 0.38, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.6);
  });
}

soundRegistry.register('chime', chimeSound);
