import Taro from "@tarojs/taro";

export type RequestOptions = {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly data?: unknown;
  readonly auth?: boolean;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

type ApiResponse = { readonly statusCode: number; readonly data: unknown };

export class ApiError extends Error {
  readonly statusCode: number;
  readonly responseBody: unknown;
  constructor(statusCode: number, message: string, responseBody: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

const getAccessToken = (): string =>
  String(Taro.getStorageSync("accessToken") || "");
const getRefreshToken = (): string =>
  String(Taro.getStorageSync("refreshToken") || "");

const clearTokens = (): void => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
};

export const createApiClient = (baseUrl: string): ApiClient => {
  const send = async (
    path: string,
    options: RequestOptions,
    accessToken: string,
  ): Promise<ApiResponse> =>
    Taro.request({
      url: `${baseUrl}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header:
        accessToken.length > 0
          ? { Authorization: `Bearer ${accessToken}` }
          : {},
    }).catch((cause: unknown): never => {
      throw new ApiError(0, "网络连接未完成，请检查网络后重试。", cause);
    });

  const refresh = async (): Promise<string | null> => {
    const refreshToken = getRefreshToken();
    if (refreshToken.length === 0) {
      return null;
    }
    const res = await send(
      "/auth/refresh",
      {
        method: "POST",
        data: { refreshToken },
      },
      "",
    );
    if (
      res.statusCode === 200 &&
      res.data &&
      typeof (res.data as { accessToken?: string }).accessToken === "string"
    ) {
      const next = (res.data as { accessToken: string }).accessToken;
      Taro.setStorageSync("accessToken", next);
      return next;
    }
    return null;
  };

  const request = async <T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> => {
    const useAuth = options.auth !== false;
    let res = await send(path, options, useAuth ? getAccessToken() : "");

    if (res.statusCode === 401 && useAuth) {
      const next = await refresh();
      if (next === null) {
        clearTokens();
        await Taro.reLaunch({ url: "/pages/login/index" });
        throw new ApiError(401, "登录已过期，请重新登录。", res.data);
      }
      res = await send(path, options, next);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }
    if (res.statusCode === 401 && useAuth) {
      clearTokens();
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
    const code =
      typeof res.data === "object" &&
      res.data !== null &&
      "message" in res.data &&
      typeof res.data.message === "string"
        ? res.data.message
        : "";
    const messages: Readonly<Record<string, string>> = {
      ACCOUNT_NICKNAME_INVALID: "昵称须为 1 至 32 个字符，请修改后重试。",
      ACCOUNT_AVATAR_SIZE_INVALID: "头像不能为空且不能超过 2MB。",
      ACCOUNT_AVATAR_IMAGE_INVALID: "头像格式无效，请选择 JPG 或 PNG 图片。",
      USER_DISABLED: "当前账号已停用，请联系管理员。",
      INVALID_WECHAT_LOGIN_REQUEST: "微信登录凭据无效，请重新点击微信登录。",
      INVALID_BIND_BY_INVITATION_REQUEST: "请填写管理员提供的本人专属邀请码。",
      FACE_BOUND_PROFILE_REQUIRED: "请先绑定工人或管理员档案，再录入人脸。",
      FACE_APPROVED_PROFILE_REQUIRED:
        "请先录入人脸底照，并等待管理员审核通过。",
      FACE_VIDEO_PROVIDER_NOT_CONFIGURED: "视频活体服务尚未配置，请联系管理员。",
      FACE_NATIVE_PROVIDER_NOT_CONFIGURED: "当前未配置原生人脸核验渠道，请刷新后重试。",
      FACE_SESSION_PROVIDER_MISMATCH: "本次核验渠道不匹配，请重新开始。",
      FACE_SESSION_VIDEO_CHANGED: "本次会话的录像已固定，请重新开始核验。",
      FACE_PROVIDER_ACTION_SEQUENCE_INVALID: "核验动作配置异常，请联系管理员。",
      FACE_PROVIDER_ACTION_SEQUENCE_MISSING: "云服务未返回核验动作，请稍后重试。",
      FACE_PROVIDER_NOT_CONFIGURED: "人脸核验服务尚未开通，请联系管理员。",
      FACE_PROVIDER_REQUEST_FAILED: "人脸核验服务暂时不可用，请稍后重试。",
      FACE_PROVIDER_RESULT_NOT_READY: "核验结果还未返回，请稍后重试。",
      FACE_PROVIDER_INVALID_RESPONSE: "核验服务返回异常，请联系管理员。",
      FACE_PROVIDER_SESSION_MISMATCH: "核验结果与本次打卡不匹配，请重新核验。",
      FACE_RULE_MUST_USE_UPLOADED_PHOTO: "核验服务配置异常，请联系管理员。",
      FACE_VERIFIED_SESSION_REQUIRED: "请先完成本次人脸核验。",
      FACE_SESSION_ALREADY_USED: "本次核验已使用或已失效，请重新核验。",
      FACE_SESSION_EXPIRED: "人脸核验已过期，请重新核验。",
      FACE_SESSION_NOT_FOUND: "未找到本次核验，请重新操作。",
      FACE_SESSION_NOT_READY: "核验结果正在确认，请稍后重试。",
      FACE_VERIFICATION_TOO_FREQUENT: "人脸核验过于频繁，请一分钟后重试。",
      FACE_SELF_REVIEW_FORBIDDEN:
        "不能审核自己的人脸底照，请由其他管理员处理。",
      FACE_PROFILE_NOT_PENDING: "这份底照已被处理或更换，请刷新列表。",
      FACE_REVIEW_REASON_REQUIRED: "请填写审核说明。",
      FACE_IMAGE_INVALID: "照片格式无效，请使用清晰的 JPG 或 PNG 照片。",
      FACE_CONSENT_REQUIRED: "请阅读并同意人脸采集说明后重新提交。",
      BINDING_TARGET_PROFILE_ALREADY_BOUND:
        "该成员已经绑定账号，无需重复邀请。",
      BINDING_INVITATION_NOT_AVAILABLE:
        "邀请码无效、已过期或已使用，请联系管理员。",
      CURRENT_USER_ALREADY_BOUND: "当前账号已绑定身份，请返回首页。",
      MAKEUP_REQUEST_NOT_PENDING: "这条补卡申请已被处理，请刷新列表。",
      DEFAULT_SHIFT_NOT_CONFIGURED: "项目还未配置班次，请联系项目管理员。",
      DEFAULT_SHIFT_NOT_CONFIGURED_FOR_MAKEUP:
        "项目还未配置班次，暂不能申请补卡。",
      ATTENDANCE_DATE_NOT_SCHEDULED: "所选日期没有排班，请核对工作日期。",
      ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND:
        "当前账号尚未加入这个项目，请联系管理员。",
      INVITATION_NOT_PENDING: "这条邀请已失效或已接受，请刷新列表。",
    };
    const statusMessages: Readonly<Record<number, string>> = {
      400: "填写的信息不完整或格式有误，请检查后重试。",
      401: "登录已过期，请重新登录。",
      403: "当前身份没有此操作权限，请联系管理员。",
      404: "相关信息已不存在，请刷新页面。",
      409: "信息状态已变化，请刷新后重试。",
      429: "操作过于频繁，请稍后重试。",
    };
    throw new ApiError(
      res.statusCode,
      messages[code] ??
        statusMessages[res.statusCode] ??
        "服务暂时不可用，请稍后重试。",
      res.data,
    );
  };

  return { request };
};
