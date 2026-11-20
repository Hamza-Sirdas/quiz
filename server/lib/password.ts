import crypto from 'node:crypto';

const ARGON2_MEMORY = 65536;
const ARGON2_PASSES = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_TAG_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.argon2Sync('argon2id', {
    message: password,
    nonce: salt,
    memory: ARGON2_MEMORY,
    passes: ARGON2_PASSES,
    parallelism: ARGON2_PARALLELISM,
    tagLength: ARGON2_TAG_LENGTH,
  });

  return `$argon2id$m=${ARGON2_MEMORY},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISM}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyArgon2Hash(password: string, storedHash: string): boolean {
  const segments = storedHash.split('$');
  // Beklenen format: ["", "argon2id", "m=65536,t=3,p=1", "<saltHex>", "<hashHex>"]
  if (segments.length !== 5 || segments[1] !== 'argon2id') {
    return false;
  }

  const paramPart = segments[2] ?? '';
  const saltHex = segments[3] ?? '';
  const keyHex = segments[4] ?? '';
  if (!saltHex || !keyHex) return false;

  const params = new Map<string, number>();
  for (const pair of paramPart.split(',')) {
    const [k, v] = pair.split('=');
    const num = Number(v);
    if (!k || !Number.isInteger(num) || num <= 0) return false;
    params.set(k, num);
  }

  const memory = params.get('m');
  const passes = params.get('t');
  const parallelism = params.get('p');
  if (!memory || !passes || !parallelism) return false;

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const storedBuf = Buffer.from(keyHex, 'hex');
    if (salt.length === 0 || storedBuf.length === 0) return false;

    const derived = crypto.argon2Sync('argon2id', {
      message: password,
      nonce: salt,
      memory,
      passes,
      parallelism,
      tagLength: storedBuf.length,
    });

    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

function verifyLegacyScryptHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('$argon2id$')) {
    return verifyArgon2Hash(password, storedHash);
  }
  return verifyLegacyScryptHash(password, storedHash);
}

export function needsPasswordRehash(storedHash: string): boolean {
  return !storedHash.startsWith('$argon2id$');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
