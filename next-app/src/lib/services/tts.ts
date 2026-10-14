export class TtsService {
  private static synth: SpeechSynthesis | null =
    typeof window !== 'undefined' ? window.speechSynthesis : null;

  static isSpeaking: boolean = false;
  static currentSpeakingText: string | null = null;
  static autoSpeak: boolean = false;
  static pitch: number = 1.2;
  static rate: number = 1.05;

  static speak(rawText: string, onDone?: () => void): void {
    if (!this.synth || !rawText.trim()) return;

    if (this.isSpeaking && this.currentSpeakingText === rawText) {
      this.stop();
      return;
    }

    this.stop();

    const clean = this.cleanTextForSpeech(rawText);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.pitch = this.pitch;
    utterance.rate = this.rate;

    this.isSpeaking = true;
    this.currentSpeakingText = rawText;

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentSpeakingText = null;
      if (onDone) onDone();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.currentSpeakingText = null;
    };

    this.synth.speak(utterance);
  }

  static stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.currentSpeakingText = null;
  }

  static cleanTextForSpeech(input: string): string {
    let text = input;

    // Remove multiline code fences
    text = text.replace(/```[\w]*\n[\s\S]*?```/g, ' Code snippet provided in the chat. ');
    // Remove inline math
    text = text.replace(/\$\$[\s\S]*?\$\$/g, ' Mathematical formula shown in the chat. ');
    // Strip backticks
    text = text.replace(/`([^`]+)`/g, '$1');
    // Strip bold/italics
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    // Strip markdown headings & bullet lists
    text = text.replace(/#+\s*/g, '');
    text = text.replace(/^\s*[-*•]\s*/gm, '');
    // Strip emojis
    text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

    return text.replace(/\s+/g, ' ').trim();
  }
}
