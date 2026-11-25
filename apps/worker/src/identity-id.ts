/**
 * Worker-side user id for a registered device key.
 *
 * The old id was `usr_` + the first 16 base64 characters of the SPKI public key. For every
 * P-256 key those characters are the constant ASN.1 header ("MFkwEwYHKoZIzj0C"), so all
 * keys mapped to one id and a second registration hit the primary key (measured on three
 * generated keys). The new id is a prefix of the SHA-256 of the key bytes.
 */
export async function deriveUserId(pubkeyBase64: string): Promise<string> {
  const raw = Uint8Array.from(atob(pubkeyBase64), (c) => c.charCodeAt(0))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `usr_${hex}`
}
