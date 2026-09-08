import React from 'react';
import { WifiOff, Download, Trash2, PanelLeft, Layers } from 'lucide-react';

export default function Header({
  isOnline,
  chunksIndexed,
  onRefreshHealth,
  activeDocs = [],
  sessionTitle,
  messagesCount = 0,
  onExportChat,
  onClearChat,
  isSidebarOpen,
  onToggleSidebar,
}) {
  const docSummary = () => {
    if (activeDocs.length === 0) return null;
    if (activeDocs.length === 1) {
      const doc = activeDocs[0];
      return doc.filename || doc.name;
    }
    return `${activeDocs.length} PDFs Active (${activeDocs.map((d) => d.filename || d.name).join(', ')})`;
  };

  const summaryText = docSummary();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur sticky top-0 z-20 px-4 py-2.5 flex-shrink-0">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Sidebar toggle (when collapsed) & Active Document / Session Pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer flex-shrink-0"
              title="Open Sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          {activeDocs.length > 0 ? (
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 max-w-[240px] sm:max-w-md md:max-w-lg truncate shadow-2xs"
              title={summaryText}
            >
              {activeDocs.length > 1 ? (
                <Layers className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              )}
              <span className="truncate">
                {activeDocs.length === 1
                  ? activeDocs[0].filename || activeDocs[0].name
                  : `${activeDocs.length} PDFs attached`}
              </span>
              {chunksIndexed > 0 && (
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-mono font-medium flex-shrink-0 hidden sm:inline">
                  ({chunksIndexed} chunks)
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 shadow-2xs">
                DocuAI
              </span>
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 hidden sm:inline truncate">
                {sessionTitle || 'Multi-PDF Hybrid Search'}
              </span>
            </div>
          )}
        </div>

        {/* Right: Actions (Export / Clear) & Health Status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(messagesCount > 0 || activeDocs.length > 0) && (
            <div className="flex items-center gap-1.5">
              {messagesCount > 0 && (
                <button
                  onClick={onExportChat}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white px-2.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Download conversation as Markdown (.md)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              )}

              <button
                onClick={onClearChat}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-rose-600 dark:text-zinc-300 dark:hover:text-rose-400 px-2.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Remove this chat from history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>

              <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-0.5" />
            </div>
          )}

          <button
            onClick={onRefreshHealth}
            title="Click to check backend connection"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-xs transition cursor-pointer shadow-2xs"
          >
            {isOnline ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-600 dark:text-rose-400 font-semibold">Offline</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
