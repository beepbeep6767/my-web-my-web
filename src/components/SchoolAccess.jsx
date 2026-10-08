import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { client, result } from '../supabase.js';
import { schoolEmail, schoolEmailHint } from '../schoolEmail.js';
import AuthScreen from './AuthScreen.jsx';
import { Brand, ErrorNotice } from './Shared.jsx';

const Community = lazy(() => import('../App.jsx'));
const Admin = lazy(() => import('../admin/AdminApp.jsx'));

export default function SchoolAccess({ admin = false }) {
  const [status, setStatus] = useState(null), [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(''), [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(0);
  const live = useRef(true), request = useRef(0), checking = useRef(false);
  const refresh = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const generation = request.current;
    try {
      const db = client();
      const { data, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      const next = data.session ? await result(db.rpc('mnchat_school_status')) : null;
      if (live.current && generation === request.current) { setStatus(next); setError(''); }
    } catch {
      if (live.current && generation === request.current) {
        setStatus(null);
        setError('ตรวจสอบสิทธิ์โรงเรียนไม่ได้ กรุณาลองใหม่ หากยังไม่สำเร็จให้ติดต่อผู้ดูแล');
      }
    } finally { checking.current = false; if (live.current) setLoading(false); }
  }, []);
  useEffect(() => {
    live.current = true;
    const callback = new URLSearchParams(window.location.hash.slice(1));
    if (callback.has('error')) {
      setNotice('ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่');
      window.history.replaceState(null, '', window.location.pathname);
    }
    refresh();
    let subscription;
    try {
      subscription = client().auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') { request.current++; setStatus(null); setAccepted(false); setEmail(''); }
        // Supabase auth callbacks must not await another auth operation.
        setTimeout(() => { if (live.current) refresh(); }, 0);
      }).data.subscription;
    } catch { /* refresh displays the configuration error */ }
    const focus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { live.current = false; subscription?.unsubscribe(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  useEffect(() => {
    if (!status || status.verified) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [status?.user?.id, status?.verified, refresh]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(v => v - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function signOut() {
    setBusy(true);
    try {
      const { error } = await client().auth.signOut(); if (error) throw error;
      request.current++; setStatus(null); setAccepted(false); setEmail(''); setNotice(''); setError('');
    } catch { setError('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setBusy(false); }
  }
  async function send(event) {
    event.preventDefault();
    const normalized = schoolEmail(email);
    if (!normalized) { setError(schoolEmailHint); return; }
    if (busy || cooldown) return;
    setBusy(true); setError('');
    try {
      const { error } = await client().auth.updateUser({ email: normalized }, { emailRedirectTo: `${window.location.origin}${admin ? '/admin.html' : '/'}` });
      if (error) throw error;
      setCooldown(60);
      setNotice(`ส่งคำขอยืนยันไปที่ ${normalized} แล้ว กรุณาเปิดอีเมลและกดลิงก์ยืนยัน ตรวจโฟลเดอร์สแปมด้วย หากไม่พบอีเมลให้ติดต่อผู้ดูแล`);
      await refresh();
    } catch (error) {
      if (error.status === 429) setCooldown(60);
      setError(error.status === 429 ? 'ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' : 'ส่งอีเมลไม่สำเร็จ อีเมลอาจมีผู้ใช้งานแล้ว หรือบริการส่งอีเมลยังไม่พร้อม กรุณาลองใหม่หรือติดต่อผู้ดูแล');
    } finally { setBusy(false); }
  }
  if (loading) return <div className="boot-screen"><Brand/><p>กำลังตรวจสอบสิทธิ์…</p></div>;
  if (status?.verified) return <Suspense fallback={<div className="boot-screen"><Brand/><p>กำลังเปิดพื้นที่ของคุณ…</p></div>}>{admin ? <Admin status={status} onSignOut={signOut}/> : <Community/>}</Suspense>;
  if (!status && accepted && !error) return <AuthScreen onAuthenticated={() => { setLoading(true); refresh(); }}/>;
  return <main className="school-access"><section className="school-card card"><Brand/><span className="eyebrow">SCHOOL ACCESS</span><h1>{status ? 'ยืนยันอีเมลโรงเรียน' : 'พื้นที่สำหรับเพื่อนโรงเรียน'}</h1><p>{status ? `สวัสดี ${status.user.username} กรุณายืนยันอีเมลก่อนเปิดแชทและโพสต์` : 'กรอกอีเมลโรงเรียนก่อนเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน จากนั้นยืนยันลิงก์ในอีเมลเพื่อเข้าใช้งาน'}</p><ErrorNotice message={error}/>{notice && <p className="school-notice" role="status">{notice}</p>}<form onSubmit={status ? send : event => { event.preventDefault(); if (!schoolEmail(email)) { setError(schoolEmailHint); return; } setError(''); setAccepted(true); }}><label htmlFor="school-email">อีเมลโรงเรียน</label><input id="school-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="12345@mh.ac.th" value={email} maxLength={14} onChange={e => setEmail(e.target.value)} required aria-describedby="school-email-hint"/><small id="school-email-hint">{schoolEmailHint}</small><button className="primary" disabled={busy || cooldown > 0}>{busy ? 'กำลังส่ง…' : cooldown ? `ส่งใหม่ได้ใน ${cooldown} วินาที` : status ? 'ส่งลิงก์ยืนยันอีเมล' : 'ไปหน้าเข้าสู่ระบบ'}</button></form>{status && <div className="school-actions"><button className="secondary" disabled={busy} onClick={refresh}>ยืนยันในอีเมลแล้ว ตรวจอีกครั้ง</button><button className="text-button" disabled={busy} onClick={signOut}>ออกจากระบบ</button></div>}<p className="school-privacy">อีเมลใช้ตรวจสิทธิ์เข้าใช้งานและแสดงเฉพาะผู้ดูแลระบบ เมื่อยืนยันสำเร็จ ระบบจะจำไว้กับบัญชีของคุณ</p>{!status && error && <button className="text-button" onClick={refresh}>ลองเชื่อมต่ออีกครั้ง</button>}</section></main>;
}
