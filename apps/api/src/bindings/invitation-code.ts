import { randomBytes } from "node:crypto";

import { hashSensitiveToken } from "../auth/auth.service.js";

/** Binding invitations last a week. */
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type IssuedInvitationCode = {
  /** Shown once to the person who issues it; only the hash is stored. */
  readonly code: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
};

/** A fresh binding invitation code (project and company invitations share it). */
export const issueInvitationCode = (now: Date): IssuedInvitationCode => {
  const code = randomBytes(24).toString("base64url");
  return {
    code,
    codeHash: hashSensitiveToken(code),
    expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
  };
};
