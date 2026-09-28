import bcrypt from 'bcryptjs';
import { config } from '../config';

let dummyHashPromise: Promise<string> | null = null;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string | null) {
  const hashToCompare = hash ?? (await getDummyHash());
  const matches = await bcrypt.compare(plain, hashToCompare);
  return hash !== null && matches;
}

function getDummyHash() {
  dummyHashPromise ??= bcrypt.hash('dummy-password-not-used', config.bcryptRounds);
  return dummyHashPromise;
}
