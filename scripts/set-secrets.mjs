// Apple imza bilgilerini repoya GitHub secret olarak yazar (değerler ekrana basılmaz).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers';

const dir = join(process.env.USERPROFILE || process.env.HOME, '.ajansma-apple');
const repo = 'maajans/ajansma-desktop';
const token = readFileSync(join(process.env.USERPROFILE || process.env.HOME, '.ajansma-gh-token'), 'utf8').trim();

// sertifika: doğrudan p12 varsa base64'e burada çevrilir
const certB64 = existsSync(join(dir, 'certificate.p12'))
  ? readFileSync(join(dir, 'certificate.p12')).toString('base64')
  : readFileSync(join(dir, 'certificate.p12.b64'), 'utf8').trim();

const need = {
  APPLE_CERTIFICATE: null,
  APPLE_CERTIFICATE_PASSWORD: 'certificate-password.txt',
  APPLE_SIGNING_IDENTITY: 'signing-identity.txt',
  APPLE_ID: 'apple-id.txt',
  APPLE_PASSWORD: 'app-password.txt',
  APPLE_TEAM_ID: 'team-id.txt',
};

const missing = Object.values(need).filter((f) => f && !existsSync(join(dir, f)));
if (missing.length) {
  console.error('Eksik dosyalar:', missing.join(', '));
  process.exit(1);
}

await sodium.ready;
const api = `https://api.github.com/repos/${repo}/actions/secrets`;
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ma-secrets' };

const keyRes = await fetch(`${api}/public-key`, { headers });
if (!keyRes.ok) { console.error('public-key alınamadı:', keyRes.status); process.exit(1); }
const { key, key_id } = await keyRes.json();

for (const [name, file] of Object.entries(need)) {
  const value = file === null ? certB64 : readFileSync(join(dir, file), 'utf8').trim();
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key, sodium.base64_variants.ORIGINAL));
  const res = await fetch(`${api}/${name}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id }),
  });
  console.log(name, res.status === 201 || res.status === 204 ? 'yazıldı' : `HATA ${res.status}`);
}
