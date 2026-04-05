/**
 * Soviet-style Telephone Sound Synthesizer using Web Audio API.
 * Simulates mechanical bells (incoming) and standard CNS call-progress tones (outgoing).
 */
class TelephonyAudio {
  constructor() {
    this.ctx = null;
    this.oscIncoming = null;
    this.oscOutgoing = null;
    this.gainNode = null;
    this.isIncomingRunning = false;
    this.isOutgoingRunning = false;
    this.onStateChange = null;
  }

  // Initialize context on first user interaction
  async init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.onstatechange = () => {
        if (this.onStateChange) this.onStateChange(this.ctx.state);
      };
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('>>> [AUDIO] Resume failed (no user gesture?):', e);
      }
    }
    return this.ctx.state;
  }

  getState() {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  // Plays the "Mechanical Bell" (Incoming Call)
  // Rhythm: 1s ring, 4s pause
  startRingtone() {
    if (this.isIncomingRunning) return;
    this.init();
    this.isIncomingRunning = true;

    const playCycle = () => {
      if (!this.isIncomingRunning) return;

      const now = this.ctx.currentTime;
      const duration = 1.0; // 1s ring
      
      // Create a "Chime" effect using multiple oscillators
      const frequencies = [425, 850, 1275]; // Harmonics
      const oscillators = frequencies.map(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square'; // Metallic buzz
        osc.frequency.setValueAtTime(freq, now);
        
        // Fast "shiver" modulation to simulate the mechanical clapper
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(25, now); // 25Hz vibration
        lfoGain.gain.setValueAtTime(0.5, now);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain); // Connect to the main gain node's gain parameter
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2 / frequencies.length, now + 0.02);
        gain.gain.setValueAtTime(0.2 / frequencies.length, now + duration - 0.05);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        lfo.start(now);
        lfo.stop(now + duration);
        osc.start(now);
        osc.stop(now + duration);
        return { osc, lfo };
      });

      // Repeat after 4 seconds of silence (total cycle 5s)
      this.timerIncoming = setTimeout(playCycle, 5000);
    };

    playCycle();
  }

  stopRingtone() {
    this.isIncomingRunning = false;
    if (this.timerIncoming) clearTimeout(this.timerIncoming);
  }

  // Plays the "Ringback Beep" (Outgoing Call)
  // Rhythm: 425Hz, 1s on, 4s off
  startRingback() {
    if (this.isOutgoingRunning) return;
    this.init();
    this.isOutgoingRunning = true;

    const playCycle = () => {
      if (!this.isOutgoingRunning) return;
      
      const now = this.ctx.currentTime;
      const duration = 1.0;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, now);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
      gain.gain.setValueAtTime(0.1, now + duration - 0.1);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + duration);

      this.timerOutgoing = setTimeout(playCycle, 5000);
    };

    playCycle();
  }

  stopRingback() {
    this.isOutgoingRunning = false;
    if (this.timerOutgoing) clearTimeout(this.timerOutgoing);
  }

  // Synthetic Handset Click
  playClick() {
    this.init();
    const now = this.ctx.currentTime;
    
    // Thump (low frequency pulse)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
    
    // Noise burst (the "crack")
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start(now);
    noise.stop(now + 0.05);
  }

  stopAll() {
    this.stopRingtone();
    this.stopRingback();
  }
}

export default new TelephonyAudio();
