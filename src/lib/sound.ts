export class SoundManager {
  private audioContext: AudioContext | null = null;
  private sfxVolume = 0.7;
  private musicVolume = 0.5;
  private enabled = true;
  private audioFiles: Map<string, HTMLAudioElement> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    this.audioFiles.forEach((audio, name) => {
      if (name.startsWith('music_')) {
        audio.volume = this.musicVolume;
      }
    });
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  private async ensureAudioContext() {
    if (!this.audioContext) return false;
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return true;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (!this.enabled || !this.audioContext) return;
    
    this.ensureAudioContext().then((ready) => {
      if (!ready || !this.audioContext) return;

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      
      const finalVolume = volume * this.sfxVolume;
      gainNode.gain.setValueAtTime(finalVolume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    });
  }

  private playNoise(duration: number, volume: number = 0.2) {
    if (!this.enabled || !this.audioContext) return;
    
    this.ensureAudioContext().then((ready) => {
      if (!ready || !this.audioContext) return;

      const bufferSize = this.audioContext.sampleRate * duration;
      const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();
      
      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      gainNode.gain.setValueAtTime(volume * this.sfxVolume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      
      source.start(this.audioContext.currentTime);
    });
  }

  playUnitSelect() {
    this.playTone(800, 0.05, 'sine', 0.15);
  }

  playUnitDeselect() {
    this.playTone(400, 0.05, 'sine', 0.1);
  }

  playUnitMove() {
    this.playTone(600, 0.08, 'sine', 0.12);
  }

  playUnitTrain() {
    this.playTone(440, 0.15, 'square', 0.2);
    setTimeout(() => this.playTone(880, 0.1, 'square', 0.15), 80);
  }

  playUnitDeath() {
    this.playTone(200, 0.3, 'sawtooth', 0.25);
  }

  playBaseDamage() {
    this.playTone(150, 0.2, 'triangle', 0.3);
  }

  playBaseDestroyed() {
    this.playNoise(0.5, 0.4);
    setTimeout(() => this.playTone(100, 0.8, 'sawtooth', 0.3), 100);
  }

  playLaserFire() {
    if (!this.enabled || !this.audioContext) return;
    
    this.ensureAudioContext().then((ready) => {
      if (!ready || !this.audioContext) return;

      const oscillator = this.audioContext!.createOscillator();
      const gainNode = this.audioContext!.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext!.destination);
      
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(1000, this.audioContext!.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext!.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.3 * this.sfxVolume, this.audioContext!.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext!.currentTime + 0.3);
      
      oscillator.start(this.audioContext!.currentTime);
      oscillator.stop(this.audioContext!.currentTime + 0.3);
    });
  }

  playAbility() {
    this.playTone(1200, 0.12, 'sine', 0.2);
    setTimeout(() => this.playTone(1600, 0.08, 'sine', 0.15), 60);
  }

  playAttack() {
    this.playTone(500, 0.06, 'square', 0.15);
  }

  playVictory() {
    this.playTone(523, 0.2, 'sine', 0.25);
    setTimeout(() => this.playTone(659, 0.2, 'sine', 0.25), 200);
    setTimeout(() => this.playTone(784, 0.3, 'sine', 0.25), 400);
  }

  playDefeat() {
    this.playTone(400, 0.2, 'sine', 0.25);
    setTimeout(() => this.playTone(350, 0.2, 'sine', 0.25), 200);
    setTimeout(() => this.playTone(300, 0.4, 'sine', 0.25), 400);
  }

  playButtonClick() {
    this.playTone(1000, 0.05, 'sine', 0.15);
  }

  playCountdown() {
    this.playTone(880, 0.1, 'square', 0.2);
  }

  playMatchStart() {
    this.playTone(1046, 0.15, 'sine', 0.3);
    setTimeout(() => this.playTone(1318, 0.2, 'sine', 0.3), 100);
  }

  playIncomeTick() {
    this.playTone(1500, 0.03, 'sine', 0.08);
  }

  playError() {
    this.playTone(200, 0.15, 'square', 0.25);
    setTimeout(() => this.playTone(150, 0.2, 'square', 0.2), 100);
  }

  loadAudioFile(name: string, url: string) {
    const audio = new Audio(url);
    const isMusic = name.startsWith('music_');
    audio.volume = isMusic ? this.musicVolume : this.sfxVolume;
    this.audioFiles.set(name, audio);
  }

  playAudioFile(name: string) {
    if (!this.enabled) return;
    
    const audio = this.audioFiles.get(name);
    if (audio) {
      audio.currentTime = 0;
      const isMusic = name.startsWith('music_');
      audio.volume = isMusic ? this.musicVolume : this.sfxVolume;
      audio.play().catch(() => {});
    }
  }

  stopAudioFile(name: string) {
    const audio = this.audioFiles.get(name);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
}

export const soundManager = new SoundManager();
