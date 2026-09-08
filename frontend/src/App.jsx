import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import LandingPage from './components/LandingPage';
import {
  checkHealth,
  getSessions,
  createSession,
  getSession,
  updateSessionTitle,
  deleteSession,
  clearSessionMessages,
  uploadPdf,
  uploadPdfBatch,
  deleteDocument,
  uploadRawText,
  streamQuestion,
  getCurrentUser,
  logout,
  getAuthToken,
} from './api/api';

export default function App() {
  // Authentication state (3-day JWT persistence)
  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('docuai_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Theme state (Dark by default)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('docuai_theme') || 'dark';
  });

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Sessions and Document states (persisted via FastAPI & SQLite)
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeDocs, setActiveDocs] = useState([]);
  const [sessionTitle, setSessionTitle] = useState('New Chat');

  // Chat & Connection states
  const [isOnline, setIsOnline] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [topK, setTopK] = useState(3);
  const [toastMessage, setToastMessage] = useState(null);
  const abortControllerRef = useRef(null);

  // Sync theme with HTML class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('docuai_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load a session's details (documents & messages)
  const loadSessionDetails = useCallback(async (sid) => {
    try {
      const data = await getSession(sid);
      if (data) {
        setActiveSessionId(data.id);
        setSessionTitle(data.title || 'New Chat');
        setActiveDocs(data.documents || []);
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, []);

  // Load sessions from backend SQLite (keeps active session as New Chat on page refresh)
  const refreshSessions = useCallback(async () => {
    try {
      const sessList = await getSessions();
      setSessions(sessList || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  // Check health and sync connection state
  const pollHealth = useCallback(async () => {
    const data = await checkHealth();
    if (data.status === 'ok') {
      setIsOnline(true);
    } else {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    pollHealth();
    refreshSessions();

    const interval = setInterval(pollHealth, 10000);
    return () => clearInterval(interval);
  }, [pollHealth, refreshSessions]);

  // Select a session from history
  const handleSelectSession = async (id) => {
    if (id === activeSessionId) return;
    await loadSessionDetails(id);
  };

  // Start a fresh new chat session
  const handleNewChat = () => {
    setActiveSessionId(null);
    setActiveDocs([]);
    setMessages([]);
    setSessionTitle('New Chat');
    showToast('Started new chat. Upload a PDF to begin.');
  };

  // Centralized document upload handler (supports PDF, PPTX, DOCX, TXT, MD, Images)
  const handleUpload = async (filesInput) => {
    if (!filesInput) return;
    const fileList = Array.isArray(filesInput)
      ? filesInput
      : filesInput instanceof FileList
      ? Array.from(filesInput)
      : [filesInput];

    const supportedExts = ['.pdf', '.pptx', '.ppt', '.docx', '.doc', '.txt', '.md', '.markdown', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.csv', '.json', '.log'];
    const validFiles = fileList.filter((f) => {
      if (!f || !f.name) return false;
      const lower = f.name.toLowerCase();
      return supportedExts.some((ext) => lower.endsWith(ext));
    });

    if (validFiles.length === 0) {
      showToast('Error: Please select supported document(s) (PDF, PPTX, DOCX, TXT, MD, Images).');
      return;
    }

    setIsUploading(true);
    try {
      if (validFiles.length === 1) {
        const res = await uploadPdf(validFiles[0], activeSessionId);
        const targetSid = res.session_id;
        setActiveSessionId(targetSid);

        await loadSessionDetails(targetSid);
        await refreshSessions(false);

        showToast(
          res.total_session_docs > 1
            ? `Added ${res.filename} (${res.total_session_docs} documents active)`
            : `Indexed ${res.filename} (${res.chunks_indexed} chunks)`
        );
      } else {
        const res = await uploadPdfBatch(validFiles, activeSessionId);
        const targetSid = res.session_id;
        setActiveSessionId(targetSid);

        await loadSessionDetails(targetSid);
        await refreshSessions(false);

        showToast(
          `Indexed ${res.total_files_uploaded} documents (${res.total_chunks_indexed} chunks total)`
        );
      }
    } catch (err) {
      showToast(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Ingest raw pasted text or notes into active chat session
  const handleUploadText = async (text, title) => {
    if (!text || !text.trim()) return;
    setIsUploading(true);
    try {
      const res = await uploadRawText(text, title, activeSessionId);
      const targetSid = res.session_id;
      setActiveSessionId(targetSid);

      await loadSessionDetails(targetSid);
      await refreshSessions(false);

      showToast(`Indexed text notes "${res.filename}" (${res.chunks_indexed} chunks)`);
      return res;
    } catch (err) {
      showToast(`Text ingestion failed: ${err.message}`);
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  // Delete an individual document from the active chat session
  const handleDeleteDocument = async (docId, docName) => {
    if (!activeSessionId || !docId) return;
    try {
      await deleteDocument(activeSessionId, docId);
      await loadSessionDetails(activeSessionId);
      await refreshSessions(false);
      showToast(`Removed "${docName || 'document'}" from chat.`);
    } catch (err) {
      showToast(`Remove failed: ${err.message}`);
    }
  };

  // Rename session title
  const handleRenameSession = async (id, newTitle) => {
    try {
      await updateSessionTitle(id, newTitle);
      if (id === activeSessionId) setSessionTitle(newTitle);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
      );
      showToast('Chat title updated.');
    } catch (err) {
      showToast(`Rename failed: ${err.message}`);
    }
  };

  // Delete session
  const handleDeleteSession = async (id) => {
    try {
      await deleteSession(id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);

      if (activeSessionId === id) {
        handleNewChat();
      }
      showToast('Chat deleted.');
    } catch (err) {
      showToast(`Delete failed: ${err.message}`);
    }
  };

  // Clear/remove current chat session completely from history
  const handleClearChat = async () => {
    if (activeSessionId) {
      await handleDeleteSession(activeSessionId);
    } else {
      setMessages([]);
      setActiveDocs([]);
      showToast('Conversation cleared.');
    }
  };

  // Helper to update the last assistant message during streaming
  const updateAssistant = (patch) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = typeof patch === 'function' ? patch(last) : { ...last, ...patch };
      }
      return next;
    });
  };

  // Send message and stream response
  const handleSendMessage = async (questionText) => {
    if (!questionText.trim() || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();
    const userMsg = { role: 'user', content: questionText, timestamp: new Date() };
    const assistantMsg = {
      role: 'assistant',
      content: '',
      searchStatus: 'Searching document index...',
      sources: [],
      isStreaming: true,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    try {
      await streamQuestion({
        question: questionText,
        sessionId: activeSessionId,
        topK,
        signal: abortController.signal,
        onStatus: (status) => {
          updateAssistant((m) => ({ ...m, searchStatus: status }));
        },
        onToken: (token) => {
          updateAssistant((m) => ({
            ...m,
            searchStatus: null,
            content: (m.content || '') + token,
          }));
        },
        onDone: async ({ sources, sessionId: returnedSid, latency_ms, final_answer }) => {
          const clientLatency = Date.now() - startTime;
          updateAssistant((m) => ({
            ...m,
            searchStatus: null,
            content: final_answer || m.content,
            sources: sources || [],
            latency_ms: latency_ms ?? clientLatency,
            isStreaming: false,
          }));
          setIsLoading(false);
          abortControllerRef.current = null;

          if (returnedSid && returnedSid !== activeSessionId) {
            setActiveSessionId(returnedSid);
          }
          // Refresh background session list to update message counts & timestamps
          await refreshSessions(false);
        },
        onError: (err) => {
          updateAssistant((m) => ({
            ...m,
            searchStatus: null,
            content: m.content || `Error: ${err.message}`,
            isStreaming: false,
          }));
          setIsLoading(false);
          abortControllerRef.current = null;
        },
      });
    } catch (err) {
      updateAssistant((m) => ({
        ...m,
        searchStatus: null,
        content: `Error: ${err.message}`,
        isStreaming: false,
      }));
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Stop active streaming generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    updateAssistant((m) => ({
      ...m,
      isStreaming: false,
      searchStatus: null,
    }));
    setIsLoading(false);
    showToast('Generation stopped.');
  };

  // Export conversation as formatted Markdown
  const handleExportChat = () => {
    if (messages.length === 0) return;
    const docNames = activeDocs.map((d) => d.filename || d.name).join(', ') || 'Active Document';
    let md = `# DocuAI Conversation Export\n\n`;
    md += `**Chat:** ${sessionTitle}\n`;
    md += `**Attached Documents:** ${docNames}\n`;
    md += `**Export Date:** ${new Date().toLocaleString()}\n\n---\n\n`;

    messages.forEach((m) => {
      if (m.role === 'user') {
        md += `### 👤 User\n${m.content}\n\n`;
      } else {
        md += `### 🤖 DocuAI Assistant\n${m.content}\n\n`;
        if (m.sources && m.sources.length > 0) {
          md += `**Cited Sources:**\n`;
          m.sources.forEach((s) => {
            const docPart = s.doc_name ? `**${s.doc_name}** - ` : '';
            md += `- ${docPart}Page ${s.page} (Chunk #${s.chunk_id}, RRF Score: ${s.score}): "${s.text.replace(/\n/g, ' ')}"\n`;
          });
          md += `\n`;
        }
      }
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `docuai-${(sessionTitle || 'chat').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Verify JWT on mount or token change
  useEffect(() => {
    if (token) {
      getCurrentUser().then((verified) => {
        if (verified) {
          setUser(verified);
        } else {
          setUser(null);
          setToken(null);
        }
      });
    }
  }, [token]);

  const handleAuthSuccess = (authedUser, authedToken) => {
    setUser(authedUser);
    setToken(authedToken);
    showToast(`Welcome, ${authedUser.name}!`);
    refreshSessions();
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setToken(null);
    showToast('Signed out successfully.');
  };

  const totalChunks = activeDocs.reduce(
    (acc, d) => acc + (d.chunks_count || d.chunks || 0),
    0
  );

  // If unauthenticated, show the Landing & Auth Home Page
  if (!token || !user) {
    return (
      <>
        <LandingPage
          onAuthSuccess={handleAuthSuccess}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none">
            <div className="px-4 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold shadow-2xl border border-zinc-800 dark:border-zinc-200 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 font-sans antialiased">
      {/* ChatGPT-Style Left Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((prev) => !prev)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeDocs={activeDocs}
        onUpload={handleUpload}
        onUploadText={handleUploadText}
        isUploading={isUploading}
        onDeleteDocument={handleDeleteDocument}
        onLogout={handleLogout}
        user={user}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Sticky Header */}
        <Header
          isOnline={isOnline}
          chunksIndexed={totalChunks}
          onRefreshHealth={pollHealth}
          activeDocs={activeDocs}
          sessionTitle={sessionTitle}
          messagesCount={messages.length}
          onExportChat={handleExportChat}
          onClearChat={handleClearChat}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        {/* Chat Window Container */}
        <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            activeDocs={activeDocs}
            topK={topK}
            setTopK={setTopK}
            onUpload={handleUpload}
            onUploadText={handleUploadText}
            isUploading={isUploading}
            onStopGeneration={handleStopGeneration}
          />
        </main>
      </div>

      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none">
          <div className="px-4 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold shadow-2xl border border-zinc-800 dark:border-zinc-200 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
