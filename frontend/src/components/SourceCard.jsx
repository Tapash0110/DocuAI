import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  FileText,
  X,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ImageIcon,
  Loader2,
} from 'lucide-react';
import { getDocumentPageImageUrl, getDocumentFileUrl } from '../api/api';

function getFormatBadge(name) {
  if (!name) return { label: 'DOC', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' };
  const lower = name.toLowerCase();
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    return { label: 'PPTX', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' };
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    return { label: 'DOCX', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30' };
  }
  if (lower.match(/\.(png|jpg|jpeg|webp|bmp)$/)) {
    return { label: 'IMG', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30' };
  }
  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    return { label: 'TXT', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' };
  }
  return { label: 'PDF', color: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30' };
}

export function formatExcerptText(text) {
  if (!text) return '';

  let s = text;

  // 1. Convert Private Use Area symbols (Wingdings / Symbol font bullets e.g. \uf071, \uf0d8, \uf0fc) to clean bullets
  s = s.replace(/[\uE000-\uF8FF]+/g, '\n• ');

  // 2. Remove Unicode replacement characters (\uFFFD) and non-printable control characters
  s = s.replace(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, '');

  // 3. Ensure space after punctuation if immediately followed by an alphanumeric character
  s = s.replace(/([,:;])([A-Za-z0-9])/g, '$1 $2');

  // 4. Separate numbers and common unit names (e.g. 180seconds -> 180 seconds)
  s = s.replace(/(\d+)(sec|seconds|min|minutes|hr|hours|ms|bps|kbps|mbps|gbps|bytes|kb|mb|gb)\b/gi, '$1 $2');

  // 5. Ensure bullet points start on their own lines
  s = s.replace(/([^\n])\s*•\s*/g, '$1\n• ');

  // 6. Normalize multi-spaces per line
  s = s.replace(/[ \t]{2,}/g, ' ');

  // 7. Deduplicate consecutive identical lines (common in slides with layered shape stutters)
  const lines = s.split('\n');
  const cleanLines = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1] === trimmed) {
      continue;
    }
    cleanLines.push(trimmed);
  }

  return cleanLines.join('\n');
}

export default function SourceCard({ sources }) {
  const [activeSource, setActiveSource] = useState(null);
  const [viewMode, setViewMode] = useState('text'); // 'text' | 'visual'
  const [zoom, setZoom] = useState(1);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveSource(null);
    };
    if (activeSource) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSource]);

  const handleOpenSource = (src) => {
    setActiveSource(src);
    setViewMode('text');
    setZoom(1);
    setPageLoading(true);
    setPageError(false);
    setCopied(false);
  };

  const handleCopyExcerpt = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!sources || sources.length === 0) return null;

  const formattedExcerpt = activeSource ? formatExcerptText(activeSource.text) : '';

  return (
    <>
      {/* 1-Line Horizontal Sources Bar */}
      <div className="flex items-center gap-1.5 flex-wrap pt-2.5 mt-1 border-t border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mr-0.5 flex items-center gap-1.5 flex-shrink-0">
          <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
          <span>Sources ({sources.length}):</span>
        </span>
        {sources.map((src, idx) => {
          const badge = getFormatBadge(src.doc_name);
          const docLabel = src.doc_name
            ? src.doc_name.length > 20
              ? `${src.doc_name.slice(0, 18)}...`
              : src.doc_name
            : 'Document';

          // Format score as confidence percentage if applicable
          const confidencePercent =
            src.score && src.score > 0
              ? Math.min(Math.round(src.score * 100), 99)
              : null;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleOpenSource(src)}
              className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer border bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 shadow-2xs hover:shadow-xs active:scale-[0.98]"
              title={`Click to view verified excerpt & page/slide from ${src.doc_name || 'Document'} (Page ${src.page})`}
            >
              <span className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold leading-none ${badge.color}`}>
                {badge.label}
              </span>
              <span className="truncate max-w-[140px] font-bold text-zinc-950 dark:text-white">
                {docLabel}
              </span>
              <span className="text-zinc-400 dark:text-zinc-500">&bull;</span>
              <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                p.{src.page}
              </span>
              {confidencePercent && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {confidencePercent}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Floating Citation & PDF Viewer Modal */}
      {activeSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setActiveSource(null)}
        >
          <div
            className={`relative w-full rounded-2xl bg-white dark:bg-[#121215] border border-zinc-300 dark:border-zinc-750 p-5 shadow-2xl transition-all ${
              viewMode === 'pdf' ? 'max-w-3xl' : 'max-w-xl'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex-shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-950 dark:text-white m-0 truncate">
                    {activeSource.doc_name || 'Document'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Page {activeSource.page}
                    </span>
                    {activeSource.score && (
                      <>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <Sparkles className="w-3.5 h-3.5" />
                          Relevance Match
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {activeSource.doc_id && (
                  <a
                    href={getDocumentFileUrl(activeSource.doc_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
                    title="Open or Download Original File"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {activeSource.doc_name?.toLowerCase().endsWith('.pdf') ? 'Open PDF' : 'Original File'}
                    </span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActiveSource(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer flex-shrink-0 ml-1"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* View Mode Toggle: Text Excerpt vs Visual Page Preview */}
            <div className="flex items-center justify-between mt-3 mb-2">
              <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-0.5 text-xs font-semibold border border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setViewMode('text')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer ${
                    viewMode === 'text'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-950 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Text Excerpt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('pdf')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition cursor-pointer ${
                    viewMode === 'pdf'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-950 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Visual Preview</span>
                </button>
              </div>

              {viewMode === 'text' ? (
                <button
                  type="button"
                  onClick={() => handleCopyExcerpt(formattedExcerpt)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Copied
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Excerpt</span>
                    </>
                  )}
                </button>
              ) : (
                /* PDF Page Zoom Controls */
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-md px-1 py-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                    className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1 font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                    className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="p-1 text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white cursor-pointer"
                    title="Reset Zoom"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            {viewMode === 'text' ? (
              <div className="mt-2 max-h-[50vh] overflow-y-auto pr-1">
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-zinc-100 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-medium selection:bg-emerald-500/25">
                  {formattedExcerpt}
                </div>
              </div>
            ) : (
              <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl bg-zinc-100 dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 p-2 flex items-center justify-center min-h-[260px] relative">
                {activeSource.doc_id ? (
                  <>
                    {pageLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 dark:bg-black/60 backdrop-blur-2xs z-10">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Rendering Preview (Page/Slide {activeSource.page})...
                        </span>
                      </div>
                    )}
                    {pageError ? (
                      <div className="p-6 text-center text-xs text-zinc-500 max-w-sm">
                        <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                          Visual page preview is not available for this document
                        </p>
                        <p className="leading-relaxed">
                          Visual previews are rendered for PDFs and image files. For DOCX, PPTX, and notes, all content is fully indexed in the <strong>Text Excerpt</strong> tab.
                        </p>
                      </div>
                    ) : (
                      <img
                        src={getDocumentPageImageUrl(activeSource.doc_id, activeSource.page)}
                        alt={`Page ${activeSource.page} of ${activeSource.doc_name || 'Document'}`}
                        onLoad={() => setPageLoading(false)}
                        onError={() => {
                          setPageLoading(false);
                          setPageError(true);
                        }}
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                        className="max-w-full rounded shadow-md transition-transform duration-150 border border-zinc-200 dark:border-zinc-700"
                      />
                    )}
                  </>
                ) : (
                  <div className="p-6 text-center text-xs text-zinc-500">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Document file is not cached on disk for preview
                    </p>
                    <p>Use the Text Excerpt tab to inspect the retrieved content.</p>
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-xs border border-zinc-300 dark:border-zinc-700">
                  Esc
                </kbd>{' '}
                to close
              </span>
              <button
                type="button"
                onClick={() => setActiveSource(null)}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-bold transition cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
