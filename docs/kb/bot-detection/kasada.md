# Kasada

**Product:** Kasada
**Fingerprint Approach:** TLS + HTTP/2 + cryptographic JavaScript challenges + header consistency

## Overview

Kasada uses a **cryptographic challenge** approach combined with protocol fingerprinting. Their JavaScript challenges are known for being particularly sophisticated, using cryptographic proofs that are expensive to compute.

## Detection Layers

### Layer 1: TLS Fingerprint
- JA3/JA4 from ClientHello
- TLS extension analysis

### Layer 2: HTTP/2 Fingerprint
- SETTINGS frame values and order
- Pseudo-header ordering

### Layer 3: Header Consistency
- Cross-layer verification
- Header presence and value checks

### Layer 4: Cryptographic Challenges
- Proof-of-work challenges (expensive to compute)
- Canvas fingerprinting
- WebGL
- AudioContext
- Navigator properties

## Detection Risk for browsercore

**HIGH** — Kasada's cryptographic challenges are expensive to bypass, but the protocol-level checks are standard.

## What browsercore Must Fix

1. TLS fingerprint accuracy
2. HTTP/2 fingerprint accuracy
3. Cross-layer header consistency

## References

- [Kasada](https://kasada.io/)
