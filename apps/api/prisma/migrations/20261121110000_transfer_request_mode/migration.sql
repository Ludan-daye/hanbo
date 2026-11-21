-- Transfer requests choose 调走 (MOVE, default from 2026-11-21 Q11) or 兼任 (CONCURRENT).
-- Requests made before this date were approved as 兼任 (the source membership stayed),
-- so existing rows are marked CONCURRENT.
ALTER TABLE "personnel_transfer_requests" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'MOVE';

UPDATE "personnel_transfer_requests" SET "mode" = 'CONCURRENT';
