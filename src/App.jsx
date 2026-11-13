import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronRight,
  CircleHelp, CloudOff, FileImage, FileSpreadsheet, FileText, Files, Fingerprint,
  FolderOpen, Gauge, Globe2, ImagePlus, LockKeyhole, LogIn, LogOut, Menu, MousePointer2, Search, ShieldCheck,
  Sparkles, Stamp, Upload, WandSparkles, X, Zap,
} from 'lucide-react';
import { additionalConverters, converterGroups } from './features/converters/catalog.js';
import AuthDialog from './features/auth/AuthDialog.jsx';
import { getSession, logoutLocalUser } from './features/auth/authStorage.js';
import PdfEditor from './features/editor/PdfEditor.jsx';
import DocumentLibrary from './features/library/DocumentLibrary.jsx';
import { saveDocument } from './features/library/documentStore.js';

const tools = [
  { id: 'edit', label: 'Edit PDF', description: 'Tambahkan teks dan catatan', icon: FileText, group: 'edit', color: 'blue', accept: '.pdf' },
  { id: 'sign', label: 'Tanda tangan PDF', description: 'Bubuhkan tanda tangan teks', icon: Fingerprint, group: 'edit', color: 'purple', accept: '.pdf' },
  { id: 'rotate', label: 'Putar halaman', description: 'Atur arah halaman PDF', icon: ArrowRight, group: 'edit', color: 'orange', accept: '.pdf' },
  { id: 'merge', label: 'Gabungkan PDF', description: 'Satukan beberapa dokumen', icon: Files, group: 'edit', color: 'green', accept: '.pdf', multiple: true },
  { id: 'split', label: 'Pisahkan PDF', description: 'Ambil halaman yang dibutuhkan', icon: ScissorsIcon, group: 'edit', color: 'pink', accept: '.pdf' },
  { id: 'crop', label: 'Potong halaman', description: 'Rapikan margin halaman', icon: CropIcon, group: 'edit', color: 'yellow', accept: '.pdf' },
  { id: 'watermark', label: 'Tambah watermark', description: 'Beri penanda dokumen', icon: Stamp, group: 'edit', color: 'blue', accept: '.pdf' },
  { id: 'add-image', label: 'Tambah gambar', description: 'Sisipkan gambar ke PDF', icon: ImagePlus, group: 'edit', color: 'pink', accept: '.pdf' },
  { id: 'compress-image', label: 'Kompres gambar', description: 'Kecilkan ukuran JPG/PNG', icon: FileImage, group: 'edit', color: 'green', accept: 'image/png,image/jpeg' },
  { id: 'compress', label: 'Kompres PDF', description: 'Kecilkan ukuran dengan rasterisasi', icon: Gauge, group: 'edit', color: 'orange', accept: '.pdf' },
  { id: 'delete', label: 'Hapus halaman', description: 'Buang halaman yang tak perlu', icon: X, group: 'edit', color: 'pink', accept: '.pdf' },
  { id: 'ocr', label: 'OCR PDF', description: 'Ekstrak teks dari hasil scan', icon: ScanIcon, group: 'edit', color: 'purple', accept: '.pdf' },
  { id: 'pdf-word', label: 'PDF ke Word', description: 'Ubah PDF menjadi dokumen', icon: FileText, group: 'from', color: 'blue', accept: '.pdf' },
  { id: 'pdf-ppt', label: 'PDF ke PowerPoint', description: 'Jadikan setiap halaman slide', icon: PresentationIcon, group: 'from', color: 'orange', accept: '.pdf' },
  { id: 'pdf-excel', label: 'PDF ke Excel', description: 'Ekstrak teks ke lembar kerja', icon: FileSpreadsheet, group: 'from', color: 'green', accept: '.pdf' },
  { id: 'pdf-jpg', label: 'PDF ke JPG', description: 'Simpan halaman sebagai JPG', icon: FileImage, group: 'from', color: 'purple', accept: '.pdf' },
  { id: 'pdf-png', label: 'PDF ke PNG', description: 'Simpan halaman sebagai PNG', icon: FileImage, group: 'from', color: 'pink', accept: '.pdf' },
  { id: 'word-pdf', label: 'Word ke PDF', description: 'Konversi dokumen DOCX', icon: FileText, group: 'to', color: 'blue', accept: '.docx' },
  { id: 'ppt-pdf', label: 'PowerPoint ke PDF', description: 'Konversi presentasi PPTX', icon: PresentationIcon, group: 'to', color: 'orange', accept: '.pptx' },
  { id: 'excel-pdf', label: 'Excel ke PDF', description: 'Konversi lembar kerja XLSX', icon: FileSpreadsheet, group: 'to', color: 'green', accept: '.xlsx' },
  { id: 'jpg-pdf', label: 'JPG ke PDF', description: 'Jadikan gambar sebagai PDF', icon: FileImage, group: 'to', color: 'purple', accept: '.jpg,.jpeg,image/jpeg', multiple: true },
  { id: 'png-pdf', label: 'PNG ke PDF', description: 'Jadikan gambar sebagai PDF', icon: FileImage, group: 'to', color: 'pink', accept: '.png,image/png', multiple: true },
];
const allTools = [...tools, ...additionalConverters];

const groups = [
  { id: 'all', label: 'Semua alat', icon: WandSparkles },
  { id: 'edit', label: 'Edit PDF', icon: FileText },
  { id: 'from', label: 'Dari PDF', icon: ArrowUpRight },
  { id: 'to', label: 'Ke PDF', icon: ArrowDownToLine },
  ...converterGroups,
  { id: 'forms', label: 'Formulir', icon: Files },
];
const formList = [
  { id: 'w9', label: 'W-9', description: 'Lembar informasi wajib pajak' },
  { id: 'ds11', label: 'DS-11', description: 'Lembar persiapan aplikasi paspor' },
  { id: '1099', label: '1099-MISC', description: 'Lembar ringkasan pembayaran' },
];
const groupTitles = {
  edit: 'Edit PDF',
  from: 'Konversi dari PDF',
  to: 'Konversi ke PDF',
  'pdf-export': 'PDF ke format lainnya',
  'to-pdf': 'Format lain ke PDF',
};

function ScissorsIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.2 8.2 12.3 12.3M14.8 9.2 20.5 3.5M8.2 15.8l3.2-3.2" /></svg>;
}
function CropIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="M6 3v12a3 3 0 0 0 3 3h12M18 21V9a3 3 0 0 0-3-3H3" /><path d="M14 10h.01M10 14h.01" /></svg>;
}
function ScanIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M4 12h16" /><path d="M8 9v6m4-6v6m4-6v6" /></svg>;
}
function PresentationIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M12 17v4m-4 0h8M8 12l2.5-2.5L13 12l3-3" /></svg>;
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <div className="brand-mark"><span className="brand-fold" /><Sparkles size={14} strokeWidth={2.5} /></div>
    {!compact && <div className="brand-word">ruang<span>pdf</span><small>workspace</small></div>}
  </div>;
}

function ToolCard({ tool, onClick }) {
  const Icon = tool.icon;
  return <button className={`tool-card ${tool.enabled === false ? 'tool-unavailable' : ''}`} onClick={() => onClick(tool)} disabled={tool.enabled === false} title={tool.enabled === false ? 'Belum tersedia untuk pemrosesan lokal' : undefined}>
    <span className={`tool-icon ${tool.color}`}><Icon size={20} strokeWidth={1.8} /></span>
    <span className="tool-card-copy"><strong>{tool.label}</strong><small>{tool.description}</small></span>
    {tool.enabled === false ? <span className="unavailable-tag">BELUM LOKAL</span> : <ChevronRight className="card-arrow" size={17} />}
  </button>;
}

function App() {
  const [activeGroup, setActiveGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState(null);
  const [files, setFiles] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [options, setOptions] = useState({ pages: '', text: '', signature: '', fontSize: 14, page: 1, rotation: 90, margin: 24, quality: 80, x: 60, y: 100 });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFile, setEditorFile] = useState(null);
  const fileInput = useRef(null);
  const imageInput = useRef(null);
  const searchInput = useRef(null);
  useEffect(() => {
    try {
      setUser(getSession());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Akun lokal tidak dapat dibaca.');
    }
  }, []);
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  const filteredTools = useMemo(() => allTools.filter((tool) => {
    const matchesGroup = activeGroup === 'all' || tool.group === activeGroup;
    const matchesQuery = `${tool.label} ${tool.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesGroup && matchesQuery;
  }), [activeGroup, query]);
  const sections = activeGroup === 'all' && !query
    ? ['edit', 'from', 'to', ...converterGroups.map((group) => group.id)]
    : [...new Set(filteredTools.map((tool) => tool.group))];

  function openTool(tool) {
    if (tool.id === 'edit') {
      setEditorFile(null);
      setEditorOpen(true);
      return;
    }
    setSelectedTool(tool);
    setFiles([]);
    setImageFile(null);
    setError('');
    setSuccess('');
    setProgress(0);
    setOptions({ pages: '', text: '', signature: '', fontSize: tool.id === 'sign' ? 24 : 14, page: 1, rotation: 90, margin: 24, quality: 80, x: 60, y: 100 });
  }

  function setOption(key, value) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function acceptFiles(fileList) {
    const picked = [...fileList];
    const acceptedTypes = selectedTool?.accept.split(',').map((item) => item.trim().toLowerCase()) || [];
    if (picked.some((file) => {
      const extension = `.${file.name.split('.').pop().toLowerCase()}`;
      return !acceptedTypes.some((type) => type === extension || (type.endsWith('/*') && file.type.startsWith(type.slice(0, -1))));
    })) {
      setError(`Format file tidak sesuai. Pilih: ${selectedTool?.accept.replace(/\./g, '').toUpperCase()}.`);
      return;
    }
    if (selectedTool?.multiple) setFiles((current) => [...current, ...picked]);
    else setFiles(picked.slice(0, 1));
    setError('');
    setSuccess('');
  }

  async function runTool() {
    if (!selectedTool) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setProgress(0);
    try {
      const { processTool, saveBlob } = await import('./features/pdf/processor.js');
      const [data, filename, mimeType] = await processTool(
        selectedTool.id,
        files,
        { ...options, image: imageFile },
        setProgress,
      );
      const output = data instanceof Blob ? data : new Blob([data], { type: mimeType });
      saveBlob(output, filename);
      setProgress(100);
      if (user) {
        try {
          await saveDocument(user.id, filename, output);
          setLibraryRefresh((value) => value + 1);
        } catch (caught) {
          setError(`File sudah diunduh, tetapi gagal disimpan di Ruang Simpanan: ${caught instanceof Error ? caught.message : 'penyimpanan tidak tersedia.'}`);
        }
      }
      const sizeNote = selectedTool.id === 'compress'
        ? ` Hasil ${(data.length / 1024).toFixed(0)} KB dari ${(files[0].size / 1024).toFixed(0)} KB.`
        : '';
      setSuccess(`Selesai! ${filename} siap diunduh.${sizeNote}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Terjadi kesalahan saat memproses file.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadForm(form) {
    const { createFormTemplate, saveBlob } = await import('./features/pdf/processor.js');
    saveBlob(await createFormTemplate(form), `${form.id}-template-pribadi.pdf`);
  }

  function finishLogin(session) {
    setUser(session);
    setAuthOpen(false);
    setLibraryRefresh((value) => value + 1);
  }

  function openSavedDocument(document) {
    setEditorFile(new File([document.blob], document.name, { type: document.type }));
    setLibraryOpen(false);
    setEditorOpen(true);
  }

  function logout() {
    logoutLocalUser();
    setUser(null);
    setLibraryOpen(false);
  }

  const fileNoun = selectedTool?.accept.includes('.pdf') ? 'PDF' : 'file';

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-head"><Brand /><button className="icon-btn close-menu" aria-label="Tutup menu" onClick={() => setMobileMenu(false)}><X size={18} /></button></div>
      <div className="sidebar-label">RUANG KERJA</div>
      <nav className="side-nav">
        {groups.map((group) => {
          const Icon = group.icon;
          return <button key={group.id} className={`nav-item ${activeGroup === group.id ? 'active' : ''}`} onClick={() => { setActiveGroup(group.id); setMobileMenu(false); }}>
            <Icon size={18} strokeWidth={1.8} /><span>{group.label}</span>{group.id === 'all' && <span className="nav-count">{allTools.length}</span>}
          </button>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-card"><span className="local-icon"><LockKeyhole size={15} /></span><div><strong>File tetap privat</strong><small>Diproses langsung di browser.</small></div><Check size={15} className="local-check" /></div>
        <div className="sidebar-version"><span>© 2026 RuangPDF</span><span className="version-pill">GRATIS</span></div>
      </div>
    </aside>
    {mobileMenu && <button className="mobile-backdrop" aria-label="Tutup menu" onClick={() => setMobileMenu(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="icon-btn mobile-menu-btn" aria-label="Buka menu" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
        <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{groups.find((item) => item.id === activeGroup)?.label}</strong></div>
        <div className="topbar-right">
          <span className="privacy-chip"><span /> 100% lokal</span>
          <button className="workspace-button" onClick={() => user ? setLibraryOpen(true) : setAuthOpen(true)} title={user ? 'Buka dokumen tersimpan' : 'Masuk untuk menyimpan dokumen'}><FolderOpen size={16} /><span>Simpanan</span></button>
          {user
            ? <button className="workspace-button" onClick={logout} title={`Keluar dari ${user.username}`}><LogOut size={15} /><span>{user.username}</span></button>
            : <button className="workspace-button workspace-login" onClick={() => setAuthOpen(true)}><LogIn size={15} /><span>Masuk</span></button>}
          <button className="help-button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}><CircleHelp size={17} /> Bantuan</button>
        </div>
      </header>

      <div className="content-wrap">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-eyebrow"><span className="eyebrow-sparkle"><Sparkles size={13} /></span> WORKSPACE DOKUMEN GRATIS</div>
            <h1>Semua urusan<br /><span>PDF, beres.</span></h1>
            <p>Edit, konversi, dan rapikan dokumen gratis. File tetap di perangkat; akun lokal opsional untuk menyimpan.</p>
            <button className="hero-cta" onClick={() => document.getElementById('tools-heading')?.scrollIntoView({ behavior: 'smooth' })}>Jelajahi semua alat <ArrowRight size={16} /></button>
            <div className="hero-footnote"><ShieldCheck size={14} /> Tanpa unggah dan tanpa biaya. Akun hanya untuk penyimpanan.</div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="hero-sticker sticker-sparkle"><Sparkles size={18} fill="currentColor" /></div>
            <div className="hero-doc"><div className="doc-top"><span className="pdf-label">PDF</span><span className="doc-dots">•••</span></div><div className="doc-title-line" /><div className="doc-sub-line" /><div className="doc-photo"><span /><i /><b /></div><div className="doc-lines"><i /><i /><i /><i /></div><div className="doc-sign">r.</div></div>
            <div className="hero-float float-edit"><span className="float-icon"><WandSparkles size={16} /></span><div><b>Edit dokumen</b><small>Siap dalam sekejap</small></div><span className="float-check"><Check size={13} /></span></div>
            <div className="hero-float float-lock"><LockKeyhole size={15} /><span>File aman di perangkat</span></div>
            <div className="hero-orbit-dot dot-a" /><div className="hero-orbit-dot dot-b" /><div className="hero-orbit-dot dot-c" />
          </div>
          <div className="hero-decoration">PDF<br />TOOLKIT <span>✳</span></div>
        </section>

        <section className="trust-strip" aria-label="Keunggulan RuangPDF">
          <div><LockKeyhole size={16} /><span><b>Privat secara default</b><small>File tak pernah diunggah</small></span></div>
          <i />
          <div><Zap size={17} /><span><b>Semua fitur gratis</b><small>Tanpa batas penggunaan</small></span></div>
          <i />
          <div><Globe2 size={17} /><span><b>Langsung di browser</b><small>Akun lokal opsional</small></span></div>
          <span className="trust-stamp"><BadgeCheck size={14} /> AKUN OPSIONAL</span>
        </section>

        <section className="tool-area" id="tools-heading">
          <div className="tool-section-head">
            <div><div className="section-kicker">PILIH ALATMU</div><h2>{activeGroup === 'all' ? 'Mulai dari sini' : groups.find((item) => item.id === activeGroup)?.label}</h2><p>Alat yang kamu butuhkan, tanpa ribet.</p></div>
            <label className="search-box"><Search size={17} /><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari alat PDF..." /><kbd>⌘ K</kbd></label>
          </div>
          {activeGroup === 'forms' ? <div className="tool-grid form-grid">{formList.map((form) => <button className="form-card" key={form.id} onClick={() => downloadForm(form)}><span className="form-icon"><FileText size={20} /></span><span className="tool-card-copy"><strong>{form.label}</strong><small>{form.description}</small></span><ArrowDownToLine size={17} className="card-arrow" /></button>)}</div>
            : filteredTools.length ? sections.map((section) => <div className="tool-section" key={section}>
              {activeGroup === 'all' && <h3 className="group-heading">{groupTitles[section] || converterGroups.find((group) => group.id === section)?.label}<span>{filteredTools.filter((tool) => tool.group === section).length} alat</span></h3>}
              <div className="tool-grid">{filteredTools.filter((tool) => tool.group === section).map((tool) => <ToolCard key={tool.id} tool={tool} onClick={openTool} />)}</div>
            </div>) : <div className="empty-search"><Search size={22} /><strong>Alatnya belum ketemu</strong><span>Coba kata kunci lain, ya.</span></div>}
          <div className="more-tools"><span>Masih banyak yang bisa dirapikan.</span><span className="more-tools-label"><Sparkles size={14} /> Semuanya gratis, selamanya.</span></div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-title"><div className="section-kicker">SIMPAN FILEMU TETAP AMAN</div><h2>Privasi bukan fitur tambahan.</h2><p>RuangPDF bekerja langsung di browser, jadi file sensitifmu tak perlu pergi ke mana-mana.</p></div>
          <div className="how-cards"><div className="how-card"><span className="how-number">01</span><span className="how-icon"><Upload size={19} /></span><strong>Pilih file</strong><small>Tarik file ke alat pilihanmu.</small></div><div className="how-connector" /><div className="how-card"><span className="how-number">02</span><span className="how-icon"><MousePointer2 size={19} /></span><strong>Proses di sini</strong><small>Semua pemrosesan terjadi di perangkat.</small></div><div className="how-connector" /><div className="how-card"><span className="how-number">03</span><span className="how-icon"><ArrowDownToLine size={19} /></span><strong>Unduh hasilnya</strong><small>File hasil langsung tersimpan.</small></div></div>
        </section>
        <footer className="footer"><Brand compact /><span>Dokumenmu. Urusanmu. <b>© 2026 RuangPDF</b></span><a href="#tools-heading">Kembali ke atas ↑</a></footer>
      </div>
    </main>

    {selectedTool && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedTool(null); }}>
      <section className="tool-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header"><button className="modal-back" onClick={() => setSelectedTool(null)} aria-label="Kembali"><ArrowLeft size={18} /></button><div><span className="modal-kicker">RUANGPDF TOOL</span><h2 id="modal-title">{selectedTool.label}</h2></div><button className="icon-btn modal-close" onClick={() => !busy && setSelectedTool(null)} aria-label="Tutup"><X size={18} /></button></header>
        <div className="modal-body">
          <p className="modal-description">{selectedTool.description}. Gratis, privat, langsung diproses di browser.</p>
          <button className={`drop-zone ${files.length ? 'has-files' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptFiles(event.dataTransfer.files); }}>
            <input ref={fileInput} type="file" accept={selectedTool.accept} multiple={Boolean(selectedTool.multiple)} hidden onChange={(event) => acceptFiles(event.target.files)} />
            {files.length ? <><span className="drop-icon success-icon"><Check size={20} /></span><strong>{files.length === 1 ? files[0].name : `${files.length} file dipilih`}</strong><small>{files.map((item) => `${item.name} · ${(item.size / 1024 / 1024).toFixed(2)} MB`).join('  ·  ')}</small><span className="change-file">Klik untuk ganti file</span></>
              : <><span className="drop-icon"><Upload size={20} /></span><strong>Taruh {fileNoun}-mu di sini</strong><small>atau klik untuk memilih dari perangkat</small><span className="drop-format">{selectedTool.accept.replace(/\./g, '').replace(/,/g, ' · ').toUpperCase()} {selectedTool.multiple && ' · PILIH BEBERAPA'}</span></>}
          </button>
          {selectedTool.id === 'ocr' && <p className="format-note">Hasil OCR diunduh sebagai file teks (.txt).</p>}
          {['split', 'delete', 'rotate', 'crop', 'watermark', 'edit', 'sign', 'add-image'].includes(selectedTool.id) && <div className="options-panel">
            <div className="options-title">PENGATURAN</div>
            {['split', 'delete', 'rotate', 'crop', 'watermark'].includes(selectedTool.id) && <label className="field-label">Halaman <span>kosongkan untuk semua halaman</span><input value={options.pages} onChange={(event) => setOption('pages', event.target.value)} placeholder="contoh: 1, 3-5" /></label>}
            {(selectedTool.id === 'edit' || selectedTool.id === 'watermark') && <label className="field-label">{selectedTool.id === 'edit' ? 'Teks yang ditambahkan' : 'Teks watermark'}<input value={options.text} onChange={(event) => setOption('text', event.target.value)} placeholder={selectedTool.id === 'edit' ? 'Ketik teks...' : 'CONTOH · RAHASIA'} /></label>}
            {selectedTool.id === 'sign' && <label className="field-label">Nama untuk tanda tangan<input className="signature-input" value={options.signature} onChange={(event) => setOption('signature', event.target.value)} placeholder="Nama lengkap" /></label>}
            {selectedTool.id === 'add-image' && <label className="field-label">Gambar yang disisipkan<button className="secondary-file-button" onClick={() => imageInput.current?.click()}><ImagePlus size={16} />{imageFile?.name || 'Pilih JPG atau PNG'}</button><input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></label>}
            {['edit', 'sign', 'watermark', 'add-image'].includes(selectedTool.id) && <div className="field-row"><label className="field-label">Halaman<input type="number" min="1" value={options.page} onChange={(event) => setOption('page', event.target.value)} /></label><label className="field-label">{selectedTool.id === 'watermark' ? 'Ukuran teks' : 'Ukuran teks'}<input type="number" min="8" max="96" value={options.fontSize} onChange={(event) => setOption('fontSize', event.target.value)} /></label></div>}
            {selectedTool.id === 'rotate' && <label className="field-label">Arah putaran<select value={options.rotation} onChange={(event) => setOption('rotation', event.target.value)}><option value="90">90° searah jarum jam</option><option value="180">180°</option><option value="270">90° berlawanan jarum jam</option></select></label>}
            {selectedTool.id === 'crop' && <label className="field-label">Margin potong (pt)<input type="number" min="1" max="200" value={options.margin} onChange={(event) => setOption('margin', event.target.value)} /></label>}
          </div>}
          {['compress-image', 'compress'].includes(selectedTool.id) && <div className="options-panel"><div className="options-title">{selectedTool.id === 'compress' ? 'KUALITAS PDF' : 'KUALITAS GAMBAR'}</div><label className="field-label">Kualitas <span>{options.quality}%</span><input type="range" min="40" max="100" step="5" value={options.quality} onChange={(event) => setOption('quality', event.target.value)} /></label>{selectedTool.id === 'compress' && <div className="compression-note">PDF dikonversi menjadi halaman gambar agar ukuran lebih kecil. Teks di hasilnya tidak bisa dipilih atau dicari.</div>}</div>}
          <div className="modal-privacy"><CloudOff size={16} /><span><strong>File tidak diunggah ke server.</strong> Pemrosesan berlangsung di browser-mu. Konversi dokumen dapat mempertahankan teks saja, bukan tata letak aslinya.</span></div>
          {error && <div className="feedback error-feedback">{error}</div>}
          {success && <div className="feedback success-feedback"><Check size={16} />{success}</div>}
          {busy && <div className="progress-wrap"><div className="progress-copy"><span>Sedang memproses...</span><span>{progress || 10}%</span></div><div className="progress-track"><span style={{ width: `${progress || 10}%` }} /></div></div>}
        </div>
        <footer className="modal-footer"><span><LockKeyhole size={14} /> Gratis · File privat</span><button className="process-button" disabled={!files.length || busy} onClick={runTool}>{busy ? 'Memproses...' : <>Proses & unduh <ArrowRight size={16} /></>}</button></footer>
      </section>
    </div>}
    {editorOpen && <PdfEditor
      initialFile={editorFile}
      ownerId={user?.id}
      onBack={() => { setEditorOpen(false); setEditorFile(null); }}
      onAuthRequired={() => setAuthOpen(true)}
      onSaved={() => setLibraryRefresh((value) => value + 1)}
    />}
    {libraryOpen && user && <DocumentLibrary
      ownerId={user.id}
      refreshKey={libraryRefresh}
      onClose={() => setLibraryOpen(false)}
      onOpen={openSavedDocument}
    />}
    {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSuccess={finishLogin} />}
  </div>;
}

export default App;
