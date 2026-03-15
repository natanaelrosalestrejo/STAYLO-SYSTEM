import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Send, Sparkles, X, MessageSquare, Users, UserCheck } from 'lucide-react';

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function Inbox() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [newMsg, setNewMsg] = useState({ receiver_id: '', subject: '', content: '', message_type: 'staff_to_staff' });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [msgRes, usersRes, guestsRes] = await Promise.all([
        api.get('/messages'),
        api.get('/users'),
        api.get('/guests'),
      ]);
      setMessages(msgRes.data);
      const userContacts = usersRes.data
        .filter(u => u.id !== user.id)
        .map(u => ({ id: u.id, name: u.name, type: 'staff', role: u.role, color: u.avatar_color }));
      const guestContacts = guestsRes.data
        .map(g => ({ id: g.id, name: `${g.first_name} ${g.last_name}`, type: 'guest', role: 'Huésped' }));
      setContacts([...userContacts, ...guestContacts]);

      // Group by thread_id
      const threadMap = {};
      msgRes.data.forEach(m => {
        if (!threadMap[m.thread_id] || new Date(m.created_at) > new Date(threadMap[m.thread_id].created_at)) {
          threadMap[m.thread_id] = m;
        }
      });
      setThreads(Object.values(threadMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (e) {}
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selectedThread, messages]);

  const threadMessages = selectedThread
    ? messages.filter(m => m.thread_id === selectedThread.thread_id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  const unreadInThread = (threadId) => messages.filter(m => m.thread_id === threadId && m.receiver_id === user.id && !m.is_read).length;

  const getContactName = (msg) => {
    if (msg.sender_id === user.id) return `A: ${msg.receiver_name}`;
    return msg.sender_name;
  };

  const handleSelectThread = async (thread) => {
    setSelectedThread(thread);
    setAiSuggestion('');
    setAiSummary('');
    // Mark unread messages as read
    const unread = messages.filter(m => m.thread_id === thread.thread_id && m.receiver_id === user.id && !m.is_read);
    for (const m of unread) {
      try { await api.patch(`/messages/${m.id}/read`); } catch (e) {}
    }
    setMessages(prev => prev.map(m =>
      m.thread_id === thread.thread_id && m.receiver_id === user.id ? { ...m, is_read: true } : m
    ));
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSendLoading(true);
    try {
      const otherPerson = selectedThread.sender_id === user.id ? selectedThread.receiver_id : selectedThread.sender_id;
      await api.post('/messages', {
        receiver_id: otherPerson,
        content: replyText,
        thread_id: selectedThread.thread_id,
        parent_id: selectedThread.id,
        message_type: selectedThread.message_type,
      });
      setReplyText('');
      setAiSuggestion('');
      fetchAll();
    } catch (e) { toast.error('Error al enviar mensaje'); }
    finally { setSendLoading(false); }
  };

  const handleNewMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.receiver_id || !newMsg.content) { toast.error('Selecciona destinatario y escribe un mensaje'); return; }
    setSendLoading(true);
    try {
      const selectedContact = contacts.find(c => c.id === newMsg.receiver_id);
      await api.post('/messages', {
        ...newMsg,
        message_type: selectedContact?.type === 'guest' ? 'staff_to_guest' : 'staff_to_staff',
      });
      toast.success('Mensaje enviado');
      setShowNewMsg(false);
      setNewMsg({ receiver_id: '', subject: '', content: '', message_type: 'staff_to_staff' });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setSendLoading(false); }
  };

  const handleAiSuggest = async () => {
    if (!threadMessages.length) return;
    setAiLoading(true);
    try {
      const lastMsg = threadMessages[threadMessages.length - 1].content;
      const res = await api.post('/ai/suggest-reply', { message: lastMsg });
      setAiSuggestion(res.data.suggestion);
    } catch (e) { toast.error('Error con IA'); }
    finally { setAiLoading(false); }
  };

  const handleAiSummarize = async () => {
    if (!threadMessages.length) return;
    setSummaryLoading(true);
    try {
      const texts = threadMessages.map(m => `${m.sender_name}: ${m.content}`);
      const res = await api.post('/ai/summarize', { messages: texts });
      setAiSummary(res.data.summary);
    } catch (e) { toast.error('Error con IA'); }
    finally { setSummaryLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>Inbox</h1>
          <p className="text-sm text-slate-500">Mensajería interna y comunicación con huéspedes</p>
        </div>
        <button data-testid="new-message-btn" onClick={() => setShowNewMsg(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95">
          <Plus size={16} /> Nuevo Mensaje
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: '70vh' }}>
        <div className="flex h-full">
          {/* Left Panel - Thread List */}
          <div className="w-72 border-r border-slate-200 flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversaciones</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <MessageSquare size={32} strokeWidth={1} className="mb-2" />
                  <p className="text-sm">No hay mensajes</p>
                </div>
              ) : threads.map(t => {
                const unread = unreadInThread(t.thread_id);
                const isSelected = selectedThread?.thread_id === t.thread_id;
                return (
                  <div key={t.thread_id} data-testid={`thread-${t.thread_id}`}
                    onClick={() => handleSelectThread(t)}
                    className={`px-4 py-3 cursor-pointer border-b border-slate-50 transition-colors ${isSelected ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                          {getContactName(t).charAt(getContactName(t).indexOf(':') + 2) || getContactName(t).charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{getContactName(t)}</p>
                          {t.subject && <p className="text-xs text-slate-500 truncate">{t.subject}</p>}
                          <p className="text-xs text-slate-400 truncate">{t.content.substring(0, 45)}...</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <p className="text-xs text-slate-400">{formatTime(t.created_at)}</p>
                        {unread > 0 && (
                          <span className="bg-emerald-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{unread}</span>
                        )}
                        {t.message_type === 'staff_to_guest' && (
                          <span className="bg-violet-100 text-violet-600 text-xs px-1 rounded">Huésped</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel - Conversation */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedThread ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <MessageSquare size={48} strokeWidth={1} className="mb-3" />
                <p className="text-sm font-medium">Selecciona una conversación</p>
                <p className="text-xs mt-1">o crea un nuevo mensaje</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {selectedThread.sender_id === user.id ? selectedThread.receiver_name : selectedThread.sender_name}
                    </p>
                    {selectedThread.subject && <p className="text-xs text-slate-500">{selectedThread.subject}</p>}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${selectedThread.message_type === 'staff_to_guest' ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600'}`}>
                      {selectedThread.message_type === 'staff_to_guest' ? 'Huésped' : 'Personal'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button data-testid="ai-summarize-btn" onClick={handleAiSummarize} disabled={summaryLoading}
                      className="flex items-center gap-1 px-3 py-1.5 text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
                      <Sparkles size={12} /> {summaryLoading ? 'Resumiendo...' : 'Resumir IA'}
                    </button>
                  </div>
                </div>

                {/* AI Summary */}
                {aiSummary && (
                  <div className="mx-4 mt-3 ai-card rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className="text-violet-600" />
                      <span className="text-xs font-semibold text-violet-700">Resumen IA</span>
                    </div>
                    <p className="text-xs text-slate-700">{aiSummary}</p>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {threadMessages.map(m => {
                    const isMe = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`} data-testid={`message-${m.id}`}>
                        <div className={`max-w-xs lg:max-w-md ${isMe ? 'order-2' : 'order-1'}`}>
                          <div className={`rounded-2xl px-4 py-2.5 ${isMe ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                            {!isMe && <p className="text-xs font-semibold mb-1 text-emerald-700">{m.sender_name}</p>}
                            <p className="text-sm">{m.content}</p>
                          </div>
                          <p className={`text-xs text-slate-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>{formatTime(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* AI Suggestion */}
                {aiSuggestion && (
                  <div className="mx-4 mb-2 ai-card rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <Sparkles size={12} className="text-violet-600" />
                        <span className="text-xs font-semibold text-violet-700">Sugerencia IA</span>
                      </div>
                      <button onClick={() => setReplyText(aiSuggestion)} className="text-xs text-violet-600 font-semibold hover:underline">Usar</button>
                    </div>
                    <p className="text-xs text-slate-600">{aiSuggestion}</p>
                  </div>
                )}

                {/* Reply Box */}
                <div className="px-4 py-3 border-t border-slate-100">
                  <div className="flex gap-2">
                    <textarea data-testid="reply-input" value={replyText} onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                      placeholder="Escribe un mensaje... (Enter para enviar)"
                      rows={2} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none" />
                    <div className="flex flex-col gap-1">
                      <button data-testid="ai-suggest-btn" onClick={handleAiSuggest} disabled={aiLoading}
                        className="p-2 text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors disabled:opacity-50" title="Sugerir respuesta con IA">
                        <Sparkles size={16} />
                      </button>
                      <button data-testid="send-reply-btn" onClick={handleReply} disabled={sendLoading || !replyText.trim()}
                        className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50">
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* New Message Modal */}
      {showNewMsg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" data-testid="new-message-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Nuevo Mensaje</h2>
              <button onClick={() => setShowNewMsg(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleNewMessage} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Para *</label>
                <select data-testid="select-receiver" value={newMsg.receiver_id}
                  onChange={e => setNewMsg({ ...newMsg, receiver_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                  <option value="">Seleccionar destinatario</option>
                  <optgroup label="Personal del Hotel">
                    {contacts.filter(c => c.type === 'staff').map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Huéspedes">
                    {contacts.filter(c => c.type === 'guest').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Asunto</label>
                <input value={newMsg.subject} onChange={e => setNewMsg({ ...newMsg, subject: e.target.value })}
                  placeholder="Asunto del mensaje..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje *</label>
                <textarea data-testid="new-message-content" value={newMsg.content}
                  onChange={e => setNewMsg({ ...newMsg, content: e.target.value })}
                  rows={4} placeholder="Escribe tu mensaje..." required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewMsg(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={sendLoading} data-testid="send-new-message-btn"
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60">
                  <Send size={14} /> {sendLoading ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
