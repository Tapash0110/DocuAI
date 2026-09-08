const API_BASE = 'http://localhost:8000';

export function getAuthToken() {
  return localStorage.getItem('docuai_token') || null;
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('docuai_token', token);
  } else {
    localStorage.removeItem('docuai_token');
  }
}

export function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const parseError = async (res, defaultMsg) => {
  try {
    const data = await res.json();
    return data.detail || defaultMsg;
  } catch {
    return `${defaultMsg} (${res.status})`;
  }
};

// ---------- Authentication APIs ----------

export async function register(name, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Registration failed'));
  const data = await res.json();
  if (data.token) {
    setAuthToken(data.token);
    localStorage.setItem('docuai_user', JSON.stringify(data.user));
  }
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Sign in failed'));
  const data = await res.json();
  if (data.token) {
    setAuthToken(data.token);
    localStorage.setItem('docuai_user', JSON.stringify(data.user));
  }
  return data;
}

export async function getCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setAuthToken(null);
      localStorage.removeItem('docuai_user');
      return null;
    }
    const user = await res.json();
    localStorage.setItem('docuai_user', JSON.stringify(user));
    return user;
  } catch (err) {
    console.error('getCurrentUser error:', err);
    return null;
  }
}

export function logout() {
  setAuthToken(null);
  localStorage.removeItem('docuai_user');
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok ? await res.json() : { status: 'error', chunks_indexed: 0 };
  } catch (err) {
    return { status: 'error', chunks_indexed: 0, error: err.message };
  }
}

export async function getSessions() {
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error(await parseError(res, 'Failed to fetch sessions'));
    return await res.json();
  } catch (err) {
    console.error('getSessions error:', err);
    return [];
  }
}

export async function createSession(title = 'New Chat') {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Failed to create session'));
  return await res.json();
}

export async function getSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(await parseError(res, 'Failed to load session'));
  return await res.json();
}

export async function updateSessionTitle(sessionId, title) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Failed to update title'));
  return await res.json();
}

export async function deleteSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res, 'Failed to delete session'));
  return await res.json();
}

export async function clearSessionMessages(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res, 'Failed to clear messages'));
  return await res.json();
}


export async function uploadPdf(file, sessionId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) {
    formData.append('session_id', sessionId);
  }
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await parseError(res, 'Upload failed'));
  return res.json();
}

export async function uploadPdfBatch(files, sessionId = null) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  if (sessionId) {
    formData.append('session_id', sessionId);
  }
  const res = await fetch(`${API_BASE}/upload/batch`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await parseError(res, 'Batch upload failed'));
  return res.json();
}

export async function deleteDocument(sessionId, docId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/documents/${docId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res, 'Failed to delete document'));
  return res.json();
}

export async function uploadRawText(text, title = 'Pasted Notes', sessionId = null) {
  const res = await fetch(`${API_BASE}/upload/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title || 'Pasted Notes',
      text,
      session_id: sessionId,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Failed to ingest text'));
  return res.json();
}

export function getDocumentPageImageUrl(docId, pageNum) {
  return `${API_BASE}/documents/${docId}/page/${pageNum}`;
}

export function getDocumentFileUrl(docId) {
  return `${API_BASE}/documents/${docId}/file`;
}

export async function streamQuestion({
  question,
  sessionId,
  topK = 3,
  signal,
  onStatus,
  onToken,
  onDone,
  onError,
}) {
  try {
    const res = await fetch(`${API_BASE}/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, top_k: topK, session_id: sessionId }),
      signal,
    });

    if (!res.ok) throw new Error(await parseError(res, 'Streaming failed'));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          if (data.status) onStatus?.(data.status);
          if (data.token) onToken?.(data.token);
          if (data.sources !== undefined) onDone?.({
            sources: data.sources,
            sessionId: data.session_id,
            latency_ms: data.latency_ms,
            final_answer: data.final_answer,
          });
        } catch {}
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // User clicked stop generation
      return;
    }
    if (onError) {
      onError(err);
    } else {
      console.error('Stream error:', err);
    }
  }
}
