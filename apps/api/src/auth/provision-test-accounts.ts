import { randomBytes } from "node:crypto";

import { getHighestRoleCode } from "@construction/domain/roles.js";
import type { PrismaClient } from "@prisma/client";

import { LocalDiskStorage } from "../infrastructure/storage/local-disk-storage.js";
import { encryptPersonnelName, personnelNameSearchHashes } from "../management/personnel-name.js";
import { TEST_ACCOUNTS, TEST_ACCOUNT_CODES } from "./test-accounts.js";

const avatar: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
  "base64",
);

/** Prepare only the five existing synthetic identities; preserve roles, memberships and face records. */
export const provisionTestAccounts = async (
  database: PrismaClient,
  encryptionKey: string,
  uploadsDirectory: string,
): Promise<void> => {
  const storage: LocalDiskStorage = new LocalDiskStorage(uploadsDirectory);
  const objectKey: string = "test-accounts/avatar.png";
  await storage.put(objectKey, avatar, "image/png");
  await database.$transaction(async (transaction): Promise<void> => {
    for (const code of TEST_ACCOUNT_CODES) {
      const account = TEST_ACCOUNTS[code];
      const user = await transaction.user.findUnique({
        where: { openid: code },
        include: { workerProfile: true, managerProfile: true, roles: { include: { role: true } } },
      });
      if (user === null || !user.isBound || user.status !== "ACTIVE" ||
          getHighestRoleCode(user.roles.map((assignment) => ({ roleCode: assignment.role.code }))) !== account.roleCode ||
          (user.workerProfile === null && user.managerProfile === null)) {
        throw new Error(`Test fixture ${code} is missing or has unexpected roles/binding; initialize and inspect its fixtures first.`);
      }
      const encryptedName: string = encryptPersonnelName(account.name, encryptionKey, randomBytes(12));
      await transaction.user.update({ where: { id: user.id }, data: {
        nickname: account.name, phone: account.phone, encryptedRealName: encryptedName,
        avatarObjectKey: objectKey, avatarContentType: "image/png",
      } });
      if (user.workerProfile !== null) {
        await transaction.workerProfile.update({ where: { id: user.workerProfile.id }, data: {
          encryptedName, phone: account.phone, nameSearchHashes: [...personnelNameSearchHashes(account.name, encryptionKey)],
        } });
      }
      if (user.managerProfile !== null) {
        await transaction.managerProfile.update({ where: { id: user.managerProfile.id }, data: {
          name: account.name, phone: account.phone,
        } });
      }
      await transaction.auditLog.create({ data: {
        action: "TEST_ACCOUNT_PROVISIONED", entityType: "User", entityId: user.id, metadata: { account: code },
      } });
    }
  });
};
