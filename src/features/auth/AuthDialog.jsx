import React, { useState } from 'react';
import { ArrowRight, Check, Chrome, LockKeyhole, X } from 'lucide-react';
import { loginLocalUser, registerLocalUser } from './authStorage.js';
import './auth.css';

export default function AuthDialog({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleMessage, setGoogleMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = mode === 'login'
        ? await loginLocalUser(username, password)
        : await registerLocalUser(username, password);
      onSuccess(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tidak dapat memproses akun lokal.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
      <div className="auth-brand"><span className="auth-logo">r<span>✳</span></span><span>ruang<span>pdf</span></span></div>
      <div className="auth-eyebrow">RUANG SIMPANAN PRIBADI</div>
      <h2 id="auth-title">{mode === 'login' ? 'Selamat datang kembali' : 'Buat akun lokal'}</h2>
      <p className="auth-description">Masuk untuk menyimpan dokumen di browser perangkat ini.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="contoh: namaanda" required /></label>
        <label>Password<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" required minLength={8} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Memproses...' : <>{mode === 'login' ? 'Masuk' : 'Daftar'} <ArrowRight size={16} /></>}</button>
      </form>
      <div className="auth-separator"><span />atau<span /></div>
      <button className="google-login" onClick={() => setGoogleMessage('Google OAuth belum dikonfigurasi. Untuk login Google sungguhan, aplikasi perlu Google Client ID dan domain OAuth.')}><Chrome size={17} /> Lanjutkan dengan Google <span className="google-setup">setup</span></button>
      {googleMessage && <div className="google-notice">{googleMessage}</div>}
      <p className="auth-switch">{mode === 'login' ? 'Belum punya akun lokal?' : 'Sudah punya akun?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Daftar' : 'Masuk'}</button></p>
      <div className="auth-local-note"><LockKeyhole size={15} /><span><b>Mode lokal sementara.</b> Akun dan file hanya tersimpan di browser ini, bukan layanan cloud. Jangan gunakan password penting.</span><Check size={14} /></div>
    </section>
  </div>;
}
