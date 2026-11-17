/**
 * The impersonation-on-by-default client factory.
 *
 * Raw `@browsercore/fetch` treats `profile` as opt-in: no profile, no
 * impersonation. Right call for a protocol package, wrong one for the
 * composition root — people reaching for browsersmith want a browser
 * fingerprint without reading a config page first. So this entry flips the
 * default: every client impersonates `chrome-140` unless you pick another
 * profile, or pass `"none"` to go out on the runtime's own, plain stack.
 *
 * `@browsercore/fetch` itself keeps its opt-in semantics; only the
 * browsersmith entry defaults.
 *
 * @module
 */

import {
    createClient as createStackClient,
    fetch as fetchStack,
    type FetchClient,
    type FetchClientOptions,
    type FetchOptions,
    type FetchResponse,
} from "@browsercore/fetch";
import type { ProfileId } from "@browsercore/profiles";
import { CHROME_140 } from "./profiles.js";
import type { Platform } from "./platform/index.js";
import { platform as defaultPlatform } from "./wiring.js";

/** The profile every client impersonates when you don't ask for one. */
export const DEFAULT_PROFILE: ProfileId = CHROME_140;

/** Pass this as `profile` to skip impersonation (bare runtime stack). */
export const NO_IMPERSONATION = "none";

/** Any known/registered profile id, or {@link NO_IMPERSONATION}. */
export type ClientProfile = ProfileId | typeof NO_IMPERSONATION;

/**
 * Resolve what `@browsercore/fetch` should receive: the picked profile, or
 * {@link DEFAULT_PROFILE} when nothing was picked, or `undefined` (no
 * impersonation) for the `"none"` sentinel.
 */
export function resolveProfile(profile?: ClientProfile): ProfileId | undefined {
    if (profile === NO_IMPERSONATION) {
        return undefined;
    }
    return profile ?? DEFAULT_PROFILE;
}

/** `FetchClientOptions` with the browsersmith profile vocabulary. */
export type ClientInit = Omit<FetchClientOptions, "profile"> & { profile?: ClientProfile };

/** Per-request options with the browsersmith profile vocabulary. */
export type ClientRequestInit = Omit<FetchOptions, "profile"> & { profile?: ClientProfile };

/** {@link createClient} — but impersonation is on unless you turn it off. */
export function createClient(options?: ClientInit): FetchClient {
    const { profile, ...rest } = options ?? {};
    const resolved = resolveProfile(profile);
    return createStackClient({
        ...rest,
        ...(resolved !== undefined ? { profile: resolved } : {}),
    });
}

/** Top-level one-shot fetch — defaults to the wiring platform + {@link DEFAULT_PROFILE}. */
export function fetch(
    input: string,
    options?: ClientRequestInit,
    platform?: Platform,
): Promise<FetchResponse> {
    const { profile, ...rest } = options ?? {};
    const resolved = resolveProfile(profile);
    return fetchStack(
        input,
        { ...rest, ...(resolved !== undefined ? { profile: resolved } : {}) },
        platform ?? defaultPlatform,
    );
}
