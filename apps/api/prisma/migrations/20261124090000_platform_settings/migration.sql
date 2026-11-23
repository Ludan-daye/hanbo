-- Platform settings (2026-11-23, system admin plan phase 5, Q12): one row for the whole
-- platform, holding the home announcement (at most 160 characters) and the support phone.
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "announcement" TEXT NOT NULL DEFAULT '',
    "supportPhone" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_settings_single_row_check" CHECK ("id" = 'GLOBAL'),
    CONSTRAINT "platform_settings_announcement_length_check" CHECK (char_length("announcement") <= 160)
);

-- The one row exists from the start, empty: no announcement, no phone.
INSERT INTO "platform_settings" ("id", "announcement", "supportPhone", "updatedAt")
VALUES ('GLOBAL', '', '', CURRENT_TIMESTAMP);
