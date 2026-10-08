import { useEffect, useState } from 'react';
import { client, result } from '../supabase.js';
import { Brand, ErrorNotice } from '../components/Shared.jsx';
const stamp = value => value ? new Date(value).toLocaleString('th-TH') : '—';
export default function AdminApp({ status, onSignOut }) {
  const [rows, setRows] = useState([]), [cursor, setCursor] = useState(null), [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(append = false) {
    setBusy(true); setError('');
    try {
      const data = await result(client().rpc('mnchat_admin_members', { after_id: append ? cursor : null }));
      setRows(old => append ? [...new Map([...old, ...data].map(row => [row.id, row])).values()] : data);
      setCursor(data.at(-1)?.id || null); setMore(data.length === 50);
    } catch { setError('อ่านข้อมูลไม่ได้ กรุณาตรวจสิทธิ์ผู้ดูแลและการเชื่อมต่อ'); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (status.admin) load(); }, [status.admin]);
  if (!status.admin) return <main className="school-access"><section className="school-card card"><Brand/><h1>สำหรับผู้ดูแลเท่านั้น</h1><p>บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลสมาชิก โปรดติดต่อเจ้าของระบบ</p><button className="secondary" onClick={onSignOut}>ออกจากระบบ</button></section></main>;
  return <main className="admin-page"><header><Brand/><button className="secondary" onClick={onSignOut}>ออกจากระบบ</button></header><section className="card"><div className="section-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>สมาชิกโรงเรียน</h1></div><button className="primary" disabled={busy} onClick={() => load()}>รีเฟรชข้อมูล</button></div><p>ข้อมูลจาก API ของระบบ เฉพาะอีเมลที่ยืนยันแล้วและเวลาเข้าสู่ระบบ ไม่แสดงข้อความส่วนตัวหรือรหัสผ่าน</p><ErrorNotice message={error}/><div className="admin-table-wrap"><table><thead><tr><th>ชื่อผู้ใช้</th><th>อีเมลโรงเรียน</th><th>ยืนยันอีเมล</th><th>เข้าสู่ระบบล่าสุด</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.username}</td><td>{row.email || 'ยังไม่ยืนยัน'}</td><td>{stamp(row.verified_at)}</td><td>{stamp(row.last_sign_in_at)}</td></tr>)}</tbody></table></div>{!rows.length && !busy && !error && <p>ยังไม่มีสมาชิก</p>}{busy && <p role="status">กำลังโหลด…</p>}{more && <button className="secondary" disabled={busy} onClick={() => load(true)}>โหลดสมาชิกเพิ่ม</button>}</section></main>;
}
