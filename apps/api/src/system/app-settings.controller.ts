import { Controller, Get, Header, Inject, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";

import { PlatformSettingsService } from "./platform-settings.service.js";
import type { AppSettings } from "./system.types.js";

/** GET /app/settings: the home announcement and support phone, for anyone signed in (Q12). */
@Controller("app")
export class AppSettingsController {
  constructor(@Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService) {}

  @Get("settings")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessTokenGuard)
  async settingsForEveryone(): Promise<AppSettings> {
    return this.settings.app();
  }
}
