class AuctionSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0,
    endFreq?: number,
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playBid(): void {
    this.tone(660, 0.09, 'triangle', 0.14, 0, 880);
  }

  public playTick(urgent = false): void {
    this.tone(urgent ? 980 : 720, 0.055, 'sine', urgent ? 0.11 : 0.07);
  }

  public playSold(): void {
    // Gavel double-knock + celebratory triad
    this.tone(180, 0.08, 'square', 0.14, 0, 95);
    this.tone(523.25, 0.16, 'triangle', 0.14, 0.08);
    this.tone(659.25, 0.18, 'triangle', 0.14, 0.18);
    this.tone(783.99, 0.28, 'triangle', 0.16, 0.28);
  }

  public playUnsold(): void {
    this.tone(320, 0.16, 'sawtooth', 0.08, 0, 220);
    this.tone(210, 0.22, 'sawtooth', 0.07, 0.16, 165);
  }

  public playError(): void {
    this.tone(240, 0.12, 'sawtooth', 0.09, 0, 180);
  }
}

export const soundEngine = new AuctionSoundEngine();
