import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { PlatformSetting } from "@prisma/client";

import { PrismaService } from "../infrastructure/database/prisma.service.js";

import { PLATFORM_SETTINGS_ID, readPlatformSettings } from "./platform-settings.js";
import type { AppSettings, PlatformSettings, PlatformSettingsUpdate } from "./system.types.js";

const view = (row: PlatformSetting): PlatformSettings => ({
  announcement: row.announcement,
  supportPhone: row.supportPhone,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Platform settings (system admin plan phase 5, Q12): one home announcement for everyone and
 * one support phone. Everyone signed in reads them; only a super administrator saves them.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async app(): Promise<AppSettings> {
    const row = await readPlatformSettings(this.prisma);
    return { announcement: row.announcement, supportPhone: row.supportPhone };
  }

  async get(): Promise<PlatformSettings> {
    return view(await readPlatformSettings(this.prisma));
  }

  /** Optimistic on updatedAt; a save that changes nothing still records who saved. */
  async update(actorUserId: string, body: PlatformSettingsUpdate): Promise<PlatformSettings> {
    const previous = await readPlatformSettings(this.prisma);
    const changed = (["announcement", "supportPhone"] as const).filter((key) => previous[key] !== body[key]);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      const result = await transaction.platformSetting.updateMany({
        where: { id: PLATFORM_SETTINGS_ID, updatedAt: new Date(body.expectedUpdatedAt) },
        data: {
          announcement: body.announcement,
          supportPhone: body.supportPhone,
          updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
          updatedByUserId: actorUserId,
        },
      });
      if (result.count !== 1) throw new ConflictException({ message: "PLATFORM_SETTINGS_CHANGED_RELOAD" });
      await transaction.auditLog.create({
        data: {
          action: "PLATFORM_SETTINGS_UPDATED",
          actorUserId,
          entityId: PLATFORM_SETTINGS_ID,
          entityType: "platform_settings",
          metadata: { announcement: body.announcement, changed, supportPhone: body.supportPhone },
        },
      });
    });
    return this.get();
  }
}
