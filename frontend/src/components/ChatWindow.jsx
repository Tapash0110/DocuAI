import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  SlidersHorizontal,
  UploadCloud,
  Paperclip,
  FileText,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Square,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Clock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SourceCard from './SourceCard';
import OtherFormatsModal from './OtherFormatsModal';
import {
  speakText,
  stopSpeech,
  cleanTextForSpeech,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  createSpeechRecognizer,
  StreamingSpeechPlayer,
} from '../utils/speech';

export function formatLatency(ms) {
  if (ms == null || isNaN(ms)) return null;
  const num = Number(ms);
  if (num <= 0) return null;
  if (num < 1000) return `${Math.round(num)}ms`;
  return `${(num / 1000).toFixed(1)}s`;
}

export function isNotFoundMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return (
    lower.includes("couldn't find that in the document") ||
    lower.includes("could not find that in the document") ||
    lower.includes("not found in the document") ||
    lower.includes("please clarify your question") ||
    lower.includes("not sure what you're asking")
  );
}

export function cleanMessageContent(text) {
  if (!text) return '';
  // Strip e.g. [Paytm Challenge 2026.pdf - Page 1, Chunk 0] or (From Document.pdf, Page 1, Chunk 0)
  return text
    .replace(/\s*(\(|\[)\s*(?:from\s+)?[^()[\]\n]*(?:chunk|\.pdf)[^()[\]\n]*(\)|\])/gi, '')
    .replace(/\s*(\(|\[)\s*(?:chunk\s*\d+|page\s*\d+)[^()[\]\n]*(\)|\])/gi, '')
    .trim();
}

function AssistantMessageBubble({ msg, onSendMessage, isLast }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopy = () => {
    const text = cleanMessageContent(msg.content);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rawCleanText = cleanMessageContent(msg.content);
  const isNotFound = isNotFoundMessage(rawCleanText);
  const cleanText = isNotFound ? "**I couldn't find that in the document.**" : rawCleanText;
  const formattedLatency = formatLatency(msg.latency_ms);

  const handleToggleSpeak = () => {
    if (isSpeaking) {
      stopSpeech();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(cleanText, {
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  const followUpSuggestions = [
    'Tell me more details about this',
    'Summarize this into bullet points',
    'What are the key numbers or dates?',
  ];

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex gap-3 text-xs sm:text-sm justify-start group">
        <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs border border-zinc-800 dark:border-zinc-200 font-bold">
          <Bot className="w-4 h-4" />
        </div>

        <div className="max-w-[90%] sm:max-w-[85%] rounded-2xl px-5 py-4 shadow-sm bg-white dark:bg-[#161619] border border-zinc-200 dark:border-zinc-750 text-zinc-900 dark:text-zinc-100 transition-all">
          {/* Live Search Status (ChatGPT style) */}
          {msg.searchStatus && !cleanText && (
            <div className="flex items-center gap-2 py-0.5 px-0.5 text-xs text-zinc-700 dark:text-zinc-200">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold animate-pulse text-zinc-800 dark:text-zinc-200">{msg.searchStatus}</span>
            </div>
          )}

          {/* Formatted Markdown Content */}
          {cleanText && (
            <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed break-words font-sans">
              <ReactMarkdown>{cleanText}</ReactMarkdown>
            </div>
          )}

          {msg.isStreaming && cleanText && (
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-500 animate-pulse align-middle rounded-xs" />
          )}

          {/* Citations / Sources (hidden completely if answer is not in document) */}
          {!isNotFound && msg.sources && msg.sources.length > 0 && (
            <SourceCard sources={msg.sources} />
          )}

          {/* Bottom Action Bar for Assistant Message */}
          {!msg.isStreaming && cleanText && (
            <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-zinc-200 dark:border-zinc-800 text-zinc-500">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition cursor-pointer"
                  title="Copy answer text"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {/* Read Aloud with Browser-native TTS */}
                <button
                  type="button"
                  onClick={handleToggleSpeak}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    isSpeaking
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white'
                  }`}
                  title={isSpeaking ? 'Stop speaking' : 'Read answer aloud with Text-to-Speech'}
                >
                  {isSpeaking ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Read Aloud</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setFeedback(feedback === 'like' ? null : 'like')}
                  className={`p-1.5 rounded-md text-xs transition cursor-pointer ${
                    feedback === 'like'
                      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 font-semibold'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                  title="Helpful response"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setFeedback(feedback === 'dislike' ? null : 'dislike')}
                  className={`p-1.5 rounded-md text-xs transition cursor-pointer ${
                    feedback === 'dislike'
                      ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 font-semibold'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                  title="Not helpful"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Response Stats: Verified Sources and Response Time Badge */}
              <div className="flex items-center gap-2">
                {!isNotFound && msg.sources && msg.sources.length > 0 && (
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-semibold">
                    {msg.sources.length} {msg.sources.length === 1 ? 'verified source' : 'verified sources'}
                  </span>
                )}
                {formattedLatency && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60 shadow-2xs"
                    title={`Response generated in ${formattedLatency}`}
                  >
                    <Clock className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                    <span>{formattedLatency}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Quick Follow-up Chips for the Latest Assistant Message (only when grounded answer exists) */}
      {isLast && !msg.isStreaming && cleanText && !isNotFound && onSendMessage && (
        <div className="pl-10 flex items-center gap-1.5 flex-wrap pt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mr-0.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Quick follow-up:
          </span>
          {followUpSuggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSendMessage(suggestion)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>{suggestion}</span>
              <ArrowRight className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STARTER_QUESTIONS_SINGLE = [
  'What is the document about?',
  'Summarize the document',
  'What is the main objective of the document?',
];

const STARTER_QUESTIONS_MULTI = [
  'What are these documents about?',
  'Summarize all attached documents',
  'Compare the main objectives across the documents',
];

export default function ChatWindow({
  messages = [],
  isLoading,
  onSendMessage,
  activeDocs = [],
  topK,
  setTopK,
  onUpload,
  onUploadText,
  isUploading,
  onStopGeneration,
}) {
  const [input, setInput] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOtherModalOpen, setIsOtherModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem('docuai_autospeak') === 'true';
    } catch {
      return false;
    }
  });

  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const inlineFileInputRef = useRef(null);
  const recognizerRef = useRef(null);
  const speechBufferRef = useRef('');
  const streamingPlayerRef = useRef(new StreamingSpeechPlayer());

  const isSpeechSupported = isSpeechRecognitionSupported();
  const isDocLoaded = activeDocs.length > 0;
  const starterQuestions =
    activeDocs.length > 1 ? STARTER_QUESTIONS_MULTI : STARTER_QUESTIONS_SINGLE;

  // Persist Auto-Speak preference
  const toggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('docuai_autospeak', String(next));
      } catch {}
      if (!next) {
        // Turning OFF: stop any ongoing speech immediately
        streamingPlayerRef.current.stop();
        stopSpeech();
      }
      return next;
    });
  };

  // Microphone STT toggle handler
  const handleToggleListen = () => {
    if (!isSpeechSupported) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or a Web Speech-enabled browser.');
      return;
    }

    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
      inputRef.current?.focus();
      return;
    }

    // Ensure complete silence when user starts talking into the microphone
    streamingPlayerRef.current.stop();
    stopSpeech();

    // Preserve any text already present in the input box
    const baseText = (input || '').trim();
    speechBufferRef.current = baseText;

    const recognizer = createSpeechRecognizer({
      onStart: () => {
        setIsListening(true);
      },
      onInterim: (interim, final) => {
        const prefix = speechBufferRef.current ? speechBufferRef.current + ' ' : '';
        const spoken = final ? (interim ? `${final} ${interim}` : final) : interim;
        setInput((prefix + spoken).trimStart());
      },
      onFinal: (final) => {
        const prefix = speechBufferRef.current ? speechBufferRef.current + ' ' : '';
        setInput((prefix + final).trimStart());
      },
      onError: (err) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
        // Transcribed text is kept in the input box so the user can review/edit and press Enter or Send when ready
        inputRef.current?.focus();
      },
    });

    if (recognizer) {
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
      } catch (err) {
        console.warn('Failed to start speech recognizer:', err);
        setIsListening(false);
      }
    }
  };

  // In-flow streaming Text-to-Speech (only reads fresh answers when Auto-Read is ON)
  const lastMessage = messages[messages.length - 1];
  const activeMessageRef = useRef(null);
  const isSpeakingThisMessageRef = useRef(false);

  useEffect(() => {
    if (!autoSpeak) {
      return;
    }

    if (!lastMessage || lastMessage.role !== 'assistant') {
      return;
    }

    // Detect if this is a brand new assistant message
    if (activeMessageRef.current !== lastMessage) {
      activeMessageRef.current = lastMessage;
      // ONLY speak this message if it is currently streaming (a fresh response being generated right now!)
      // This strictly prevents speaking old historical messages on load, toggle, or mic click.
      if (lastMessage.isStreaming) {
        isSpeakingThisMessageRef.current = true;
        streamingPlayerRef.current.startNewMessage();
      } else {
        isSpeakingThisMessageRef.current = false;
      }
    }

    if (!isSpeakingThisMessageRef.current) {
      return;
    }

    if (lastMessage.isStreaming) {
      streamingPlayerRef.current.pushChunk(lastMessage.content || '');
    } else if (lastMessage.content) {
      streamingPlayerRef.current.finish(lastMessage.content);
      isSpeakingThisMessageRef.current = false;
    }
  }, [lastMessage, lastMessage?.content, lastMessage?.isStreaming, autoSpeak]);

  // Clean up audio on unmount or when stopping generation
  useEffect(() => {
    return () => {
      streamingPlayerRef.current.stop();
      stopSpeech();
      recognizerRef.current?.abort();
    };
  }, []);

  // Drag-and-drop PDF files handler
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && onUpload) {
      onUpload(files.length === 1 ? files[0] : Array.from(files));
    }
  };

  // If user clicked a starter question on New Chat before uploading, auto-send once uploaded
  useEffect(() => {
    if (isDocLoaded && pendingPrompt && !isLoading) {
      const q = pendingPrompt;
      setPendingPrompt(null);
      onSendMessage(q);
    }
  }, [isDocLoaded, pendingPrompt, isLoading, onSendMessage]);

  const handleStarterQuestionClick = (q) => {
    if (isDocLoaded) {
      onSendMessage(q);
    } else {
      setPendingPrompt(q);
      fileInputRef.current?.click();
    }
  };

  // Auto-scroll chat container to bottom when messages update
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isLoading]);

  // Focus input automatically when document is loaded
  useEffect(() => {
    if (isDocLoaded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isDocLoaded]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
    }
    streamingPlayerRef.current.stop();
    stopSpeech();
    onSendMessage(input.trim());
    setInput('');
    speechBufferRef.current = '';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full min-h-0 bg-white dark:bg-[#09090b] relative"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-emerald-950/20 dark:bg-emerald-950/50 backdrop-blur-xs border-2 border-dashed border-emerald-500 rounded-xl flex flex-col items-center justify-center p-6 pointer-events-none animate-in fade-in duration-150">
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-500 shadow-2xl flex flex-col items-center text-center max-w-sm">
            <UploadCloud className="w-12 h-12 text-emerald-500 animate-bounce mb-3" />
            <h4 className="text-base font-bold text-zinc-950 dark:text-white m-0">Drop Documents Here</h4>
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mt-1.5 mb-0">
              Drop PDFs, Word (.docx), PowerPoint (.pptx), Markdown, Text, or Images to index in this chat.
            </p>
          </div>
        </div>
      )}
      {/* Scrollable Chat Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      >
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 my-auto">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 mb-3.5 shadow-xs">
                {isDocLoaded ? <Sparkles className="w-5 h-5 text-emerald-500" /> : <Bot className="w-5 h-5" />}
              </div>

              <h3 className="text-lg font-bold text-zinc-950 dark:text-white mb-1.5">
                {isDocLoaded
                  ? activeDocs.length === 1
                    ? `Ready to query ${activeDocs[0].filename || activeDocs[0].name}`
                    : `Multi-Document Chat (${activeDocs.length} documents attached)`
                  : 'Upload Documents to Start'}
              </h3>

              <p className="text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-300 max-w-md mb-5">
                {isDocLoaded
                  ? activeDocs.length === 1
                    ? 'Ask questions about this document or attach more documents/notes anytime.'
                    : 'Questions will retrieve and synthesize context across all attached documents with citations.'
                  : 'Upload PDF, PowerPoint, Word, Markdown, Text notes, or Scanned Images to ask questions with grounded citations.'}
              </p>

              {/* Active Document Badges in Empty State */}
              {isDocLoaded && (
                <div className="flex flex-wrap items-center justify-center gap-2 mb-5 max-w-lg">
                  {activeDocs.map((d, i) => (
                    <div
                      key={d.id || i}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                      <span className="truncate max-w-[160px]">{d.filename || d.name}</span>
                      <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">({d.pages_count || d.pages || '—'}p)</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => inlineFileInputRef.current?.click()}
                    disabled={isUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-zinc-400 dark:border-zinc-600 hover:border-zinc-600 dark:hover:border-zinc-400 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>+ Attach PDF(s)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOtherModalOpen(true)}
                    disabled={isUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-emerald-400 dark:border-emerald-600 hover:border-emerald-600 dark:hover:border-emerald-400 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-200 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+ Other Formats / Paste</span>
                  </button>
                </div>
              )}

              {/* Quick Upload 2 Options directly in Empty State if no doc loaded */}
              {!isDocLoaded && onUpload && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {/* Option 1: Primary Upload PDF */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-black disabled:opacity-50 text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white font-semibold text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Indexing Files...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-4 h-4" />
                          <span>Upload PDF Document(s)</span>
                        </>
                      )}
                    </button>

                    {/* Option 2: Other Formats / Paste Text */}
                    <button
                      type="button"
                      onClick={() => setIsOtherModalOpen(true)}
                      disabled={isUploading}
                      className="px-4.5 py-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-900 dark:text-zinc-100 font-semibold text-xs flex items-center gap-2 border border-zinc-300 dark:border-zinc-700 transition cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <span>Other Formats / Paste Text</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                        PPTX, DOCX, TXT, OCR
                      </span>
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0 && onUpload) {
                        onUpload(files.length === 1 ? files[0] : Array.from(files));
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </div>
              )}

              {/* Quick Starter Prompts */}
              <div className="w-full max-w-lg space-y-2 mt-5">
                <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider text-center">
                  {isDocLoaded ? 'Suggested Questions' : 'Or select a question to start:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {starterQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleStarterQuestionClick(q)}
                      disabled={isUploading}
                      className="p-3.5 rounded-xl text-left text-xs bg-zinc-50 hover:bg-zinc-100/90 dark:bg-[#141416] dark:hover:bg-[#1e1e22] border border-zinc-300/90 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 transition-all cursor-pointer flex flex-col justify-between group shadow-xs hover:border-zinc-400 dark:hover:border-zinc-500 active:scale-[0.98]"
                    >
                      <span className="font-semibold leading-snug">{q}</span>
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 transition-colors mt-3 flex items-center gap-1">
                        <span>{isDocLoaded ? 'Ask directly' : 'Select PDF & Ask'}</span>
                        <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Render Messages */
            messages.map((msg, index) => {
              const isLast = index === messages.length - 1;

              if (msg.role === 'assistant') {
                return (
                  <AssistantMessageBubble
                    key={index}
                    msg={msg}
                    onSendMessage={onSendMessage}
                    isLast={isLast}
                  />
                );
              }

              return (
                <div key={index} className="flex gap-3 text-xs sm:text-sm justify-end">
                  <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl px-4.5 py-3.5 shadow-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 ml-auto font-medium leading-relaxed">
                    {msg.content}
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5 border border-zinc-300 dark:border-zinc-700 font-semibold">
                    <User className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            })
          )}

          {/* Global Loading Bubble */}
          {isLoading && !messages.some((m) => m.isStreaming) && (
            <div className="flex gap-2.5 mr-auto max-w-md animate-pulse">
              <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-750 dark:text-zinc-250 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600 dark:text-zinc-400" />
                <span>Searching across document context...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Stop Generating Button (ChatGPT style) */}
      {isLoading && onStopGeneration && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={onStopGeneration}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-900 dark:hover:bg-white text-xs font-bold shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95 border border-zinc-700 dark:border-zinc-300"
          >
            <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span>Stop generating</span>
          </button>
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur px-4 py-3 sm:pb-4">
        <div className="max-w-3xl mx-auto w-full space-y-2">
          {/* Top-K Retrieval Depth Controls & Attached Docs Count */}
          <div className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 px-1">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 font-semibold">
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>Retrieval Depth:</span>
                <select
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-md px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-500 cursor-pointer shadow-2xs"
                  title="Number of source chunks retrieved & reranked"
                >
                  <option className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" value={3}>top_k: 3 (Default)</option>
                  <option className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" value={5}>top_k: 5 (Balanced)</option>
                  <option className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" value={8}>top_k: 8 (Deep)</option>
                </select>
              </div>

              {/* Auto-Read Aloud (TTS) Toggle */}
              <button
                type="button"
                onClick={toggleAutoSpeak}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border transition cursor-pointer shadow-2xs ${
                  autoSpeak
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
                title={
                  autoSpeak
                    ? 'Voice Readout Active: RAG answers are read aloud automatically (Click to mute)'
                    : 'Click to enable voice readout for RAG answers'
                }
              >
                {autoSpeak ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                )}
                <span>Auto-Read: {autoSpeak ? 'ON' : 'OFF'}</span>
              </button>

              {activeDocs.length > 1 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {activeDocs.length} Docs Active
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 relative">
            {/* Inline Paperclip to attach more PDFs mid-chat */}
            <button
              type="button"
              onClick={() => inlineFileInputRef.current?.click()}
              disabled={isUploading}
              title="Attach PDF(s) to this chat"
              className="p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition cursor-pointer flex-shrink-0 disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>

            {/* Inline button to attach other formats or paste text */}
            <button
              type="button"
              onClick={() => setIsOtherModalOpen(true)}
              disabled={isUploading}
              title="Add PPTX, DOCX, Images, Markdown, or Paste text notes"
              className="p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 transition cursor-pointer flex-shrink-0 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </button>

            <input
              ref={inlineFileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0 && onUpload) {
                  onUpload(files.length === 1 ? files[0] : Array.from(files));
                }
                e.target.value = '';
              }}
              className="hidden"
            />

            {/* Input field with embedded Microphone button at the end */}
            <div className="flex-1 relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                disabled={!isDocLoaded}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isListening
                    ? 'Listening... Speak your question, then press Enter or click Send'
                    : !isDocLoaded
                    ? 'Upload documents or paste text to ask questions...'
                    : isLoading
                    ? 'Searching and generating response...'
                    : activeDocs.length > 1
                    ? `Ask anything across your ${activeDocs.length} documents... (Press Enter or speak)`
                    : 'Ask a question about the document... (Press Enter or speak)'
                }
                className={`w-full bg-zinc-50/90 dark:bg-[#141416] border rounded-lg pl-4 pr-10 py-2.5 text-xs sm:text-sm text-zinc-950 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:bg-white transition shadow-2xs font-medium ${
                  isListening
                    ? 'border-rose-500 ring-2 ring-rose-400/30 bg-rose-50/20 dark:bg-rose-950/20'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-600 dark:focus:border-zinc-400'
                }`}
              />

              {/* Microphone STT button at the end part of the text box */}
              <button
                type="button"
                onClick={handleToggleListen}
                disabled={!isDocLoaded || isLoading}
                title={
                  !isSpeechSupported
                    ? 'Speech recognition not supported in this browser (use Chrome or Edge)'
                    : isListening
                    ? 'Listening... Click to stop (Press Enter when ready)'
                    : 'Click to speak (Speech-to-Text)'
                }
                className={`absolute right-2 p-1.5 rounded-md transition cursor-pointer flex items-center justify-center disabled:opacity-30 ${
                  isListening
                    ? 'text-rose-600 dark:text-rose-400 animate-pulse bg-rose-100 dark:bg-rose-900/50'
                    : 'text-zinc-400 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
                }`}
              >
                {isListening ? (
                  <Mic className="w-4 h-4 animate-bounce text-rose-500" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            {isLoading && onStopGeneration ? (
              <button
                type="button"
                onClick={() => {
                  streamingPlayerRef.current.stop();
                  stopSpeech();
                  onStopGeneration();
                }}
                title="Stop generating"
                className="px-3.5 py-2.5 rounded-lg bg-zinc-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium text-xs sm:text-sm flex items-center justify-center transition cursor-pointer shadow-2xs flex-shrink-0 active:scale-95"
              >
                <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !isDocLoaded || isLoading}
                className="px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-black disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 dark:disabled:text-zinc-600 text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white font-semibold text-xs sm:text-sm flex items-center justify-center transition disabled:cursor-not-allowed cursor-pointer shadow-sm flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Other Formats / Paste Text Modal */}
      <OtherFormatsModal
        isOpen={isOtherModalOpen}
        onClose={() => setIsOtherModalOpen(false)}
        onUploadFiles={onUpload}
        onUploadText={onUploadText}
        isUploading={isUploading}
      />
    </div>
  );
}
