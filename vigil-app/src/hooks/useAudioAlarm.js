import { useCallback } from 'react';

// Web Audio API — emergency alarm chime
export function useAudioAlarm() {
  const playAlarm = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, startTime, duration, type = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      // Three-tone emergency chime
      playTone(880, now,        0.18, 'square');
      playTone(1046, now + 0.22, 0.18, 'square');
      playTone(880,  now + 0.44, 0.18, 'square');
      playTone(1046, now + 0.66, 0.28, 'square');
      // Repeat
      playTone(880,  now + 1.1, 0.18, 'square');
      playTone(1046, now + 1.32, 0.18, 'square');
      playTone(1318, now + 1.54, 0.35, 'square');
    } catch (e) {
      console.warn('Audio alarm failed:', e);
    }
  }, []);

  return { playAlarm };
}
