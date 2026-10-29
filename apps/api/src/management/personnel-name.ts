import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";

import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";

const requireKey = (keyHex: string): Buffer => {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new ServiceUnavailableException({
      message: "PERSONNEL_ENCRYPTION_KEY_NOT_CONFIGURED",
    });
  }
  return Buffer.from(keyHex, "hex");
};

export const encryptPersonnelName = (
  name: string,
  keyHex: string,
  nonce: Buffer,
): string => {
  const cipher = createCipheriv("aes-256-gcm", requireKey(keyHex), nonce);
  const encrypted: Buffer = Buffer.concat([
    cipher.update(name, "utf8"),
    cipher.final(),
  ]);
  return [
    "name-v1",
    nonce.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
};

export const decryptPersonnelName = (
  encryptedName: string,
  keyHex: string,
): string => {
  const key: Buffer = requireKey(keyHex);
  if (
    !/^name-v1:[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/.test(encryptedName)
  ) {
    throw new InternalServerErrorException({
      message: "PERSONNEL_NAME_FORMAT_INVALID",
    });
  }
  const parts: string[] = encryptedName.split(":");
  const nonce: string = parts[1]!;
  const tag: string = parts[2]!;
  const ciphertext: string = parts[3]!;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
};

export const personnelSearchHash = (prefix: string, keyHex: string): string =>
  createHmac("sha256", requireKey(keyHex))
    .update(
      `personnel-name-prefix\u0000${prefix.normalize("NFKC").toLowerCase()}`,
    )
    .digest("hex");

export const personnelNameSearchHashes = (
  name: string,
  keyHex: string,
): readonly string[] => {
  const characters: string[] = Array.from(name.normalize("NFKC").toLowerCase());
  return characters.map((_character: string, index: number): string =>
    personnelSearchHash(characters.slice(0, index + 1).join(""), keyHex),
  );
};
