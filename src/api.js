import { feedCutoff } from './feedRetention.js';
import { client, result } from './supabase.js';
export const time = date => date ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(date)) : '';
export const dateTime = date => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const normalizeMessage = m => ({ ...m, media: m.mediaId ? { id: m.mediaId, kind: m.mediaId.includes('/image/') ? 'IMAGE' : 'AUDIO' } : null });
async function currentUser() {
  // RLS and RPCs validate the JWT on the server. Avoid an extra Auth HTTP request per query.
  const { data, error } = await client().auth.getSession();
  if (error || !data.session?.user) throw new Error('Please sign in to continue.');
  return data.session.user;
}
async function profile(id) { return result(client().from('profiles').select('*').eq('id', id).single()); }
async function friendships(uid) {
  const rows = await result(client().from('friendships').select('*,sender:profiles!senderId(*),recipient:profiles!recipientId(*)').neq('status','DECLINED').order('createdAt',{ascending:false}));
  return rows.map(f => ({ ...f, incoming: f.recipientId === uid, user: f.senderId === uid ? f.recipient : f.sender, conversationId: f.status === 'ACCEPTED' ? f.id : null }));
}
export async function api(path, options={}) {
  const db=client(), body=options.body || {}, method=options.method || 'GET';
  if(path === '/auth/signup' || path === '/auth/login') {
    const { data, error } = await db.functions.invoke('mnchat-auth', {
      body: { action: path.endsWith('signup') ? 'signup' : 'login', username: body.username?.trim(), password: body.password },
    });
    if (error) {
      let message = 'เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาลองใหม่อีกครั้ง';
      try { message = (await error.context?.json())?.error || message; } catch { /* Keep safe fallback for gateway failures. */ }
      throw new Error(message);
    }
    if (!data?.access_token || !data?.refresh_token) throw new Error('ระบบไม่ได้ส่งข้อมูลการเข้าสู่ระบบ กรุณาลองใหม่');
    const { data: session, error: sessionError } = await db.auth.setSession(data);
    if (sessionError) throw sessionError;
    return { user: await profile(session.user.id) };
  }
  if(path === '/auth/logout') { const {error}=await db.auth.signOut(); if(error) throw error; return {}; }
  const u=await currentUser();
  if(path === '/auth/me') return {user:await profile(u.id)};
  if(path === '/auth/profile') return {user:await result(db.from('profiles').update({avatarId:body.avatarId}).eq('id',u.id).select().single())};
  const url=new URL(path,'https://mnchat.local'), route=url.pathname;
  if(route === '/friends/search') return {users:await result(db.from('profiles').select('*').neq('id',u.id).ilike('username',`%${(url.searchParams.get('q')||'').replace(/[%_]/g,'')}%`).limit(20))};
  if(route === '/friends' && method === 'GET') return {friendships:await friendships(u.id)};
  if(route === '/friends') { await result(db.from('friendships').insert({senderId:u.id,recipientId:body.userId})); return {}; }
  if(route.startsWith('/friends/')) { await result(db.rpc('mnchat_friend_action',{friend_id:route.split('/')[2],action:method==='DELETE'?'decline':'accept'})); return {}; }
  if(route === '/conversations') {
    const rows = await result(db.rpc('mnchat_inbox'));
    return { conversations: rows.map(row => ({ ...row, lastMessage: row.lastMessage ? normalizeMessage(row.lastMessage) : null })) };
  }
  if(route.startsWith('/conversations/')) {
    let q=db.from('messages').select('*').eq('conversationId',route.split('/')[2]).order('createdAt',{ascending:false}).order('id',{ascending:false}).limit(50);
    const cursor=url.searchParams.get('cursor'); if(cursor) { const c=JSON.parse(decodeURIComponent(cursor)); q=q.or(`createdAt.lt.${c.t},and(createdAt.eq.${c.t},id.lt.${c.id})`); }
    const rows=await result(q), last=rows.at(-1);
    return {messages:rows.map(normalizeMessage).reverse(),nextCursor:rows.length===50?encodeURIComponent(JSON.stringify({t:last.createdAt,id:last.id})):null};
  }
  if(route === '/posts' && method === 'POST') { await result(db.from('posts').insert({authorId:u.id,text:body.text.trim()})); return {}; }
  if(route === '/posts') {
    let q=db.from('posts').select('*,author:profiles!authorId(*),comments(count)').gt('createdAt',feedCutoff()).order('createdAt',{ascending:false}).limit(20);
    if(url.searchParams.get('cursor')) q=q.lt('createdAt',url.searchParams.get('cursor'));
    const rows=await result(q);
    return {posts:await Promise.all(rows.map(async p=>({...p,_count:{comments:p.comments[0].count},comments:await result(db.from('comments').select('*,author:profiles!authorId(*)').eq('postId',p.id).order('createdAt',{ascending:false}).limit(3))}))),nextCursor:rows.length===20?rows.at(-1).createdAt:null};
  }
  if(route.startsWith('/posts/')) {
    const postId=route.split('/')[2];
    if(method==='POST') return {comment:await result(db.from('comments').insert({postId,authorId:u.id,text:body.text.trim()}).select('*,author:profiles!authorId(*)').single())};
    let q=db.from('comments').select('*,author:profiles!authorId(*)').eq('postId',postId).order('createdAt').limit(50);
    if(url.searchParams.get('cursor')) q=q.gt('createdAt',url.searchParams.get('cursor'));
    const rows=await result(q); return {comments:rows,nextCursor:rows.length===50?rows.at(-1).createdAt:null};
  }
  throw new Error('Unsupported operation');
}
export async function uploadFile(file) {
  if(file.size>12*1024*1024) throw new Error('Choose a file smaller than 12 MB.');
  const type=file.type.split(';')[0];
  if(!['image/jpeg','image/png','image/webp','image/gif','audio/webm','video/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a'].includes(type)) throw new Error('Unsupported file type.');
  const u=await currentUser(), path=`${u.id}/${type.startsWith('image/')?'image':'audio'}/${crypto.randomUUID()}`;
  await result(client().storage.from('mnchat-media').upload(path,file,{contentType:type}));
  return {id:path};
}
export async function socketRequest(socket,event,data) {
  if(event==='message:send') return normalizeMessage(await result(client().rpc('mnchat_send',{conversation_id:data.conversationId,client_id:data.clientId,message_text:data.text,media_path:data.mediaId||null})));
  if(event==='messages:read') return result(client().rpc('mnchat_read',{conversation_id:data.conversationId,message_ids:data.messageIds}));
  throw new Error('Unsupported realtime operation');
}
