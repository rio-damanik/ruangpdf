const USERS_KEY = 'ruangpdf.local-users.v1';
const SESSION_KEY = 'ruangpdf.local-session.v1';
const ITERATIONS = 120000;

function readUsers() {
  const value = localStorage.getItem(USERS_KEY);
  return value ? JSON.parse(value) : [];
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

export function getSession() {
  const value = localStorage.getItem(SESSION_KEY);
  return value ? JSON.parse(value) : null;
}

export async function registerLocalUser(username, password) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw new Error('Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.');
  }
  if (password.length < 8) throw new Error('Password minimal 8 karakter.');
  const users = readUsers();
  if (users.some((user) => user.username === normalized)) throw new Error('Username sudah terdaftar di browser ini.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await derivePassword(password, salt);
  const user = { id: normalized, username: normalized, salt: toBase64(salt), passwordHash: toBase64(passwordHash) };
  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  const session = { id: user.id, username: user.username };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function loginLocalUser(username, password) {
  const normalized = username.trim().toLowerCase();
  const user = readUsers().find((item) => item.username === normalized);
  if (!user) throw new Error('Username atau password tidak cocok.');
  const candidate = await derivePassword(password, fromBase64(user.salt));
  const expected = fromBase64(user.passwordHash);
  if (candidate.length !== expected.length || candidate.some((value, index) => value !== expected[index])) {
    throw new Error('Username atau password tidak cocok.');
  }
  const session = { id: user.id, username: user.username };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logoutLocalUser() {
  localStorage.removeItem(SESSION_KEY);
}
