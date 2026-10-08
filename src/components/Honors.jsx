import { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy, Upload, Check, ShieldCheck } from 'lucide-react';
import { client, result } from '../supabase.js';
import { honorPage, submitHonor, validateHonorImage, watchHonors } from '../honors.js';
import { ErrorNotice } from './Shared.jsx';
import Media from './Media.jsx';
import '../honors.css';

export function HonorLeaderboard({ user }) {
  const [rows, setRows] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(null);
  const running = useRef(false), live = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const data = await result(client().rpc('mnchat_honor_leaderboard'));
      if (live.current) { setRows(data); setError(''); setUpdated(new Date()); }
    } catch { if (live.current) setError('โหลดอันดับไม่ได้ กรุณาลองใหม่'); }
    finally { running.current = false; if (live.current) setLoading(false); }
  }, []);
  useEffect(() => { live.current = true; refresh(); const stop = watchHonors('honor_scores', refresh); return () => { live.current = false; stop(); }; }, [refresh]);
  return <section className="honors-page"><div className="honors-cover"><Trophy size={38}/><span className="eyebrow">HALL OF HONOR</span><h1>อันดับเกียรติยศ</h1><p>หนึ่งการช่วยเหลือที่ได้รับการอนุมัติ = 1P</p></div>
    <div className="honors-heading"><h2>50 อันดับผู้ช่วยเหลือเพื่อน</h2><button className="secondary" onClick={refresh}>รีเฟรช</button></div>
    <p className="honors-note">คะแนนสะสมสูงสุดเป็นผู้นำ คะแนนเท่ากันได้อันดับร่วม ตารางแสดงสูงสุด 50 คน</p>
    <ErrorNotice message={error}/>{loading && <p role="status">กำลังโหลดอันดับ…</p>}
    {!loading && !error && !rows.length && <div className="card honors-empty">ยังไม่มีคะแนน ส่งผลงานการช่วยเหลือเพื่อนเพื่อเริ่มสะสม P</div>}
    {!!rows.length && <div className="card honors-ranking"><table><thead><tr><th scope="col">อันดับ</th><th scope="col">สมาชิก</th><th scope="col">คะแนน P</th></tr></thead><tbody>{rows.map(row => <tr key={row.user_id} className={row.user_id === user?.id ? 'honor-me' : ''}><td>{Number(row.position) === 1 ? <Trophy size={20} aria-label="ผู้นำ"/> : null} {row.position}</td><td>{row.username}{row.user_id === user?.id && <small> · คุณ</small>}</td><td><strong>{row.points}P</strong></td></tr>)}</tbody></table></div>}
    {updated && <p className="honors-note">อัปเดต {updated.toLocaleTimeString('th-TH')} · รับคะแนนผ่าน Realtime และตรวจซ้ำทุก 15 วินาที</p>}
  </section>;
}

function HonorForm({ onSubmitted }) {
  const [caption, setCaption] = useState(''), [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const draft = useRef(null), locked = useRef(false), input = useRef(null);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function select(event) {
    const selected = event.target.files?.[0]; if (!selected) return;
    try { validateHonorImage(selected); setFile(selected); draft.current = null; setError(''); setNotice(''); }
    catch (e) { event.target.value = ''; setError(e.message); }
  }
  async function submit(event) {
    event.preventDefault(); if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (!draft.current) draft.current = { id: crypto.randomUUID(), caption, file, imagePath: null };
      await submitHonor(draft.current);
      draft.current = null; setCaption(''); setFile(null); if (input.current) input.current.value = '';
      setNotice('ส่งผลงานแล้ว รอแอดมินตรวจสอบ เมื่ออนุมัติจะได้รับ 1P'); onSubmitted();
    } catch (e) { setError(e.message || 'ส่งไม่สำเร็จ กรุณาลองใหม่'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <form className="card honors-form" onSubmit={submit}><h2><Upload size={21}/> ส่งรูปผลงาน</h2><p>แนบรูปการช่วยเหลือเพื่อนและอธิบายสิ่งที่ทำ รูปจะมองเห็นได้เฉพาะคุณและผู้ดูแล</p>
    <ErrorNotice message={error}/>{notice && <p role="status" className="school-notice">{notice}</p>}
    <fieldset disabled={busy}><label htmlFor="honor-picture">รูปผลงาน (ไม่เกิน 12 MB)</label><input ref={input} id="honor-picture" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={select} required/>
      {preview && <img className="honor-preview" src={preview} alt="รูปผลงานที่เลือก"/>}
      <label htmlFor="honor-caption">คุณช่วยเหลือเพื่อนอย่างไร</label><textarea id="honor-caption" value={caption} onChange={e => { setCaption(e.target.value); draft.current = null; }} minLength={3} maxLength={2000} required rows={4} placeholder="อธิบายกิจกรรมและสิ่งที่คุณช่วยเหลือเพื่อน…"/>
      <button className="primary" disabled={busy || !file}>{busy ? 'กำลังส่ง…' : 'ส่งให้แอดมินตรวจสอบ'}</button></fieldset>
  </form>;
}

function ReviewCode({ onUnlocked }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function unlock(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const { error: failure } = await client().functions.invoke('mnchat-honor-unlock', { body: { code } });
      if (failure) {
        let message = 'ตรวจรหัสไม่สำเร็จ กรุณาลองใหม่';
        try { message = (await failure.context?.json())?.error || message; } catch { /* gateway fallback */ }
        throw new Error(message);
      }
      if (!await result(client().rpc('mnchat_honor_can_review'))) throw new Error('ยังไม่มีสิทธิ์อนุมัติ กรุณาลองใหม่');
      onUnlocked();
    } catch (e) { setError(e.message); }
    finally { setCode(''); setBusy(false); }
  }
  return <form className="card honors-form" onSubmit={unlock}><h2>เข้าส่วนอนุมัติผลงาน</h2><p>กรอกรหัสแอดมินเพื่อเปิดสิทธิ์ตรวจรูปและให้คะแนน 15 นาที รหัสนี้ไม่ใช่รหัสผ่าน Gmail</p><ErrorNotice message={error}/><fieldset disabled={busy}><label htmlFor="honor-review-code">รหัสแอดมิน</label><input id="honor-review-code" type="password" autoComplete="off" value={code} maxLength={128} required onChange={e => setCode(e.target.value)}/><button className="primary" disabled={busy}>{busy ? 'กำลังตรวจรหัส…' : 'เปิดส่วนอนุมัติ'}</button></fieldset></form>;
}

export function HonorSubmissions({ reviewOnly = false }) {
  const [mode, setMode] = useState(reviewOnly ? 'review' : 'submit');
  const [canReview, setCanReview] = useState(false);
  const [rows, setRows] = useState([]), [more, setMore] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [approving, setApproving] = useState(null);
  const live = useRef(false), generation = useRef(0), running = useRef(null), paging = useRef(false), cursor = useRef(null), approvingRef = useRef(false);
  const refresh = useCallback(async (append = false) => {
    if ((mode === 'review' && !canReview) || running.current === generation.current) return;
    const current = generation.current; running.current = current; setBusy(true); setError('');
    try {
      const data = await honorPage({ admin: mode === 'review', after: append ? cursor.current : null });
      if (!live.current || current !== generation.current) return;
      setRows(old => append ? [...new Map([...old, ...data].map(row => [row.id, row])).values()] : data);
      cursor.current = data.at(-1)?.id || null; paging.current = append; setMore(data.length === 20);
    } catch { if (live.current && current === generation.current) { setRows([]); setMore(false); setError('อ่านผลงานไม่ได้ กรุณาตรวจการเชื่อมต่อและสิทธิ์ผู้ดูแล'); } }
    finally { if (running.current === current) running.current = null; if (live.current && current === generation.current) setBusy(false); }
  }, [canReview, mode]);
  useEffect(() => {
    if (mode !== 'review') return;
    let active = true;
    async function check() {
      try { const allowed = await result(client().rpc('mnchat_honor_can_review')); if (active) setCanReview(allowed === true); }
      catch { if (active) setCanReview(false); }
    }
    check(); const timer = setInterval(check, 15000);
    window.addEventListener('focus', check);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, [mode]);
  async function lock() {
    try { await result(client().rpc('mnchat_honor_lock')); setCanReview(false); }
    catch { setError('ล็อกส่วนอนุมัติไม่สำเร็จ กรุณาลองใหม่'); }
  }
  useEffect(() => {
    live.current = true; generation.current++; cursor.current = null; paging.current = false; setRows([]); setMore(false); setError(''); setNotice('');
    refresh();
    const stop = watchHonors('honor_submissions', () => !paging.current && refresh());
    return () => { live.current = false; generation.current++; stop(); };
  }, [refresh]);
  async function approve(id) {
    if (approvingRef.current) return;
    approvingRef.current = true; setApproving(id); setError(''); setNotice('');
    try {
      const awarded = await result(client().rpc('mnchat_honor_approve', { submission_id: id }));
      if (!live.current) return;
      setRows(old => old.filter(row => row.id !== id));
      setNotice(awarded ? 'อนุมัติแล้ว ผู้ส่งได้รับ 1P' : 'ผลงานนี้ได้รับคะแนนแล้ว ระบบไม่เพิ่มซ้ำ');
    } catch { if (live.current) setError('อนุมัติไม่สำเร็จ กรุณาลองใหม่ ระบบจะไม่ให้คะแนนซ้ำ'); }
    finally { approvingRef.current = false; if (live.current) setApproving(null); }
  }
  return <section className="honors-page"><div className="honors-heading"><div><span className="eyebrow">HELP EACH OTHER</span><h1>{reviewOnly ? 'อนุมัติผลงานเกียรติยศ' : 'ส่งผลงาน'}</h1></div><ShieldCheck size={30}/></div>
    {!reviewOnly && <div className="honors-tabs"><button className={mode === 'submit' ? 'primary' : 'secondary'} onClick={() => setMode('submit')}>ส่งรูปผลงาน</button><button className={mode === 'review' ? 'primary' : 'secondary'} onClick={() => setMode('review')}>อนุมัติผลงาน</button></div>}
    {mode === 'review' && !canReview ? <ReviewCode onUnlocked={() => setCanReview(true)}/> : <>
      {mode === 'review' && <button className="secondary" onClick={lock}>ล็อกส่วนอนุมัติ</button>}
      {mode === 'submit' && <HonorForm onSubmitted={() => refresh()}/>}
      <div className="honors-heading"><h2>{mode === 'review' ? 'ผลงานรอตรวจสอบ' : 'ผลงานของฉัน'}</h2><button className="secondary" disabled={busy} onClick={() => refresh()}>รีเฟรชรายการ</button></div>
      <ErrorNotice message={error}/>{notice && <p className="school-notice" role="status">{notice}</p>}
      {busy && <p role="status">กำลังโหลดผลงาน…</p>}{!rows.length && !busy && !error && <p>ยังไม่มีผลงานในรายการนี้</p>}
      <div className="honors-grid">{rows.map(row => <article className="card honor-entry" key={row.id}><Media id={row.image_path} alt={`ผลงานของ ${row.author?.username || 'สมาชิก'}`}/><div><strong>{row.author?.username}</strong><time>{new Date(row.created_at).toLocaleString('th-TH')}</time><p>{row.caption}</p>{row.approved_at ? <span className="honor-approved"><Check size={16}/> อนุมัติแล้ว · +1P</span> : mode === 'review' ? <button className="primary" disabled={!!approving} onClick={() => approve(row.id)}><Check size={18}/>{approving === row.id ? 'กำลังอนุมัติ…' : 'อนุมัติ +1P'}</button> : <span className="honors-note">รอแอดมินตรวจสอบ</span>}</div></article>)}</div>
      {more && <button className="secondary" disabled={busy} onClick={() => refresh(true)}>โหลดผลงานเพิ่ม</button>}
      <p className="honors-note">รูปหนึ่งได้รับคะแนนครั้งเดียว · คะแนนสะสมไม่หมดอายุตามโพสต์ 2 ชั่วโมง</p>
    </>}
  </section>;
}
