import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Send, MessageCircle, BookOpen, Sparkles, Users, HeartHandshake } from 'lucide-react';
import { activePosts } from '../feedRetention.js';
import { refreshQueue } from '../refreshQueue.js';
import { api, dateTime } from '../api.js';
import { Avatar, Empty, ErrorNotice } from './Shared.jsx';
function PostCard({ post, user, onError, onUpdated }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(false), [comments, setComments] = useState(post.comments), [cursor, setCursor] = useState(null), [loading, setLoading] = useState(false);
  const previousCount = useRef(post._count.comments);
  useEffect(() => { if (!expanded) setComments(post.comments); }, [post.comments, expanded]);
  useEffect(() => {
    const changed = previousCount.current !== post._count.comments;
    previousCount.current = post._count.comments;
    if (!expanded || !changed) return;
    let live = true;
    api(`/posts/${post.id}/comments`).then(data => {
      if (live) { setComments(data.comments); setCursor(data.nextCursor); }
    }).catch(error => { if (live) onError(error.message); });
    return () => { live = false; };
  }, [post.id, post._count.comments, expanded, onError]);
  async function loadComments(append = false) { setLoading(true); try { const data = await api(`/posts/${post.id}/comments${append && cursor ? `?cursor=${cursor}` : ''}`); setComments(old => append ? [...new Map([...old, ...data.comments].map(c => [c.id, c])).values()] : data.comments); setCursor(data.nextCursor); setExpanded(true); } catch (error) { onError(error.message); } finally { setLoading(false); } }
  async function comment(event) {
    event.preventDefault(); if (!text.trim()) return; setBusy(true);
    try { const { comment } = await api(`/posts/${post.id}/comments`, { method: 'POST', body: { text } }); setText(''); if (expanded) { setComments(old => [...new Map([...old, comment].map(c => [c.id, c])).values()]); } onUpdated(); }
    catch (error) { onError(error.message); } finally { setBusy(false); }
  }
  return <article className="post-card card"><header className="post-header"><Avatar user={post.author}/><div><strong>{post.author.username}</strong><time title={dateTime(post.createdAt)}>{dateTime(post.createdAt)}</time></div><span className="post-audience"><Users size={14}/> Community</span></header><p className="post-text">{post.text}</p><div className="post-stats"><MessageCircle size={17}/><span>{post._count.comments} {post._count.comments === 1 ? 'reply' : 'replies'}</span></div><div className="comments">{comments.map(comment => <div className="comment" key={comment.id}><Avatar user={comment.author} size="small"/><div className="comment-content"><div className="comment-bubble"><strong>{comment.author.username}</strong><p>{comment.text}</p></div><time title={dateTime(comment.createdAt)}>{dateTime(comment.createdAt)}</time></div></div>)}{!expanded && post._count.comments > 3 && <button className="text-button" disabled={loading} onClick={() => loadComments()}>{loading ? 'Loading…' : 'View all replies'}</button>}{expanded && cursor && <button className="text-button" disabled={loading} onClick={() => loadComments(true)}>{loading ? 'Loading…' : 'Load more replies'}</button>}</div><form className="comment-form" onSubmit={comment}><Avatar user={user} size="small"/><label className="comment-input"><input value={text} onChange={e => setText(e.target.value)} placeholder="Share a helpful reply…" aria-label={`Reply to ${post.author.username}'s post`} maxLength={2000} required disabled={busy}/><button className="icon-button" disabled={busy || !text.trim()} aria-label="Send reply"><Send size={17}/></button></label></form></article>;
}
export default function Feed({ user, socket, friendships, onFriends, onChat }) {
  const [posts, setPosts] = useState([]), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [cursor, setCursor] = useState(null), [loadingMore, setLoadingMore] = useState(false);
  const initialized = useRef(false);
  const load = useCallback(async () => { try { const data = await api('/posts'); setPosts(old => { const updated = new Map(data.posts.map(p => [p.id, p])); return activePosts([...data.posts, ...old.filter(p => !updated.has(p.id) && p.createdAt < (data.posts.at(-1)?.createdAt || ''))]); }); if (!initialized.current) { setCursor(data.nextCursor); initialized.current = true; } } catch (error) { setError(error.message); } finally { setLoading(false); } }, []);
  useEffect(() => {
    load();
    const schedule = refreshQueue(load);
    const visibleRefresh = () => { if (document.visibilityState === 'visible') schedule(); };
    socket?.on('feed:updated', schedule); socket?.on('connect', schedule);
    document.addEventListener('visibilitychange', visibleRefresh);
    const interval = setInterval(visibleRefresh, 60000 + Math.random() * 10000);
    return () => { schedule.stop(); socket?.off('feed:updated', schedule); socket?.off('connect', schedule); clearInterval(interval); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [load, socket]);
  useEffect(() => {
    const prune = () => setPosts(old => activePosts(old));
    const timer = setInterval(prune, 1000);
    window.addEventListener('focus', prune);
    document.addEventListener('visibilitychange', prune);
    return () => { clearInterval(timer); window.removeEventListener('focus', prune); document.removeEventListener('visibilitychange', prune); };
  }, []);
  async function publish(event) { event.preventDefault(); if (!text.trim()) return; setError(''); setBusy(true); try { await api('/posts', { method: 'POST', body: { text } }); setText(''); await load(); } catch (error) { setError(error.message); } finally { setBusy(false); } }
  async function more() { setLoadingMore(true); try { const data = await api(`/posts?cursor=${cursor}`); setPosts(old => activePosts([...new Map([...old, ...data.posts].map(p => [p.id, p])).values()])); setCursor(data.nextCursor); } catch (error) { setError(error.message); } finally { setLoadingMore(false); } }
  const friends = friendships.filter(f => f.status === 'ACCEPTED');
  const requests = friendships.filter(f => f.status === 'PENDING' && f.incoming);
  return <div className="feed-page"><div className="feed-main"><section className="feed-cover"><span className="feed-decoration" aria-hidden="true"><img src="/ochat-mark.svg" alt=""/></span><div><span className="eyebrow">THE COMMUNITY BOARD</span><h1>Fresh thoughts.<br/><em>Shared here.</em></h1><p>แบ่งปันไอเดีย ถามเรื่องที่สงสัย หรือแวะมาทักทาย</p></div></section><form className="post-composer card" onSubmit={publish}><div className="post-compose-top"><Avatar user={user}/><textarea value={text} onChange={e => setText(e.target.value)} placeholder={`What’s on your mind, ${user.username}?`} aria-label="Write a post" maxLength={4000} rows={2} required disabled={busy}/></div><div className="post-compose-bottom"><span><BookOpen size={17}/> Every question is welcome.</span><button className="primary small-button" disabled={busy || !text.trim()}>{busy ? 'Sharing…' : 'Share a post'}<ArrowUpRight size={16}/></button></div></form><ErrorNotice message={error} onClose={() => setError('')}/><div className="feed-label"><h2>Community notes</h2><span>โพสต์และความคิดเห็นจะถูกลบเมื่อโพสต์ครบ 2 ชั่วโมง</span></div>{loading ? <p className="loading">Loading the school feed…</p> : posts.length === 0 ? <div className="card"><Empty icon={Sparkles} title="Be the first to share">Got a question from class? A useful study tip? This is your space.</Empty></div> : posts.map(post => <PostCard key={post.id} post={post} user={user} onError={setError} onUpdated={load}/>)}{cursor && <button className="secondary load-more" disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Load more posts'}</button>}</div><aside className="feed-aside"><section className="card circle-card"><div className="section-heading"><h2>Your people</h2><Users size={19}/></div>{friends.length ? friends.slice(0, 5).map(f => <button key={f.id} className="circle-person" onClick={() => onChat(f)}><Avatar user={f.user} size="small"/><strong>{f.user.username}</strong><MessageCircle size={16}/></button>) : <p className="muted">A familiar face makes a good place to start.</p>}<button className="text-button" onClick={onFriends}>Find classmates <ArrowUpRight size={15}/></button></section>{requests.length > 0 && <button className="request-card" onClick={onFriends}><UserRequestIcon/><strong>{requests.length} friend {requests.length === 1 ? 'request' : 'requests'}</strong><span>Someone wants to connect.</span></button>}<section className="kind-card"><span className="kind-icon"><HeartHandshake size={24}/></span><h3>Good things<br/>grow together.</h3><p>A thoughtful answer can make someone’s day. Keep this a kind place to learn.</p><span className="kind-footer">A COMMUNITY THAT CARES</span></section><p className="sidebar-footnote">OCHAT / OPEN CONVERSATIONS</p></aside></div>;
}
function UserRequestIcon() { return <Users size={23}/>; }
