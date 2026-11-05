// Apple imza bilgilerini repoya GitHub secret olarak yazar (değerler ekrana basılmaz).
// p12 macOS Keychain çıkışlıdır: RC2-40 kullandığı için openssl yerine node-forge ile okunur.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers';
import forge from 'node-forge';

const home = process.env.USERPROFILE || process.env.HOME;
const dir = join(home, '.ajansma-apple');
const repo = 'maajans/ajansma-desktop';
const token = readFileSync(join(home, '.ajansma-gh-token'), 'utf8').trim();

const p12Path = join(dir, 'certificate.p12');
const password = readFileSync(join(dir, 'certificate-password.txt'), 'utf8').trim();
const p12Bytes = readFileSync(p12Path);
const certB64 = p12Bytes.toString('base64');

/** Sertifikadan CN (imza kimliği) ve OU (Team ID) alanlarını çıkarır. */
function certInfo() {
  const der = p12Bytes.toString('binary');
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);
  let hasKey = false;
  let found = null;
  for (const safe of p12.safeContents) {
    for (const bag of safe.safeBags) {
      if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag || bag.type === forge.pki.oids.keyBag) {
        hasKey = true;
      }
      if (bag.type === forge.pki.oids.certBag && bag.cert) {
        const attrs = bag.cert.subject.attributes;
        const get = (key) => {
          const attr = attrs.find((a) => a.shortName === key || a.name === key);
          return attr ? String(attr.value) : '';
        };
        const cn = get('CN');
        const ou = get('OU');
        if (cn.includes('Developer ID Application') && ou) {
          found = { cn, ou };
        }
      }
    }
  }
  return found ? { ...found, hasKey } : null;
}

const info = certInfo();
if (!info) {
  console.error('Sertifika "Developer ID Application" değil — doğru sertifikayı dışa aktar.');
  process.exit(1);
}
if (!info.hasKey) {
  console.error('p12 içinde özel anahtar yok — Keychain’de "Sertifikalarım" altından dışa aktar.');
  process.exit(1);
}
console.log('sertifika:', info.cn);
console.log('takım:', info.ou);

const secrets = {
  APPLE_CERTIFICATE: certB64,
  APPLE_CERTIFICATE_PASSWORD: password,
  APPLE_SIGNING_IDENTITY: info.cn,
  APPLE_TEAM_ID: info.ou,
  APPLE_ID: readFileSync(join(dir, 'apple-id.txt'), 'utf8').trim(),
  APPLE_PASSWORD: readFileSync(join(dir, 'app-password.txt'), 'utf8').trim(),
};

await sodium.ready;
const api = `https://api.github.com/repos/${repo}/actions/secrets`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'ma-secrets',
};

const keyRes = await fetch(`${api}/public-key`, { headers });
if (!keyRes.ok) {
  console.error('public-key alınamadı:', keyRes.status);
  process.exit(1);
}
const { key, key_id } = await keyRes.json();

for (const [name, value] of Object.entries(secrets)) {
  const sealed = sodium.crypto_box_seal(
    sodium.from_string(value),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
  );
  const res = await fetch(`${api}/${name}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
      key_id,
    }),
  });
  console.log(name, res.status === 201 || res.status === 204 ? 'yazıldı' : `HATA ${res.status}`);
}
