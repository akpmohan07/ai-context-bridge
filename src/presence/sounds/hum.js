// Three sine tones (110hz, 145hz, 180hz) stepping up, each fading in/out. Almost subliminal.
function humSound(ctx, volume) {
  const now = ctx.currentTime;
  const tones = [110, 145, 180];
  const oscillators = [];
  const gainNodes = [];

  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    // Stagger fade-ins so they step up gradually
    const fadeInStart = now + i * 0.35;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume * 0.07, fadeInStart + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);

    oscillators.push(osc);
    gainNodes.push(gain);
  });

  // Returns a stopper — called when REPLIED fires
  return () => {
    const t = ctx.currentTime;
    gainNodes.forEach(g => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.4);
    });
    setTimeout(() => oscillators.forEach(o => { try { o.stop(); } catch (_) {} }), 500);
  };
}

soundRegistry.register('hum', humSound);
