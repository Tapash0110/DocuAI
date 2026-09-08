import React, { useState, useRef } from 'react';
import {
  X,
  FileText,
  Presentation,
  FileCode,
  Image as ImageIcon,
  Clipboard,
  UploadCloud,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function OtherFormatsModal({
  isOpen,
  onClose,
  onUploadFiles,
  onUploadText,
  isUploading
}) {
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'text'
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && onUploadFiles) {
      onUploadFiles(files.length === 1 ? files[0] : Array.from(files));
      onClose();
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0 && onUploadFiles) {
      onUploadFiles(files.length === 1 ? files[0] : Array.from(files));
      onClose();
    }
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!textContent.trim() || isUploading) return;
    try {
      setStatusMsg('');
      await onUploadText(textContent.trim(), textTitle.trim() || 'Pasted Notes');
      setTextContent('');
      setTextTitle('');
      onClose();
    } catch (err) {
      setStatusMsg(err.message || 'Failed to ingest text');
    }
  };

  const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;
  const charCount = textContent.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100 font-bold">
                <Sparkles className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 m-0">
                Add Documents & Content
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-0">
              Ingest PowerPoint slides, Word docs, Markdown, Images with OCR, or paste text notes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-5 pt-2 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'files'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload Files & Images
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'text'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Clipboard className="w-3.5 h-3.5" />
            Paste Raw Text / Notes
          </button>
        </div>

        {/* Tab 1: File Dropzone & Supported Format Cards */}
        {activeTab === 'files' && (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-8 rounded-xl border-2 border-dashed transition text-center cursor-pointer flex flex-col items-center justify-center ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[0.99]'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50/60 dark:bg-zinc-800/40'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-white dark:bg-zinc-800 shadow-xs flex items-center justify-center text-zinc-700 dark:text-zinc-300 mb-3 border border-zinc-200 dark:border-zinc-700">
                <UploadCloud className="w-6 h-6 text-zinc-800 dark:text-zinc-200" />
              </div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 m-0">
                Click to browse or drag and drop files
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-0">
                PPTX, DOCX, Markdown (.md), Text (.txt), Images (PNG, JPG, WEBP)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pptx,.docx,.doc,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.bmp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Supported Formats Grid */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Supported Document Types
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500 shrink-0">
                    <Presentation className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 m-0 leading-tight">PowerPoint (.pptx)</h5>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 m-0 mt-0.5">Slides, tables & speaker notes</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 m-0 leading-tight">Word (.docx)</h5>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 m-0 mt-0.5">Structured headings & tables</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 shrink-0">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 m-0 leading-tight">Markdown & Text (.md, .txt)</h5>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 m-0 mt-0.5">Documentation, notes & logs</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500 shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 m-0 leading-tight">Images (.png, .jpg, .webp)</h5>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 m-0 mt-0.5">Scanned text via RapidOCR</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Paste Raw Text */}
        {activeTab === 'text' && (
          <form onSubmit={handleTextSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 flex flex-col">
            {statusMsg && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Document Title
              </label>
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="e.g., Meeting Notes, System Architecture, Policy Brief"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <div className="flex-1 flex flex-col min-h-[180px]">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Content / Text
                </label>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {wordCount} words &bull; {charCount} chars
                </span>
              </div>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste any plain text, Markdown notes, article excerpts, or code documentation here..."
                required
                rows={8}
                className="w-full flex-1 p-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/40 resize-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!textContent.trim() || isUploading}
                className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Indexing Text...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Ingest & Index Text</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
