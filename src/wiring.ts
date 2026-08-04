import { connect } from "@browsercore/transport";
import { crypto } from "@browsercore/crypto";

export const defaultTransportFactory = (host: string, port: number) =>
    connect({ host, port });

export const defaultCryptoProvider = crypto;
