/** Bipe curto pelo Web Audio (não precisa de arquivo de som). */
export function beep(times = 2) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.3;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.start(t);
      o.stop(t + 0.2);
    }
    setTimeout(() => ctx.close(), times * 300 + 500);
  } catch {
    /* navegador sem áudio */
  }
}

export async function askNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export function notify(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch {
    /* ignore */
  }
}
