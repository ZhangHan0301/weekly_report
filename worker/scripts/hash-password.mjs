import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('用法: node scripts/hash-password.mjs "至少10位的密码"');
  process.exit(1);
}
const iterations = 600_000;
const salt = randomBytes(18).toString('base64url');
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
console.log(`pbkdf2_sha256$${iterations}$${salt}$${hash}`);
