# PerimeterX / HUMAN

**Product:** PerimeterX Bot Defender (now HUMAN Security)
**Fingerprint Approach:** TLS + HTTP/2 + behavioral biometrics + JavaScript challenges + cookie behavior

## Overview

PerimeterX (rebranded as HUMAN Security) uses a combination of wire-level protocol fingerprints, behavioral biometrics, and JavaScript challenges. Their approach is notable for its focus on **navigation patterns** and **behavioral signals** in addition to protocol fingerprints.

## Detection Layers

### Layer 1: TLS Fingerprint
- JA3/JA4 from ClientHello
- TLS extension analysis
- Cipher suite analysis

### Layer 2: HTTP/2 Fingerprint
- SETTINGS frame values and order
- Pseudo-header ordering
- Header ordering

### Layer 3: Header Consistency
- Cross-layer verification
- Header presence and value checks

### Layer 4: Cookie Behavior
- `_px` cookie family validation
- Cookie format and encoding analysis
- Cookie acceptance patterns

### Layer 5: Behavioral Biometrics
- Mouse movement patterns
- Keystroke dynamics
- Touch event patterns (mobile)
- Navigation timing

### Layer 6: JavaScript Challenges
- Canvas fingerprinting
- WebGL
- AudioContext
- Navigator properties
- WebRTC leak detection
- Font enumeration
- Screen properties

## Detection Risk for browsercore

**HIGH** for Layers 1-3. PerimeterX is known for strict cross-layer consistency checks.

## What browsercore Must Fix

1. TLS fingerprint accuracy
2. HTTP/2 fingerprint accuracy
3. Cross-layer header consistency

## References

- [HUMAN Security](https://www.humansecurity.com/)
- [PerimeterX Bot Defender](https://www.humansecurity.com/products/bot-defender)
