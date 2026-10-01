import { useState, useEffect } from 'react';
import { ArrowRight, Camera, Eye, EyeOff, BookOpen } from 'lucide-react';
import { api, uploadFile } from '../api.js';
import { Brand, ErrorNotice } from './Shared.jsx';
export default function AuthScreen({ onAuthenticated, initialError }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      let { user } = await api(`/auth/${mode}`, { method: 'POST', body: values });
      let notice = '';
      if (mode === 'signup' && file) {
        try { const media = await uploadFile(file); user = (await api('/auth/profile', { method: 'PATCH', body: { avatarId: media.id } })).user; }
        catch (error) { notice = `Account created. Profile picture was not saved: ${error.message}`; }
      }
      onAuthenticated(user, notice);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-art"><Brand/><div className="auth-headline"><span className="eyebrow"><BookOpen size={16}/> A SPACE FOR YOUR SCHOOL</span><h1>Good questions.<br/>Great connections.</h1><p>Find your people. Share what you know.<br/>Figure things out, together.</p></div><img className="auth-cover" src="/mnchat-cover.png" alt="Soft pink and blue chat bubbles floating together"/><div className="auth-footer">A little conversation can go a long way.</div></section><section className="auth-form-side"><div className="mobile-brand"><Brand/></div><div className="auth-form-wrap"><span className="eyebrow">WELCOME TO MNCHAT</span><h2>{mode === 'login' ? 'Your circle is here.' : 'Let’s get to know you.'}</h2><p className="muted">{mode === 'login' ? 'เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านเดิม' : 'สมัครด้วยชื่อผู้ใช้และรหัสผ่าน ไม่ต้องใช้อีเมล'}</p><div className="auth-tabs" role="tablist" aria-label="Account access"><button role="tab" aria-selected={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button role="tab" aria-selected={mode === 'signup'} disabled={busy} onClick={() => { setMode('signup'); setError(''); }}>Create account</button></div><ErrorNotice message={error}/><form onSubmit={submit} key={mode}><fieldset disabled={busy} className="auth-fields">{mode === 'signup' && <><label className="profile-picker"><span className="avatar large">{preview ? <img src={preview} alt="Profile preview"/> : <Camera size={24}/>}</span><span>Add a profile picture<small>Optional · JPG, PNG, WebP or GIF</small></span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setFile(e.target.files[0] || null)}/></label></>}<label>ชื่อผู้ใช้<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="ชื่อผู้ใช้ของคุณ" minLength={2} maxLength={30} required/></label><label>รหัสผ่าน<span className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'อย่างน้อย 6 ตัวอักษร' : 'รหัสผ่านของคุณ'} minLength={mode === 'signup' ? 6 : 1} maxLength={72} required/><button className="icon-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label><button className="primary auth-submit" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={18}/></button></fieldset></form><p className="auth-note">Keep it kind. Ask freely. Help each other grow.</p></div></section></main>;
}
