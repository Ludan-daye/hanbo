import { BadRequestException } from "@nestjs/common";

import type { UploadedMultipartFile } from "../uploads/uploads.types.js";

export const requireFaceVideo = (
  file: UploadedMultipartFile | undefined,
): Buffer => {
  if (file === undefined || file.size === 0 || file.size > 5 * 1024 * 1024)
    throw new BadRequestException({ message: "FACE_VIDEO_SIZE_INVALID" });
  if (file.buffer.length < 12 || file.buffer.toString("ascii", 4, 8) !== "ftyp")
    throw new BadRequestException({ message: "FACE_VIDEO_MP4_REQUIRED" });
  return file.buffer;
};
