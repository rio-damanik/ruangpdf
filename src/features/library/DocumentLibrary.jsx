import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, FileText, Pencil, Trash2, X } from 'lucide-react';
import { deleteDocument, listDocuments } from './documentStore.js';
import './library.css';

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentLibrary({ ownerId, onClose, onOpen, refreshKey }) {
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    listDocuments(ownerId).then((items) => {
      if (active) setDocuments(items);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Gagal memuat dokumen.');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [ownerId, refreshKey]);

  async function remove(document) {
    setError('');
    try {
      await deleteDocument(document.id, ownerId);
      setDocuments((items) => items.filter((item) => item.id !== document.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menghapus dokumen.');
    }
  }

  return <div className="library-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="library-panel" role="dialog" aria-modal="true" aria-labelledby="library-title">
      <header className="library-header"><div><span className="library-eyebrow">RUANG SIMPANAN LOKAL</span><h2 id="library-title">Dokumen tersimpan</h2><p>File hanya ada di browser dan perangkat ini.</p></div><button className="library-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button></header>
      {error && <div className="library-error" role="alert">{error}</div>}
      <div className="library-list">
        {busy ? <div className="library-empty">Memuat dokumen...</div>
          : documents.length ? documents.map((document) => <article className="library-item" key={document.id}>
            <span className="library-file-icon"><FileText size={19} /></span>
            <div className="library-file-copy"><strong>{document.name}</strong><small>{formatSize(document.blob.size)} · {new Date(document.updatedAt).toLocaleString('id-ID')}</small></div>
            <button title="Edit PDF" aria-label={`Edit ${document.name}`} onClick={() => onOpen(document)}><Pencil size={16} /></button>
            <button title="Unduh" aria-label={`Unduh ${document.name}`} onClick={() => { const url = URL.createObjectURL(document.blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><ArrowDownToLine size={16} /></button>
            <button className="library-delete" title="Hapus" aria-label={`Hapus ${document.name}`} onClick={() => remove(document)}><Trash2 size={16} /></button>
          </article>)
            : <div className="library-empty"><FileText size={27} /><strong>Belum ada dokumen tersimpan</strong><span>Simpan hasil edit PDF untuk menemukannya di sini.</span></div>}
      </div>
      <footer className="library-footer"><span>{documents.length} dokumen · tersimpan di perangkat ini</span><button onClick={onClose}>Selesai</button></footer>
    </section>
  </div>;
}
