/**
 * Node.js platform adapter for cryptographic primitives.
 *
 * This folder is the crypto platform boundary: it wraps `node:crypto`
 * (via AEAD ciphers, X25519 ECDH, signature verification) and exposes the
 * result as the `@browsercore/contracts` CryptoProvider interface.
 *
 * browsersmith is the ONLY package that may import `node:crypto` for the
 * protocol stack — all other packages consume the CryptoProvider interface.
 */

export { nodeCryptoProvider, NodeCryptoProvider } from "./node-crypto-provider.js";
export { aeadEncrypt, aeadDecrypt } from "./aead.js";
export { aes128Gcm, aes256Gcm, aes128Ccm, chacha20Poly1305, CIPHER_BY_ID } from "./ciphers.js";
export { NodeX25519Backend } from "./x25519-node-backend.js";
export { AES_128_GCM, AES_128_CCM, AES_256_GCM, CHACHA20_POLY1305 } from "@browsercore/crypto";
