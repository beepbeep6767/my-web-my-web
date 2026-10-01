import { client } from './supabase.js';
import { normalizeMessage } from './api.js';
// Small event adapter keeps the existing UI while Supabase owns the connection.
export function io() {
  const handlers=new Map();
  let closed=false;
  const emit=(name,value)=>{if(!closed) handlers.get(name)?.forEach(fn=>fn(value));};
  const connection={connected:false,on(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn);return this;},off(name,fn){handlers.get(name)?.delete(fn);},removeAllListeners(){handlers.clear();},disconnect(){closed=true;this.connected=false;client().removeChannel(channel);}};
  const channel=client().channel(`mnchat-${crypto.randomUUID()}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},p=>emit('message:new',normalizeMessage(p.new)))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages'},p=>{emit('messages:read',{conversationId:p.new.conversationId,messageIds:[p.new.id],readAt:p.new.readAt});})
    .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>emit('friends:updated'))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},()=>emit('friends:updated'))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'},()=>emit('feed:updated'))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'comments'},()=>emit('feed:updated'))
    .subscribe(status=>{connection.connected=status==='SUBSCRIBED';emit(connection.connected?'connect':'disconnect',status);});
  return connection;
}
