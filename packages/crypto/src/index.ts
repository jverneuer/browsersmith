/**
 * @network/crypto — public API surface.
 *
 * A clean abstraction wrapping Node's native crypto APIs. The TLS implementation
 * calls these methods — never `node:crypto` directly — so the backend is
 * replaceable (WebCrypto, HSM, test double).
 */

export { NodeCryptoProvider, crypto } from "./crypto.js";
export type { CryptoProvider } from "./crypto.js";

export { aes128Gcm, aes256Gcm, chacha20Poly1305, CIPHER_BY_ID } from "./ciphers.js";

export {
    CryptoError,
    DecryptError,
    UnsupportedAlgorithmError,
    ensureCryptoError,
} from "./errors.js";

export {
    type AeadCipher,
    type Aes128GcmId,
    type Aes256GcmId,
    type ChaCha20Poly1305Id,
    type CryptoSessionId,
    type HashId,
    type KeyExchangeId,
    type Sha256Id,
    type Sha384Id,
    type SymmetricCipherId,
    type X25519Id,
    type X25519KeyPair,
    AES_128_GCM,
    AES_256_GCM,
    CHACHA20_POLY1305,
    SHA_256,
    SHA_384,
    X25519,
    createCryptoSessionId,
} from "./types.js";

export { assertNever, createId } from "./utils.js";
