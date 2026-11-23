import type { PlatformSetting } from "@prisma/client";

import type { PrismaService } from "../infrastructure/database/prisma.service.js";

/** The one row of platform_settings (system admin plan phase 5, Q12). */
export const PLATFORM_SETTINGS_ID = "GLOBAL";

/**
 * The settings row. The migration inserts it; if it is missing anyway (a database built with
 * `db push`), an empty one is created so readers never fail.
 */
export const readPlatformSettings = async (prisma: PrismaService): Promise<PlatformSetting> => {
  const found = await prisma.platformSetting.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  if (found !== null) return found;
  await prisma.platformSetting.createMany({ data: [{ id: PLATFORM_SETTINGS_ID }], skipDuplicates: true });
  return prisma.platformSetting.findUniqueOrThrow({ where: { id: PLATFORM_SETTINGS_ID } });
};

/**
 * The support phone for messages that send people to the platform (an account disabled,
 * Q12), or null when none is set. Never fails the request it decorates.
 */
export const platformSupportPhone = async (prisma: PrismaService): Promise<string | null> => {
  try {
    const found = await prisma.platformSetting.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    return found === null || found.supportPhone === "" ? null : found.supportPhone;
  } catch {
    return null;
  }
};
