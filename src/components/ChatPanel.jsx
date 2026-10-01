import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Send, X, Check, CheckCheck, MessageCircle, ShieldCheck } from 'lucide-react';
import { api, uploadFile, socketRequest, time, dateTime } from '../api.js';
import { Avatar, Empty, ErrorNotice } from './Shared.jsx';
import Media from './Media.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';
export default function ChatPanel({ conversation, user, socket, connected, onBack, onChanged }) {
  const [messages, setMessages] = useState([]), [cursor, setCursor] = useState(null), [text, setText] = useState(''), [file, setFile] = useState(null), [preview, setPreview] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const initialized = useRef(false), draft = useRef(null), scroll = useRef(null), visibleIds = useRef(new Set()), reading = useRef(new Set()), readTimer = useRef(null), currentMessages = useRef(messages), stayAtBottom = useRef(true);
  currentMessages.current = messages;
  const id = conversation.id;
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => { draft.current = null; }, [text, file]);
  function merge(rows) { setMessages(old => [...new Map([...old, ...rows].map(m => [m.id, m])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))); }
  async function markVisible() {
    if (document.visibilityState !== 'visible' || !socket?.connected) return;
    const ids = currentMessages.current.filter(m => visibleIds.current.has(m.id) && m.senderId !== user.id && !m.readAt && !reading.current.has(m.id)).map(m => m.id).slice(0, 100);
    if (!ids.length) return;
    ids.forEach(id => reading.current.add(id));
    try { await socketRequest(socket, 'messages:read', { conversationId: id, messageIds: ids }); }
    catch { /* Reconnect and visibility changes retry without claiming a receipt. */ }
    finally { ids.forEach(id => reading.current.delete(id)); }
  }
  useEffect(() => {
    let live = true;
    async function refresh() {
      try { const data = await api(`/conversations/${id}/messages`); if (live) { setMessages(old => {
        const newestIds = new Set(data.messages.map(m => m.id));
        const oldest = data.messages[0]?.createdAt;
        const newest = data.messages.at(-1)?.createdAt;
        const retainedHistory = old.filter(m => oldest && (m.createdAt < oldest || m.createdAt >= newest));
        return [...retainedHistory.filter(m => !newestIds.has(m.id)), ...data.messages];
      }); if (!initialized.current) { setCursor(data.nextCursor); initialized.current = true; } } }
      catch (error) { if (live) setError(error.message); }
      finally { if (live) setLoading(false); }
    }
    function incoming(message) { if (message.conversationId === id) { merge([message]); } }
    function read(receipt) { if (receipt.conversationId === id) { setMessages(old => old.map(m => receipt.messageIds.includes(m.id) ? { ...m, readAt: receipt.readAt } : m)); onChanged(); } }
    refresh(); socket?.on('connect', refresh); socket?.on('message:new', incoming); socket?.on('messages:read', read);
    const interval = setInterval(refresh, 30000);
    return () => { live = false; clearInterval(interval); socket?.off('connect', refresh); socket?.off('message:new', incoming); socket?.off('messages:read', read); };
  }, [id, socket]);
  useEffect(() => {
    visibleIds.current.clear();
    const observer = new IntersectionObserver(entries => { for (const entry of entries) { if (entry.isIntersecting) visibleIds.current.add(entry.target.dataset.messageId); else visibleIds.current.delete(entry.target.dataset.messageId); } clearTimeout(readTimer.current); readTimer.current = setTimeout(markVisible, 180); }, { root: scroll.current, threshold: 0.6 });
    scroll.current?.querySelectorAll('[data-message-id]').forEach(node => observer.observe(node));
    document.addEventListener('visibilitychange', markVisible);
    return () => { observer.disconnect(); clearTimeout(readTimer.current); document.removeEventListener('visibilitychange', markVisible); };
  }, [messages, socket, connected]);
  useEffect(() => { if (stayAtBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, loading, preview]);
  async function older() {
    setLoadingMore(true); stayAtBottom.current = false;
    const previousHeight = scroll.current.scrollHeight;
    try { const data = await api(`/conversations/${id}/messages?cursor=${cursor}`); merge(data.messages); setCursor(data.nextCursor); requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight - previousHeight; }); }
    catch (error) { setError(error.message); } finally { setLoadingMore(false); }
  }
  function chooseFile(selected) { if (selected?.size > 12 * 1024 * 1024) return setError('Choose a file smaller than 12 MB.'); setFile(selected || null); setError(''); }
  async function send(event) {
    event.preventDefault(); if ((!text.trim() && !file) || sending) return;
    setSending(true); setError('');
    try {
      // Retain identifiers and uploaded attachment across retries after lost acknowledgments.
      if (!draft.current) draft.current = { clientId: crypto.randomUUID(), text: text.trim() };
      if (file && !draft.current.mediaId) draft.current.mediaId = (await uploadFile(file)).id;
      const message = await socketRequest(socket, 'message:send', { ...draft.current, conversationId: id });
      merge([message]); stayAtBottom.current = true; setText(''); setFile(null); draft.current = null; onChanged();
    } catch (error) { setError(error.message); } finally { setSending(false); }
  }
  return <section className="chat-panel"><header className="chat-header"><button className="icon-button mobile-back" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={21}/></button><Avatar user={conversation.user}/><div><h2>{conversation.user.username}</h2><span className="muted">Your conversation</span></div><span className="chat-private"><ShieldCheck size={16}/> Friends only</span></header><div className="messages-scroll" ref={scroll} onScroll={() => { const el = scroll.current; stayAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }}><div className="chat-start"><Avatar user={conversation.user} size="large"/><h3>{conversation.user.username}</h3><p>A good conversation starts with hello.</p></div>{cursor && <button className="text-button load-more" disabled={loadingMore} onClick={older}>{loadingMore ? 'Loading…' : 'Load older messages'}</button>}{loading ? <p className="loading">Loading your conversation…</p> : messages.length === 0 ? <Empty icon={MessageCircle} title="Break the ice">Ask a question, share an idea, or just say hi.</Empty> : messages.map((message, index) => {
    const mine = message.senderId === user.id;
    const showDate = index === 0 || new Date(messages[index - 1].createdAt).toDateString() !== new Date(message.createdAt).toDateString();
    return <div key={message.id}>{showDate && <div className="day-divider">{new Date(message.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>}<article className={`message-row ${mine ? 'mine' : ''}`} data-message-id={message.id}>{!mine && <Avatar user={conversation.user} size="small"/>}<div className="message-body"><div className={`message-bubble ${message.media ? 'has-media' : ''}`}>{message.media?.kind === 'IMAGE' && <span><Media id={message.media.id} alt="Shared image" loading="lazy" onLoad={() => { if (stayAtBottom.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }}/></span>}{message.media?.kind === 'AUDIO' && <Media audio id={message.media.id} aria-label="Voice message"/>}{message.text && <p>{message.text}</p>}</div><div className="message-meta"><time title={dateTime(message.createdAt)}>{time(message.createdAt)}</time>{mine && <span title={message.readAt ? `Read ${dateTime(message.readAt)}` : 'Sent · unread'}>{message.readAt ? <><CheckCheck size={14}/> Read</> : <><Check size={14}/> Sent</>}</span>}</div></div></article></div>;
  })}</div><div className="chat-compose-area"><ErrorNotice message={error} onClose={() => setError('')}/>{preview && <div className="attachment-preview">{file?.type.startsWith('image/') ? <img src={preview} alt="Attachment preview"/> : <audio src={preview} controls/>}<button className="icon-button" disabled={sending} onClick={() => setFile(null)} aria-label="Remove attachment"><X size={18}/></button><small>{file.name}</small></div>}<form className="message-composer" onSubmit={send}><label className={`icon-button upload-button ${sending ? 'disabled' : ''}`} title="Attach an image or audio file" aria-label="Attach an image or audio file"><ImagePlus size={21}/><input type="file" disabled={sending} accept="image/jpeg,image/png,image/webp,image/gif,audio/*,.webm,.m4a" onChange={e => { chooseFile(e.target.files[0]); e.target.value = ''; }}/></label><VoiceRecorder disabled={sending || !!file} onRecorded={chooseFile} onError={setError}/><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write a message…" aria-label="Message" rows={1} maxLength={4000} disabled={sending} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}/><button className="send-button" aria-label="Send message" disabled={sending || !connected || (!text.trim() && !file)}><Send size={20}/></button></form><p className="composer-note">{sending ? 'Sending…' : !connected ? 'Reconnecting… your draft is still here.' : 'Messages are saved securely. Keep the conversation kind.'}</p></div></section>;
}


