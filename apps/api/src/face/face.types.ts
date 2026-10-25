import type {
  AttendancePointCode,
  FaceProfile,
  ProfileOwnerType,
} from "@prisma/client";

export const FACE_CONSENT_VERSION = "face-attendance-v1";
export const FACE_CONSENT_TEXT =
  "我同意为本人考勤采集人脸底照，并在打卡时由腾讯云进行活体检测和本人比对；人脸资料仅用于考勤核验，由授权管理员审核。不同意或无法刷脸时，可联系管理员使用人工考勤或补卡审批。";

export type FaceOwner = {
  readonly ownerType: ProfileOwnerType;
  readonly ownerId: string;
};

export type FaceSessionContext = {
  readonly userId: string;
  readonly projectId: string;
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly owner: FaceOwner;
};

export type IssuedFaceSession = {
  readonly id: string;
  readonly bizToken: string;
  readonly expiresAt: string;
};
export type IssuedVideoFaceSession = {
  readonly id: string;
  readonly actionSequence: readonly ("1" | "2")[];
  readonly expiresAt: string;
};
export type CompletedFaceSession = {
  readonly id: string;
  readonly status: string;
  readonly expiresAt: string;
};

export type FaceProfileResponse = Pick<
  FaceProfile,
  "id" | "ownerType" | "ownerId" | "status" | "version" | "reviewReason"
> & {
  readonly createdAt: string;
  readonly reviewedAt: string | null;
};

export type MyFaceResponse = {
  readonly mode: "DEVELOPMENT" | "WECHAT_NATIVE" | "VIDEO_ACTION" | "UNCONFIGURED";
  readonly consentVersion: string;
  readonly consentText: string;
  readonly profile: FaceProfileResponse | null;
};

export const faceProfileResponse = (
  profile: FaceProfile,
): FaceProfileResponse => ({
  id: profile.id,
  ownerType: profile.ownerType,
  ownerId: profile.ownerId,
  status: profile.status,
  version: profile.version,
  reviewReason: profile.reviewReason,
  createdAt: profile.createdAt.toISOString(),
  reviewedAt: profile.reviewedAt?.toISOString() ?? null,
});
