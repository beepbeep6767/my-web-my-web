import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, BookOpen } from 'lucide-react';
import { api } from '../api.js';
import { Brand, ErrorNotice } from './Shared.jsx';
export default function AuthScreen({ onAuthenticated, initialError }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      let { user } = await api(`/auth/${mode}`, { method: 'POST', body: values });
      let notice = '';
      // Profile pictures can be added from the account menu after email verification.
      onAuthenticated(user, notice);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-art"><Brand/><div className="auth-headline"><span className="eyebrow"><BookOpen size={16}/> A NEW WAY TO CONNECT</span><h1>Make room<br/>for <em>your people.</em></h1><p>พื้นที่เล็ก ๆ สำหรับบทสนทนาที่เติบโตได้ทุกวัน<br/>พบเพื่อน แบ่งปันเรื่องราว และเรียนรู้ไปด้วยกัน</p></div><div className="auth-garden" aria-hidden="true"><span className="garden-orbit orbit-one"/><span className="garden-orbit orbit-two"/><img src="/ochat-mark.svg" alt=""/><span className="garden-caption">A little hello.<br/>Something bigger.</span><span className="garden-dot"/></div><div className="auth-footer">01 / CONNECT &nbsp; 02 / SHARE &nbsp; 03 / GROW</div></section><section className="auth-form-side"><div className="mobile-brand"><Brand/></div><div className="auth-form-wrap"><span className="eyebrow">YOUR EVERYDAY CONNECTION</span><h2>{mode === 'login' ? 'กลับมาคุยกันต่อ' : 'เริ่มต้นพื้นที่ของคุณ'}</h2><p className="muted">{mode === 'login' ? 'เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านเดิม จากนั้นตรวจสิทธิ์โรงเรียน' : 'สมัครด้วยชื่อผู้ใช้และรหัสผ่าน แล้วกดยืนยันอีเมลโรงเรียน'}</p><div className="auth-tabs" role="tablist" aria-label="Account access"><button role="tab" aria-selected={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button role="tab" aria-selected={mode === 'signup'} disabled={busy} onClick={() => { setMode('signup'); setError(''); }}>Create account</button></div><ErrorNotice message={error}/><form onSubmit={submit} key={mode}><fieldset disabled={busy} className="auth-fields"><label>ชื่อผู้ใช้<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="ชื่อผู้ใช้ของคุณ" minLength={2} maxLength={30} required/></label><label>รหัสผ่าน<span className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'อย่างน้อย 6 ตัวอักษร' : 'รหัสผ่านของคุณ'} minLength={mode === 'signup' ? 6 : 1} maxLength={72} required/><button className="icon-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label><button className="primary auth-submit" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={18}/></button></fieldset></form><p className="auth-note">OCHAT · บทสนทนาดี ๆ เริ่มจากคุณ</p></div></section></main>;
}
