/**
 * Browser-native Web Speech API utilities for DocuAI (STT & TTS)
 * Zero external paid API dependencies — uses native browser capabilities.
 */

/**
 * Strips markdown, citation tags, and code blocks to produce natural speech text.
 */
export function cleanTextForSpeech(markdown) {
  if (!markdown) return '';

  return markdown
    // Strip citation blocks e.g. [Document.pdf - Page 1, Chunk 0] or (From Doc.pdf, Page 1)
    .replace(/(\(|\[)\s*(?:from\s+)?[^()[\]\n]*(?:chunk|\.pdf|\.docx|\.pptx|\.txt)[^()[\]\n]*(\)|\])/gi, '')
    .replace(/(\(|\[)\s*(?:chunk\s*\d+|page\s*\d+)[^()[\]\n]*(\)|\])/gi, '')
    // Strip code blocks
    .replace(/```[\s\S]*?```/g, 'Code excerpt omitted.')
    .replace(/`([^`]+)`/g, '$1')
    // Strip markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Strip markdown bold/italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Strip markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Strip bullet points and list numbers
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Strip blockquotes
    .replace(/^\s*>\s+/gm, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if Speech Recognition is supported in the current browser.
 */
export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Checks if Text-to-Speech (speechSynthesis) is supported.
 */
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Selects the best available natural English voice.
 */
export function getBestEnglishVoice() {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Prefer natural / high quality English voices
  const preferredNames = ['Google US English', 'Samantha', 'Microsoft Jenny Online', 'Microsoft David', 'Karen', 'Daniel'];
  for (const name of preferredNames) {
    const found = voices.find((v) => v.name.includes(name));
    if (found) return found;
  }

  // Fallback to any en-US or English voice
  const enVoice = voices.find((v) => v.lang.startsWith('en'));
  return enVoice || voices[0];
}

/**
 * Stops any active speech synthesis immediately.
 */
export function stopSpeech() {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Speaks the provided text aloud using window.speechSynthesis.
 */
export function speakText(text, { onStart, onEnd, onError } = {}) {
  if (!isSpeechSynthesisSupported()) {
    if (onError) onError(new Error('Speech synthesis not supported in this browser.'));
    return null;
  }

  stopSpeech();

  const clean = cleanTextForSpeech(text);
  if (!clean) {
    if (onEnd) onEnd();
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = getBestEnglishVoice();
  if (voice) utterance.voice = voice;

  utterance.rate = 1.05; // natural speaking pace
  utterance.pitch = 1.0;

  if (onStart) utterance.onstart = onStart;
  if (onEnd) utterance.onend = onEnd;
  if (onError) {
    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        onError(e);
      } else if (onEnd) {
        onEnd();
      }
    };
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch (err) {
    if (onError) onError(err);
    return null;
  }
}

/**
 * In-Flow Streaming Speech Player:
 * Collects incoming streaming text chunks and speaks completed sentences sequentially
 * so audio plays in flow alongside the streaming answer.
 */
export class StreamingSpeechPlayer {
  constructor() {
    this.buffer = '';
    this.spokenLength = 0;
    this.queue = [];
    this.isPlaying = false;
    this.isDoneStreaming = false;
  }

  startNewMessage() {
    this.stop();
    this.spokenLength = 0;
    this.queue = [];
    this.isPlaying = false;
    this.isDoneStreaming = false;
  }

  pushChunk(fullStreamText) {
    if (!isSpeechSynthesisSupported()) return;

    // Get newly arrived text since last check
    const cleanFull = cleanTextForSpeech(fullStreamText);
    if (cleanFull.length <= this.spokenLength) return;

    const newText = cleanFull.slice(this.spokenLength);

    // Split on sentence boundaries: (. | ? | ! | newline) followed by space or end
    const sentenceRegex = /([.?!:]\s+|\n+)/;
    const parts = newText.split(sentenceRegex);

    if (parts.length > 2) {
      // We have one or more completed sentences
      let sentenceToSpeak = '';
      for (let i = 0; i < parts.length - 2; i += 2) {
        sentenceToSpeak += parts[i] + parts[i + 1];
      }

      if (sentenceToSpeak.trim().length >= 8) {
        this.spokenLength += sentenceToSpeak.length;
        this.queue.push(sentenceToSpeak.trim());
        this._playNext();
      }
    }
  }

  finish(fullStreamText) {
    if (!isSpeechSynthesisSupported()) return;
    this.isDoneStreaming = true;

    // Speak any remaining unuttered text
    const cleanFull = cleanTextForSpeech(fullStreamText);
    const remaining = cleanFull.slice(this.spokenLength).trim();

    if (remaining.length > 0) {
      this.spokenLength += remaining.length;
      this.queue.push(remaining);
      this._playNext();
    }
  }

  _playNext() {
    if (this.isPlaying || this.queue.length === 0) return;

    const textToPlay = this.queue.shift();
    if (!textToPlay) return;

    this.isPlaying = true;
    const utterance = new SpeechSynthesisUtterance(textToPlay);
    const voice = getBestEnglishVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;

    utterance.onend = () => {
      this.isPlaying = false;
      this._playNext();
    };

    utterance.onerror = () => {
      this.isPlaying = false;
      this._playNext();
    };

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      this.isPlaying = false;
    }
  }

  stop() {
    this.queue = [];
    this.isPlaying = false;
    this.isDoneStreaming = false;
    this.spokenLength = 0;
    stopSpeech();
  }
}

/**
 * Creates and manages a SpeechRecognition session.
 */
export function createSpeechRecognizer({ onInterim, onFinal, onError, onEnd, onStart }) {
  if (!isSpeechRecognitionSupported()) return null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = new SpeechRecognition();

  recognizer.continuous = true; // Keep listening continuously across pauses so user can think
  recognizer.interimResults = true; // Stream words in real-time as user speaks
  recognizer.lang = 'en-US';

  recognizer.onstart = () => {
    if (onStart) onStart();
  };

  recognizer.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = 0; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    if (onInterim) {
      onInterim(interimTranscript.trim(), finalTranscript.trim());
    }
    if (finalTranscript && onFinal) {
      onFinal(finalTranscript.trim());
    }
  };

  recognizer.onerror = (event) => {
    if (onError) onError(event);
  };

  recognizer.onend = () => {
    if (onEnd) onEnd();
  };

  return recognizer;
}
