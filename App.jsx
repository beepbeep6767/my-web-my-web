import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { BookOpen, MessageCircle, Users, LogOut, Camera } from 'lucide-react';
import { api, uploadFile } from './api.js';
import { Brand, Avatar, Empty, ErrorNotice } from './components/Shared.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Feed from './components/Feed.jsx';
import Friends from './components/Friends.jsx';
export default function App() {
  const [user, setUser] = useState(null), [booting, setBooting] = useState(true), [view, setView] = useState('feed'), [conversations, setConversations] = useState([]), [friendships, setFriendships] = useState([]), [selected, setSelected] = useState(null), [socket, setSocket] = useState(null), [connected, setConnected] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(false), [profileBusy, setProfileBusy] = useState(false);
  useEffect(() => { const unauthenticated = () => { setUser(null); setConversations([]); setFriendships([]); setSelected(null); }; window.addEventListener('mnchat:unauthenticated', unauthenticated); api('/auth/me').then(data => setUser(data.user)).catch(error => { if (!error.message.includes('sign in')) setError(error.message); }).finally(() => setBooting(false)); return () => window.removeEventListener('mnchat:unauthenticated', unauthenticated); }, []);
  const refresh = useCallback(async () => { const results = await Promise.allSettled([api('/conversations'), api('/friends')]); if (results[0].status === 'fulfilled') setConversations(results[0].value.conversations); if (results[1].status === 'fulfilled') setFriendships(results[1].value.friendships); const failed = results.find(r => r.status === 'rejected'); if (failed) setError(failed.reason.message); }, []);
  useEffect(() => {
    if (!user) return;
    setLoading(true); refresh().finally(() => setLoading(false));
    const connection = io({ withCredentials: true }); setSocket(connection);
    connection.on('connect', () => { setConnected(true); refresh(); });
    connection.on('disconnect', reason => { setConnected(false); if (reason === 'io server disconnect') api('/auth/me').then(() => connection.connect()).catch(() => {}); });
    connection.on('connect_error', () => { setConnected(false); });
    connection.on('message:new', refresh); connection.on('messages:read', refresh); connection.on('friends:updated', refresh);
    const interval = setInterval(refresh, 30000);
    return () => { clearInterval(interval); connection.removeAllListeners(); connection.disconnect(); setSocket(null); setConnected(false); };
  }, [user?.id, refresh]);
  function openConversation(conversation) { setSelected(conversation); setView('messages'); setError(''); }
  function openFriend(friendship) { openConversation({ id: friendship.conversationId, user: friendship.user }); }
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); setUser(null); setSelected(null); setConversations([]); setFriendships([]); setError(''); } catch (error) { setError(error.message); } }
  async function profile(event) { const file = event.target.files[0]; event.target.value = ''; if (!file) return; setProfileBusy(true); try { const media = await uploadFile(file); setUser((await api('/auth/profile', { method: 'PATCH', body: { avatarId: media.id } })).user); } catch (error) { setError(error.message); } finally { setProfileBusy(false); } }
  if (booting) return <div className="boot-screen"><Brand/><p>Opening your space…</p></div>;
  if (!user) return <AuthScreen initialError={error} onAuthenticated={(user, notice) => { setUser(user); setView('feed'); setError(notice || ''); }}/>;
  const requests = friendships.filter(f => f.status === 'PENDING' && f.incoming).length;
  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  return <div className={`app view-${view} ${selected && view === 'messages' ? 'has-chat' : ''}`}><header className="topbar"><Brand/><nav aria-label="Main navigation">{[{ id: 'feed', label: 'School feed', Icon: BookOpen, count: 0 }, { id: 'messages', label: 'Messages', Icon: MessageCircle, count: unread }, { id: 'friends', label: 'Friends', Icon: Users, count: requests }].map(({ id, label, Icon, count }) => <button key={id} aria-current={view === id ? 'page' : undefined} className={view === id ? 'active' : ''} onClick={() => { setView(id); if (id === 'messages') setSelected(null); }}><Icon size={19}/><span>{label}</span>{count > 0 && <b className="nav-count">{count > 99 ? '99+' : count}</b>}</button>)}</nav><div className="account"><label className={`account-avatar ${profileBusy ? 'disabled' : ''}`} title="Change profile picture"><Avatar user={user} size="small"/><span className="camera-badge"><Camera size={10}/></span><input type="file" disabled={profileBusy} aria-label="Change profile picture" accept="image/jpeg,image/png,image/webp,image/gif" onChange={profile}/></label><span className="account-name">{user.username}</span><button className="icon-button" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={18}/></button></div></header><div className="connection-status" role="status">{!connected && 'Connecting to live chat…'}</div><div className="workspace"><Sidebar conversations={conversations} selectedId={view === 'messages' ? selected?.id : null} onSelect={openConversation} onFriends={() => setView('friends')} loading={loading}/><main className="workspace-main"><ErrorNotice message={error} onClose={() => setError('')}/>{view === 'feed' && <Feed user={user} socket={socket} friendships={friendships} onFriends={() => setView('friends')} onChat={openFriend}/>} {view === 'friends' && <Friends friendships={friendships} onChanged={refresh} onChat={openFriend}/>} {view === 'messages' && (selected ? <ChatPanel key={selected.id} conversation={conversations.find(c => c.id === selected.id) || selected} user={user} socket={socket} connected={connected} onChanged={refresh} onBack={() => setSelected(null)}/> : <section className="chat-empty"><Empty title="A space to keep in touch">Pick a conversation, or find a friend to start something new.</Empty><button className="primary" onClick={() => setView('friends')}><Users size={18}/> Find a friend</button></section>)}</main></div></div>;
}
