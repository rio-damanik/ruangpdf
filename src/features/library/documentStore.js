const DATABASE = 'ruangpdf-workspace';
const VERSION = 1;
const STORE = 'documents';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('ownerId', 'ownerId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Tidak dapat membuka penyimpanan lokal.'));
  });
}

export async function saveDocument(ownerId, name, blob) {
  if (!ownerId) throw new Error('Masuk terlebih dahulu untuk menyimpan dokumen.');
  const database = await openDatabase();
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({
      id,
      ownerId,
      name,
      type: blob.type || 'application/octet-stream',
      blob,
      updatedAt: new Date().toISOString(),
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Gagal menyimpan dokumen lokal.'));
    transaction.onabort = () => reject(transaction.error || new Error('Penyimpanan lokal dibatalkan.'));
  }).finally(() => database.close());
  return id;
}

export async function listDocuments(ownerId) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).index('ownerId').getAll(ownerId);
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      request.onerror = () => reject(request.error || new Error('Gagal membaca dokumen tersimpan.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteDocument(id, ownerId) {
  const database = await openDatabase();
  try {
    const record = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Gagal membaca dokumen.'));
    });
    if (!record || record.ownerId !== ownerId) throw new Error('Dokumen tidak ditemukan di akun lokal ini.');
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Gagal menghapus dokumen.'));
      transaction.onabort = () => reject(transaction.error || new Error('Penghapusan dokumen dibatalkan.'));
    });
  } finally {
    database.close();
  }
}
