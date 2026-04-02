import { STORAGE_KEYS, DEFAULT_API_CONFIG } from "../shared/constants.js";

const PBKDF2_ITERS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toBase64(bytes) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(passphrase || "")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptJson(passphrase, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(obj || {}));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return {
    v: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERS },
    alg: "AES-GCM",
    saltB64: toBase64(salt),
    ivB64: toBase64(iv),
    dataB64: toBase64(ciphertext),
    createdAt: new Date().toISOString(),
  };
}

async function decryptJson(passphrase, payload) {
  const p = payload && typeof payload === "object" ? payload : null;
  if (!p?.saltB64 || !p?.ivB64 || !p?.dataB64) {
    throw new Error("Encrypted payload missing fields.");
  }
  const salt = fromBase64(p.saltB64);
  const iv = fromBase64(p.ivB64);
  const data = fromBase64(p.dataB64);
  const key = await deriveAesKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  const dec = new TextDecoder();
  const json = dec.decode(decrypted);
  return JSON.parse(json);
}

export async function getSecurityConfig() {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.SECURITY_CONFIG);
  const cfg = raw?.[STORAGE_KEYS.SECURITY_CONFIG];
  return {
    enabled: cfg?.enabled === true,
    updatedAt: cfg?.updatedAt || null,
  };
}

export async function setSecurityEnabled(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SECURITY_CONFIG]: { enabled: enabled === true, updatedAt: new Date().toISOString() },
  });
}

export async function getEncryptedApiKeys() {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_API_KEYS);
  return raw?.[STORAGE_KEYS.ENCRYPTED_API_KEYS] || null;
}

export async function setEncryptedApiKeys(payload) {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTED_API_KEYS]: payload });
}

export async function clearEncryptedApiKeys() {
  await chrome.storage.local.remove(STORAGE_KEYS.ENCRYPTED_API_KEYS);
}

export async function getSessionDecryptedKeys() {
  try {
    const raw = await chrome.storage.session.get(STORAGE_KEYS.SESSION_DECRYPTED_KEYS);
    const keys = raw?.[STORAGE_KEYS.SESSION_DECRYPTED_KEYS];
    if (!keys || typeof keys !== "object") return null;
    return {
      apiKey: String(keys.apiKey || ""),
      anthropicKey: String(keys.anthropicKey || ""),
      perplexityKey: String(keys.perplexityKey || ""),
      unlockedAt: keys.unlockedAt || null,
    };
  } catch {
    return null;
  }
}

export async function setSessionDecryptedKeys(keys) {
  // Session storage clears on browser restart; this is what makes "unlock once per restart" possible.
  await chrome.storage.session.set({
    [STORAGE_KEYS.SESSION_DECRYPTED_KEYS]: {
      apiKey: String(keys?.apiKey || ""),
      anthropicKey: String(keys?.anthropicKey || ""),
      perplexityKey: String(keys?.perplexityKey || ""),
      unlockedAt: new Date().toISOString(),
    },
  });
}

export async function clearSessionDecryptedKeys() {
  try {
    await chrome.storage.session.remove(STORAGE_KEYS.SESSION_DECRYPTED_KEYS);
  } catch {
    // ignore
  }
}

export async function getSecurityStatus() {
  const cfg = await getSecurityConfig();
  if (!cfg.enabled) {
    return { enabled: false, locked: false, hasEncryptedKeys: false };
  }
  const enc = await getEncryptedApiKeys();
  const session = await getSessionDecryptedKeys();
  return {
    enabled: true,
    locked: !session,
    hasEncryptedKeys: !!enc,
    unlockedAt: session?.unlockedAt || null,
  };
}

export async function enableSecurityMode(passphrase, currentApiConfig) {
  const pass = String(passphrase || "");
  if (!pass || pass.length < 12) {
    throw new Error("Passphrase must be at least 12 characters.");
  }

  const cfg = currentApiConfig && typeof currentApiConfig === "object" ? currentApiConfig : { ...DEFAULT_API_CONFIG };
  const keys = {
    apiKey: String(cfg.apiKey || ""),
    anthropicKey: String(cfg.anthropicKey || ""),
    perplexityKey: String(cfg.perplexityKey || ""),
  };

  const encrypted = await encryptJson(pass, keys);
  await setEncryptedApiKeys(encrypted);
  await setSessionDecryptedKeys(keys);
  await setSecurityEnabled(true);

  return { enabled: true };
}

export async function unlockSecurityMode(passphrase) {
  const pass = String(passphrase || "");
  if (!pass) throw new Error("Passphrase required.");
  const encrypted = await getEncryptedApiKeys();
  if (!encrypted) throw new Error("No encrypted keys found.");
  const keys = await decryptJson(pass, encrypted);
  await setSessionDecryptedKeys(keys);
  return { unlocked: true };
}

export async function lockSecurityMode() {
  await clearSessionDecryptedKeys();
  return { locked: true };
}

export async function disableSecurityMode(passphraseMaybe) {
  const status = await getSecurityStatus();
  if (!status.enabled) return { disabled: true };

  // Prefer session keys (unlocked) for restoring plaintext.
  const session = await getSessionDecryptedKeys();
  if (session) {
    await setSecurityEnabled(false);
    await clearEncryptedApiKeys();
    await clearSessionDecryptedKeys();
    return { disabled: true, restored: true, keys: session };
  }

  // If locked, require passphrase to restore.
  const pass = String(passphraseMaybe || "");
  if (!pass) throw new Error("Unlock required to disable security mode.");
  const encrypted = await getEncryptedApiKeys();
  if (!encrypted) throw new Error("No encrypted keys found.");
  const keys = await decryptJson(pass, encrypted);
  await setSecurityEnabled(false);
  await clearEncryptedApiKeys();
  await clearSessionDecryptedKeys();
  return { disabled: true, restored: true, keys };
}

