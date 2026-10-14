// UTF-8 metadata identifiers without Node Buffer or a global polyfill.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function encodeUtf8Base64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    output += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) output += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) output += alphabet[c & 63];
  }
  return output;
}
export function decodeUtf8Base64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('Invalid selection encoding');
  const bytes = [];
  let bits = 0, accumulator = 0;
  for (const char of text) {
    accumulator = (accumulator << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((accumulator >> bits) & 255); }
  }
  const value = new TextDecoder().decode(new Uint8Array(bytes));
  if (encodeUtf8Base64Url(value) !== text) throw new Error('Noncanonical selection encoding');
  return value;
}
