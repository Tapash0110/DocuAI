import React, { useRef, useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  FileText,
  UploadCloud,
  CheckCircle2,
  RefreshCw,
  FileUp,
  Layers,
  LogOut,
  User,
  Eye,
  Sparkles,
} from 'lucide-react';
import { getDocumentFileUrl } from '../api/api';
import OtherFormatsModal from './OtherFormatsModal';

function getDocBadge(filename) {
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pptx':
    case 'ppt':
      return { label: 'PPTX', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' };
    case 'docx':
    case 'doc':
      return { label: 'DOCX', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'bmp':
      return { label: 'IMG', color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30' };
    case 'md':
    case 'markdown':
    case 'txt':
    case 'csv':
    case 'json':
      return { label: 'TXT', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
    default:
      return { label: 'PDF', color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' };
  }
}

function getUserInitials(name) {
  if (!name || typeof name !== 'string') return 'TJ';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (name[0] || 'TJ').toUpperCase();
}

export default function Sidebar({
  isOpen,
  onToggle,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  theme,
  onToggleTheme,
  activeDocs = [],
  onUpload,
  onUploadText,
  isUploading,
  onDeleteDocument,
  onLogout,
  user,
}) {
  const fileInputRef = useRef(null);
  const [isOtherModalOpen, setIsOtherModalOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0 && onUpload) {
      onUpload(files.length === 1 ? files[0] : Array.from(files));
    }
    e.target.value = '';
  };

  const startEditing = (e, sess) => {
    e.stopPropagation();
    setEditingSessionId(sess.id);
    setEditTitle(sess.title);
  };

  const saveEditing = (e, sessId) => {
    e.stopPropagation();
    if (editTitle.trim() && onRenameSession) {
      onRenameSession(sessId, editTitle.trim());
    }
    setEditingSessionId(null);
  };

  const totalChunks = activeDocs.reduce((acc, d) => acc + (d.chunks_count || d.chunks || 0), 0);

  return (
    <aside
      className={`h-full flex-shrink-0 transition-all duration-200 ease-in-out flex flex-col border-r bg-white dark:bg-[#0c0c0e] border-zinc-200/80 dark:border-zinc-800/80 z-30 ${
        isOpen ? 'w-72' : 'w-16'
      }`}
    >
      {/* Top Header / Branding */}
      <div className="p-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between flex-shrink-0">
        <div
          onClick={!isOpen ? onToggle : undefined}
          className={`flex items-center gap-3 overflow-hidden ${!isOpen ? 'justify-center w-full cursor-pointer' : ''}`}
          title={!isOpen ? 'Click to expand sidebar' : undefined}
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-300 dark:text-zinc-950 flex items-center justify-center flex-shrink-0 shadow-sm border border-zinc-800/20 dark:border-white/20">
            <Sparkles className="w-4.5 h-4.5 text-emerald-400 dark:text-emerald-600" />
          </div>
          {isOpen && (
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-black tracking-tight text-zinc-950 dark:text-white truncate m-0 leading-none">
                  DocuAI
                </h1>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wide uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  PRO
                </span>
              </div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                Universal AI Workspace
              </span>
            </div>
          )}
        </div>

        {isOpen && (
          <button
            onClick={onToggle}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition cursor-pointer"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Action: New Chat */}
      <div className="p-3 flex-shrink-0">
        <button
          onClick={onNewChat}
          className={`flex items-center rounded-lg bg-zinc-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white font-semibold text-xs transition cursor-pointer shadow-sm w-full ${
            isOpen ? 'px-3 py-2 justify-start gap-2' : 'p-2 justify-center'
          }`}
          title="Start New Chat"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {isOpen && <span>New Chat</span>}
        </button>
      </div>

      {/* Active Chat Documents Section */}
      <div className="px-3 pb-2 flex-shrink-0">
        {isOpen ? (
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                Chat Documents ({activeDocs.length})
              </span>
              {totalChunks > 0 && (
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono font-semibold">
                  {totalChunks} chunks
                </span>
              )}
            </div>

            {/* List of active documents in this chat */}
            {activeDocs.length > 0 ? (
              <div className="space-y-1.5 mb-2 max-h-36 overflow-y-auto pr-0.5">
                {activeDocs.map((doc, i) => {
                  const b = getDocBadge(doc.filename || doc.name);
                  return (
                    <div
                      key={doc.id || i}
                      className="group/doc p-2 rounded-md bg-white dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-1.5 text-xs shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-600 transition"
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-1">
                        <FileText className="w-3.5 h-3.5 flex-shrink-0 text-zinc-600 dark:text-zinc-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate m-0 leading-tight" title={doc.filename || doc.name}>
                              {doc.filename || doc.name}
                            </p>
                            <span className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold border shrink-0 ${b.color}`}>
                              {b.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono font-medium m-0">
                            {doc.pages_count || doc.pages || '—'} p &bull; {doc.chunks_count || doc.chunks || 0} chunks
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {doc.id && (
                          <a
                            href={getDocumentFileUrl(doc.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition"
                            title="View / Download File"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {onDeleteDocument && (
                          <button
                            type="button"
                            onClick={() => onDeleteDocument(doc.id, doc.filename || doc.name)}
                            className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="Remove document from chat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center py-2.5 mb-1">
                No documents attached yet
              </div>
            )}

            {/* 2 Clear Options: Upload PDF(s) and Other Formats / Paste Text */}
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full py-1.5 px-2 rounded-md bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-2xs"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Indexing...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                    <span>{activeDocs.length > 0 ? '+ Add PDF(s)' : 'Upload PDF(s)'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsOtherModalOpen(true)}
                disabled={isUploading}
                className="w-full py-1.5 px-2 rounded-md bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200/80 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-dashed border-zinc-300 dark:border-zinc-700 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>+ Other Formats / Paste</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full p-2 rounded-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition cursor-pointer disabled:opacity-50"
            title={activeDocs.length > 0 ? `${activeDocs.length} PDFs attached` : 'Upload PDF'}
          >
            <FileText className="w-4 h-4 text-zinc-700 dark:text-zinc-200" />
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Previous Sessions (ChatGPT-style persistent history) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-1">
        {isOpen && (
          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            Chat History
          </div>
        )}

        {sessions.length === 0 ? (
          isOpen && (
            <div className="p-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              No saved chats yet
            </div>
          )
        ) : (
          sessions.map((sess) => {
            const isActive = sess.id === activeSessionId;
            const isEditing = editingSessionId === sess.id;

            return (
              <div
                key={sess.id}
                onClick={() => !isEditing && onSelectSession(sess.id)}
                className={`group flex items-center gap-2 rounded-lg text-xs transition cursor-pointer relative ${
                  isOpen ? 'px-2.5 py-2' : 'p-2 justify-center'
                } ${
                  isActive
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white font-semibold border border-zinc-300 dark:border-zinc-700 shadow-2xs'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-950 dark:hover:text-white font-medium'
                }`}
                title={sess.title}
              >
                <MessageSquare
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                />
                {isOpen && (
                  <>
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditing(e, sess.id);
                            if (e.key === 'Escape') setEditingSessionId(null);
                          }}
                          autoFocus
                          className="flex-1 text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-600 rounded px-2 py-0.5 text-zinc-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-zinc-500"
                        />
                        <button
                          onClick={(e) => saveEditing(e, sess.id)}
                          className="p-1 hover:text-emerald-500 text-zinc-500"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className={`truncate flex-1 text-left ${isActive ? 'text-zinc-950 dark:text-white font-semibold' : ''}`}>
                          {sess.title}
                        </span>
                        {sess.doc_count > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0 ${
                              isActive
                                ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            {sess.doc_count} {sess.doc_count === 1 ? 'doc' : 'docs'}
                          </span>
                        )}
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => startEditing(e, sess)}
                            className="p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded transition cursor-pointer"
                            title="Rename chat"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(sess.id);
                            }}
                            className="p-1 text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 rounded transition cursor-pointer"
                            title="Delete chat session"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Area: User Profile & Workspace Settings */}
      <div className="p-3 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-2.5 flex-shrink-0">
        {!isOpen && (
          <button
            onClick={onToggle}
            className="w-full p-2 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition cursor-pointer"
            title="Expand Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className={`w-full flex items-center rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition cursor-pointer ${
            isOpen ? 'px-2.5 py-2 justify-between' : 'p-2 justify-center'
          }`}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          <div className="flex items-center gap-2">
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-500 flex-shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            )}
            {isOpen && <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>}
          </div>
          {isOpen && (
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono capitalize">{theme}</span>
          )}
        </button>

        {/* User Profile Avatar & Red Logout Button */}
        <div
          className={`p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 flex items-center ${
            isOpen ? 'justify-between gap-2' : 'justify-center flex-col gap-2'
          } transition-all shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700`}
        >
          {/* Avatar Icon + User Info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="relative flex-shrink-0 cursor-pointer group"
              title={`${user?.name || 'User'} (${user?.email || 'Logged In'})`}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 via-indigo-600 to-rose-500 text-white font-bold text-xs flex items-center justify-center shadow-xs select-none group-hover:scale-105 transition-transform uppercase tracking-wider">
                {getUserInitials(user?.name)}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0c0c0e]" />
            </div>

            {isOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-zinc-950 dark:text-white truncate m-0 leading-tight">
                  {user?.name || 'DocuAI Workspace'}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate m-0 font-medium">
                  {user?.email || 'Active Session'}
                </p>
              </div>
            )}
          </div>

          {/* Red Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded-lg text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-600 border border-rose-200 hover:border-rose-600 dark:border-rose-900/60 dark:hover:border-rose-600 transition-all duration-150 cursor-pointer shadow-2xs flex-shrink-0 group/logout active:scale-95 flex items-center justify-center"
            title="Log out"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover/logout:-translate-x-0.5" />
          </button>
        </div>
      </div>

      <OtherFormatsModal
        isOpen={isOtherModalOpen}
        onClose={() => setIsOtherModalOpen(false)}
        onUploadFiles={onUpload}
        onUploadText={onUploadText}
        isUploading={isUploading}
      />
    </aside>
  );
}
