/**
 * Tests for @network/crypto.
 *
 * The TEST file may use node:crypto to compute expected values — that's fine.
 * The production code is what must route through the CryptoProvider abstraction.
 */

import {
    createHash,
    hkdfSync,
    generateKeyPairSync,
    createPublicKey,
    sign,
    constants,
    randomBytes as nodeRandomBytes,
} from "node:crypto";
import { describe, expect, it } from "vitest";

import { crypto, NodeCryptoProvider } from "../src/crypto.js";
import { CryptoError, DecryptError, UnsupportedAlgorithmError, ensureCryptoError } from "../src/errors.js";
import {
    aes128Gcm,
    aes256Gcm,
    chacha20Poly1305,
    CIPHER_BY_ID,
} from "../src/ciphers.js";
import {
    AES_128_GCM,
    AES_256_GCM,
    CHACHA20_POLY1305,
    SHA_256,
    SHA_384,
    X25519,
    createCryptoSessionId,
} from "../src/types.js";
import { assertNever, createId } from "../src/utils.js";

/**
 * Normalize a Node Buffer / Uint8Array to a standalone Uint8Array for byte
 * comparison. The provider returns Uint8Array; the oracle returns Node Buffers;
 * vitest distinguishes them by type, so we canonicalize the oracle side.
 */
function canonicalize(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
}

/** Deterministic buffer: byte[i] = i % 256 (reproducible, never random). */
function detBuffer(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = i % 256;
    }
    return bytes;
}

describe("default singleton", () => {
    it("exports a NodeCryptoProvider instance as the default crypto", () => {
        expect(crypto).toBeInstanceOf(NodeCryptoProvider);
    });

    it("is a usable CryptoProvider (randomBytes works)", () => {
        const bytes = crypto.randomBytes(16);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.byteLength).toBe(16);
    });
});

describe("randomBytes", () => {
    const provider = new NodeCryptoProvider();

    it("returns a Uint8Array of the requested length", () => {
        for (const length of [0, 1, 16, 32, 1024]) {
            const bytes = provider.randomBytes(length);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.byteLength).toBe(length);
        }
    });

    it("does not return identical bytes on successive calls", () => {
        const a = provider.randomBytes(32);
        const b = provider.randomBytes(32);
        // Two 32-byte random buffers should differ with overwhelming probability.
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    });
});

describe("sha256", () => {
    const provider = new NodeCryptoProvider();

    it("matches node:crypto for the empty input", () => {
        const data = new Uint8Array(0);
        const expected = createHash("sha256").update(data).digest();
        expect(Buffer.from(provider.sha256(data)).equals(expected)).toBe(true);
    });

    it("matches node:crypto for a known vector", () => {
        const data = new Uint8Array(Buffer.from("abc", "utf8"));
        // SHA-256("abc") — NIST test vector.
        const expectedHex = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        expect(Buffer.from(provider.sha256(data)).toString("hex")).toBe(expectedHex);
    });

    it("produces a 32-byte digest", () => {
        const digest = provider.sha256(new Uint8Array(Buffer.from("hello world", "utf8")));
        expect(digest.byteLength).toBe(32);
    });
});

describe("sha384", () => {
    const provider = new NodeCryptoProvider();

    it("matches node:crypto for the empty input", () => {
        const data = new Uint8Array(0);
        const expected = createHash("sha384").update(data).digest();
        expect(Buffer.from(provider.sha384(data)).equals(expected)).toBe(true);
    });

    it("produces a 48-byte digest", () => {
        const digest = provider.sha384(new Uint8Array(Buffer.from("hello world", "utf8")));
        expect(digest.byteLength).toBe(48);
    });
});

describe("typed errors", () => {
    it("CryptoError carries algorithm + cause + kind", () => {
        const cause = new Error("root");
        const err = new CryptoError("boom", "AES-256-GCM", { cause });
        expect(err).toBeInstanceOf(CryptoError);
        expect(err.kind).toBe("CryptoError");
        expect(err.algorithm).toBe("AES-256-GCM");
        expect(err.cause).toBe(cause);
        expect(err.name).toBe("CryptoError");
    });

    it("UnsupportedAlgorithmError reports the algorithm", () => {
        const err = new UnsupportedAlgorithmError("BogusCipher");
        expect(err.kind).toBe("UnsupportedAlgorithmError");
        expect(err.algorithm).toBe("BogusCipher");
        expect(err.message).toContain("BogusCipher");
    });

    it("DecryptError reports the algorithm", () => {
        const err = new DecryptError(AES_128_GCM);
        expect(err.kind).toBe("DecryptError");
        expect(err.algorithm).toBe("AES-128-GCM");
    });

    it("ensureCryptoError narrows and wraps", () => {
        const already = new CryptoError("x", "SHA-256");
        expect(ensureCryptoError(already, "SHA-256")).toBe(already);

        const wrapped = ensureCryptoError(new Error("root"), "HKDF");
        expect(wrapped).toBeInstanceOf(CryptoError);
        expect(wrapped.cause?.message).toBe("root");

        const fromString = ensureCryptoError("plain string");
        expect(fromString.message).toBe("plain string");
    });
});

describe("hkdf (RFC 5869) matches node:crypto.hkdfSync", () => {
    const provider = new NodeCryptoProvider();

    it("sha-256: derives the same bytes as the node oracle for a known input", () => {
        const salt = detBuffer(32);
        const ikm = detBuffer(64);
        const info = new TextEncoder().encode("hkdf-test-info");
        const length = 48;
        const ours = provider.hkdf(SHA_256, salt, ikm, info, length);
        const node = canonicalize(
            hkdfSync("sha256", ikm as Buffer, salt as Buffer, info as Buffer, length) as unknown as Uint8Array,
        );
        expect(ours).toHaveLength(length);
        expect(ours).toEqual(node);
    });

    it("sha-384: derives the same bytes as the node oracle", () => {
        const salt = detBuffer(48);
        const ikm = detBuffer(32);
        const info = new TextEncoder().encode("info");
        const length = 64;
        const ours = provider.hkdf(SHA_384, salt, ikm, info, length);
        const node = canonicalize(
            hkdfSync("sha384", ikm as Buffer, salt as Buffer, info as Buffer, length) as unknown as Uint8Array,
        );
        expect(ours).toEqual(node);
    });

    it("length-0 input still derives key material", () => {
        const salt = new Uint8Array(0);
        const ikm = detBuffer(16);
        const info = new Uint8Array(0);
        const ours = provider.hkdf(SHA_256, salt, ikm, info, 32);
        expect(ours).toHaveLength(32);
    });
});

describe("AEAD: AES-128-GCM round-trips and authenticates", () => {
    const provider = new NodeCryptoProvider();
    const key = new Uint8Array(nodeRandomBytes(16));
    const nonce = new Uint8Array(nodeRandomBytes(12));
    const aad = new TextEncoder().encode("additional-data");
    const plaintext = new TextEncoder().encode("the secret plaintext");

    it("encrypt then decrypt recovers the plaintext", () => {
        const ct = provider.aes128GcmEncrypt(key, nonce, plaintext, aad);
        expect(ct.length).toBe(plaintext.length + 16); // ciphertext + 16-byte tag
        const recovered = provider.aes128GcmDecrypt(key, nonce, ct, aad);
        expect(recovered).toEqual(plaintext);
    });

    it("decrypt throws DecryptError on a tampered tag", () => {
        const ct = provider.aes128GcmEncrypt(key, nonce, plaintext, aad);
        ct[ct.length - 1]! ^= 0xff; // flip bits in the tag
        expect(() => provider.aes128GcmDecrypt(key, nonce, ct, aad)).toThrow(DecryptError);
    });

    it("decrypt throws DecryptError when the AAD differs", () => {
        const ct = provider.aes128GcmEncrypt(key, nonce, plaintext, aad);
        const otherAad = new TextEncoder().encode("wrong-aad");
        expect(() => provider.aes128GcmDecrypt(key, nonce, ct, otherAad)).toThrow(DecryptError);
    });
});

describe("AEAD: AES-256-GCM round-trips and authenticates", () => {
    const provider = new NodeCryptoProvider();
    const key = new Uint8Array(nodeRandomBytes(32));
    const nonce = new Uint8Array(nodeRandomBytes(12));
    const aad = new TextEncoder().encode("aad-256");
    const plaintext = new TextEncoder().encode("another secret");

    it("encrypt then decrypt recovers the plaintext", () => {
        const ct = provider.aes256GcmEncrypt(key, nonce, plaintext, aad);
        expect(ct.length).toBe(plaintext.length + 16);
        const recovered = provider.aes256GcmDecrypt(key, nonce, ct, aad);
        expect(recovered).toEqual(plaintext);
    });

    it("decrypt throws DecryptError on a tampered tag", () => {
        const ct = provider.aes256GcmEncrypt(key, nonce, plaintext, aad);
        ct[ct.length - 1]! ^= 0xff;
        expect(() => provider.aes256GcmDecrypt(key, nonce, ct, aad)).toThrow(DecryptError);
    });
});

describe("AEAD: ChaCha20-Poly1305 round-trips and authenticates", () => {
    const provider = new NodeCryptoProvider();
    const key = new Uint8Array(nodeRandomBytes(32));
    const nonce = new Uint8Array(nodeRandomBytes(12));
    const aad = new TextEncoder().encode("chacha-aad");
    const plaintext = new TextEncoder().encode("chacha secret");

    it("encrypt then decrypt recovers the plaintext", () => {
        const ct = provider.chacha20Poly1305Encrypt(key, nonce, plaintext, aad);
        expect(ct.length).toBe(plaintext.length + 16);
        const recovered = provider.chacha20Poly1305Decrypt(key, nonce, ct, aad);
        expect(recovered).toEqual(plaintext);
    });

    it("decrypt throws DecryptError on a tampered tag", () => {
        const ct = provider.chacha20Poly1305Encrypt(key, nonce, plaintext, aad);
        ct[ct.length - 1]! ^= 0xff;
        expect(() => provider.chacha20Poly1305Decrypt(key, nonce, ct, aad)).toThrow(DecryptError);
    });
});

describe("X25519 key exchange", () => {
    const provider = new NodeCryptoProvider();

    it("generateKeyPair yields 32-byte public and secret keys", () => {
        const { publicKey, secretKey } = provider.x25519GenerateKeyPair();
        expect(publicKey).toHaveLength(32);
        expect(secretKey).toHaveLength(32);
        // Public and secret must differ (a key is never its own scalar).
        expect(Buffer.from(publicKey).equals(Buffer.from(secretKey))).toBe(false);
    });

    it("two parties derive the same shared secret (DH symmetry)", () => {
        const a = provider.x25519GenerateKeyPair();
        const b = provider.x25519GenerateKeyPair();
        const secretAB = provider.x25519SharedSecret(a.secretKey, b.publicKey);
        const secretBA = provider.x25519SharedSecret(b.secretKey, a.publicKey);
        expect(secretAB).toHaveLength(32);
        expect(secretAB).toEqual(secretBA);
    });

    it("shared secret is not all-zero for a real key pair", () => {
        const a = provider.x25519GenerateKeyPair();
        const b = provider.x25519GenerateKeyPair();
        const secret = provider.x25519SharedSecret(a.secretKey, b.publicKey);
        const allZero = secret.every((byte) => byte === 0);
        expect(allZero).toBe(false);
    });
});

describe("verifySignature", () => {
    const provider = new NodeCryptoProvider();
    const message = new TextEncoder().encode("signed message");

    it("verifies an ECDSA P-256 SHA-256 signature over the raw message", () => {
        // Generate KeyObjects for signing; export the public key as DER separately.
        const { publicKey, privateKey } = generateKeyPairSync("ec", {
            namedCurve: "P-256",
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const signature = sign("sha256", message, { key: privateKey, dsaEncoding: "der" });
        const spkiDer = createPublicKey(publicKey).export({ type: "spki", format: "der" });
        expect(
            provider.verifySignature("ecdsa_secp256r1_sha256", new Uint8Array(spkiDer), new Uint8Array(signature), message),
        ).toBe(true);
    });

    it("rejects an ECDSA signature over a tampered message", () => {
        const { publicKey, privateKey } = generateKeyPairSync("ec", {
            namedCurve: "P-256",
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const signature = sign("sha256", message, { key: privateKey, dsaEncoding: "der" });
        const spkiDer = createPublicKey(publicKey).export({ type: "spki", format: "der" });
        const tampered = new TextEncoder().encode("tampered message");
        expect(
            provider.verifySignature("ecdsa_secp256r1_sha256", new Uint8Array(spkiDer), new Uint8Array(signature), tampered),
        ).toBe(false);
    });

    it("verifies an RSA-PSS SHA-256 signature over the raw message", () => {
        const { publicKey, privateKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const signature = new Uint8Array(sign("sha256", message, {
            key: privateKey,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
        }));
        const spkiDer = createPublicKey(publicKey).export({ type: "spki", format: "der" });
        expect(
            provider.verifySignature("rsa_pss_rsae_sha256", new Uint8Array(spkiDer), signature, message),
        ).toBe(true);
    });

    it("throws UnsupportedAlgorithmError for an unknown scheme", () => {
        const { publicKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "der" },
            privateKeyEncoding: { type: "pkcs8", format: "der" },
        });
        expect(() =>
            provider.verifySignature("not_a_real_scheme", new Uint8Array(publicKey), new Uint8Array(0), message),
        ).toThrow(/not_a_real_scheme/);
    });
});

describe("algorithm identifiers", () => {
    it("expose branded symmetric cipher ids", () => {
        expect(AES_128_GCM).toBe("AES-128-GCM");
        expect(AES_256_GCM).toBe("AES-256-GCM");
        expect(CHACHA20_POLY1305).toBe("ChaCha20-Poly1305");
    });

    it("expose branded hash ids", () => {
        expect(SHA_256).toBe("SHA-256");
        expect(SHA_384).toBe("SHA-384");
    });

    it("exposes the branded X25519 id", () => {
        expect(X25519).toBe("X25519");
    });
});

describe("id helpers", () => {
    it("createId prefixes and yields unique values", () => {
        const a = createId("test");
        const b = createId("test");
        expect(a.startsWith("test_")).toBe(true);
        expect(a).not.toBe(b);
    });

    it("createCryptoSessionId yields branded ids", () => {
        const id = createCryptoSessionId();
        expect(typeof id).toBe("string");
        expect(id.startsWith("csid_")).toBe(true);
    });
});

describe("assertNever", () => {
    it("throws on reachable code", () => {
        expect(() => assertNever(undefined as never)).toThrow(/Unexpected value/);
    });
});

describe("AeadCipher descriptors", () => {
    const aad = new TextEncoder().encode("descriptor-aad");
    const plaintext = new TextEncoder().encode("plaintext for descriptor round-trip");

    /** Round-trip a random key/nonce/plaintext through a descriptor, asserting sizes + tamper rejection. */
    function roundTrip(cipher: typeof aes128Gcm): void {
        const key = new Uint8Array(nodeRandomBytes(cipher.keySize));
        const nonce = new Uint8Array(nodeRandomBytes(cipher.nonceSize));
        const ct = cipher.encrypt(key, nonce, plaintext, aad);
        // Ciphertext is plaintext + appended tag.
        expect(ct.length).toBe(plaintext.length + cipher.tagSize);
        const recovered = cipher.decrypt(key, nonce, ct, aad);
        expect(recovered).toEqual(plaintext);

        // Tampering the last tag byte must be rejected.
        ct[ct.length - 1]! ^= 0xff;
        expect(() => cipher.decrypt(key, nonce, ct, aad)).toThrow(DecryptError);
    }

    it("aes128Gcm reports the NIST AES-128-GCM constants", () => {
        expect(aes128Gcm.id).toBe(AES_128_GCM);
        expect(aes128Gcm.keySize).toBe(16);
        expect(aes128Gcm.nonceSize).toBe(12);
        expect(aes128Gcm.tagSize).toBe(16);
    });

    it("aes256Gcm reports the NIST AES-256-GCM constants", () => {
        expect(aes256Gcm.id).toBe(AES_256_GCM);
        expect(aes256Gcm.keySize).toBe(32);
        expect(aes256Gcm.nonceSize).toBe(12);
        expect(aes256Gcm.tagSize).toBe(16);
    });

    it("chacha20Poly1305 reports the RFC 8439 constants", () => {
        expect(chacha20Poly1305.id).toBe(CHACHA20_POLY1305);
        expect(chacha20Poly1305.keySize).toBe(32);
        expect(chacha20Poly1305.nonceSize).toBe(12);
        expect(chacha20Poly1305.tagSize).toBe(16);
    });

    it("aes128Gcm round-trips and rejects a tampered tag", () => {
        roundTrip(aes128Gcm);
    });

    it("aes256Gcm round-trips and rejects a tampered tag", () => {
        roundTrip(aes256Gcm);
    });

    it("chacha20Poly1305 round-trips and rejects a tampered tag", () => {
        roundTrip(chacha20Poly1305);
    });

    it("CIPHER_BY_ID maps every branded id to its descriptor", () => {
        expect(CIPHER_BY_ID[AES_128_GCM]).toBe(aes128Gcm);
        expect(CIPHER_BY_ID[AES_256_GCM]).toBe(aes256Gcm);
        expect(CIPHER_BY_ID[CHACHA20_POLY1305]).toBe(chacha20Poly1305);
    });
});
