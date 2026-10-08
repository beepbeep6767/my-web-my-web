import { useCallback, useEffect, useRef, useState } from 'react';
import { client, result } from '../supabase.js';
import { ErrorNotice } from '../components/Shared.jsx';
import AdminBrand from './AdminBrand.jsx';
const stamp = value => value ? new Date(value).toLocaleString('th-TH') : '—';
export default function AdminApp({ status, onSignOut }) {
  const [rows, setRows] = useState([]), [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [updated, setUpdated] = useState(null), [expanded, setExpanded] = useState(false);
  const pending = useRef(false), mounted = useRef(false), cursor = useRef(null), paged = useRef(false);
  const load = useCallback(async (append = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const data = await result(client().rpc('mnchat_admin_members', { after_id: append ? cursor.current : null }));
      if (!mounted.current) return;
      setRows(old => append ? [...new Map([...old, ...data].map(row => [row.id, row])).values()] : data);
      cursor.current = data.at(-1)?.id || null;
      paged.current = append; setExpanded(append);
      setMore(data.length === 50); setUpdated(new Date().toISOString());
    } catch {
      if (mounted.current) {
        setRows([]); cursor.current = null; paged.current = false; setExpanded(false);
        setMore(false); setUpdated(null); setError('อ่านข้อมูลไม่ได้ กรุณาตรวจสิทธิ์ผู้ดูแลและการเชื่อมต่อ');
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (status.admin) load();
    return () => { mounted.current = false; };
  }, [status.admin, load]);
  useEffect(() => {
    if (!status.admin) return;
    const refresh = () => { if (document.visibilityState === 'visible' && !paged.current) load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [status.admin, load]);
  if (!status.admin) return <main className="school-access mnchat-admin-theme"><section className="school-card card"><AdminBrand/><h1>สำหรับผู้ดูแลเท่านั้น</h1><p>สมาชิกเข้าใช้งานแชทได้หลังยืนยันอีเมล ส่วนข้อมูลสมาชิกในหน้านี้จำกัดสิทธิ์เฉพาะผู้ดูแล</p><button className="secondary" onClick={onSignOut}>ออกจากระบบ</button></section></main>;
  return <main className="admin-page mnchat-admin-theme">
    <header><AdminBrand/><span className="admin-identity">ผู้ดูแล · {status.user.username}</span><button className="secondary" onClick={onSignOut}>ออกจากระบบ</button></header>
    <section className="admin-hero"><span className="eyebrow">MNCHAT / MEMBER ACTIVITY</span><h1>รู้จักชุมชนของคุณ</h1><p>ตรวจสมาชิก การยืนยันอีเมล และเวลาเข้าสู่ระบบจาก Supabase</p></section>
    <section className="card"><div className="section-heading"><div><span className="eyebrow">MEMBER DIRECTORY</span><h2>สมาชิกและการเข้าสู่ระบบ</h2></div><button className="primary" disabled={busy} onClick={() => load()}>รีเฟรชข้อมูล</button></div>
      <p className="admin-update" role="status">{updated ? `อัปเดต ${stamp(updated)} · แสดง ${rows.length} บัญชี` : error ? 'เชื่อมต่อไม่สำเร็จ' : 'กำลังเชื่อมต่อ API…'}{expanded ? ' · กดรีเฟรชเพื่อกลับหน้าแรก' : ' · หน้าแรกอัปเดตทุก 15 วินาที'}</p>
      <p>เวลาเข้าสู่ระบบล่าสุดเป็นประวัติการล็อกอิน ไม่ใช่สถานะออนไลน์ขณะนี้ ระบบไม่เก็บรหัสผ่าน Gmail และไม่แสดงรหัสผ่านหรือ OTP ให้ผู้ดูแล</p>
      <ErrorNotice message={error}/><div className="admin-table-wrap"><table><thead><tr><th scope="col">ชื่อผู้ใช้</th><th scope="col">รหัสผู้ใช้</th><th scope="col">อีเมลโรงเรียน</th><th scope="col">ยืนยันอีเมล</th><th scope="col">เข้าสู่ระบบล่าสุด</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.username}</strong></td><td><code>{row.id}</code></td><td>{row.email || 'ยังไม่ยืนยัน'}</td><td><span className={`admin-badge ${row.verified_at ? 'verified' : ''}`}>{row.verified_at ? 'ยืนยันแล้ว' : 'รอยืนยัน'}</span><small>{stamp(row.verified_at)}</small></td><td>{stamp(row.last_sign_in_at)}</td></tr>)}</tbody></table></div>
      {!rows.length && !busy && !error && <p>ยังไม่มีสมาชิก</p>}{busy && <p role="status">กำลังโหลด…</p>}{more && <button className="secondary" disabled={busy} onClick={() => load(true)}>โหลดสมาชิกเพิ่ม</button>}
    </section>
  </main>;
}
