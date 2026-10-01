import { useEffect,useState } from 'react';
import { client } from '../supabase.js';
export default function Media({id,audio=false,alt='',...props}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{
    let live=true; setUrl('');
    async function load(){const {data,error}=await client().storage.from('mnchat-media').createSignedUrl(id,600);if(live)setUrl(error?'':data.signedUrl);}
    load();const timer=setInterval(load,480000);return ()=>{live=false;clearInterval(timer);};
  },[id]);
  return url ? audio ? <audio src={url} controls preload="metadata" {...props}/> : <img src={url} alt={alt} {...props}/> : <span aria-label="Loading attachment">…</span>;
}
