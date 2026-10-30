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
type RequestSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
};
type PendingRefresh = {
  readonly refreshToken: string;
  readonly promise: Promise<string | null>;
};

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
  let pendingRefresh: PendingRefresh | null = null;

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

  const assertCurrentSession = (session: RequestSession): void => {
    if (getRefreshToken() !== session.refreshToken)
      throw new ApiError(401, "登录状态已变更，请重新打开当前页面。", {
        message: "REQUEST_SESSION_CHANGED",
      });
  };

  const refresh = async (session: RequestSession): Promise<string | null> => {
    const res = await send(
      "/auth/refresh",
      {
        method: "POST",
        data: { refreshToken: session.refreshToken },
      },
      "",
    );
    assertCurrentSession(session);
    if (res.statusCode === 401) return null;
    if (res.statusCode < 200 || res.statusCode >= 300)
      throw new ApiError(
        res.statusCode,
        "登录状态刷新失败，请稍后重试。",
        res.data,
      );
    if (
      typeof res.data !== "object" ||
      res.data === null ||
      !("accessToken" in res.data) ||
      typeof res.data.accessToken !== "string" ||
      res.data.accessToken.length === 0
    )
      throw new ApiError(502, "登录服务返回异常，请稍后重试。", res.data);
    const next: string = res.data.accessToken;
    Taro.setStorageSync("accessToken", next);
    return next;
  };

  const refreshedToken = async (
    session: RequestSession,
  ): Promise<string | null> => {
    assertCurrentSession(session);
    const currentToken: string = getAccessToken();
    if (currentToken !== session.accessToken && currentToken.length > 0)
      return currentToken;
    if (session.refreshToken.length === 0) return null;
    if (pendingRefresh?.refreshToken === session.refreshToken)
      return pendingRefresh.promise;
    const pending: PendingRefresh = {
      refreshToken: session.refreshToken,
      promise: refresh(session),
    };
    pendingRefresh = pending;
    try {
      return await pending.promise;
    } finally {
      if (pendingRefresh === pending) pendingRefresh = null;
    }
  };

  const expireSession = async (
    session: RequestSession,
    accessToken: string,
  ): Promise<void> => {
    if (
      getRefreshToken() === session.refreshToken &&
      getAccessToken() === accessToken
    ) {
      clearTokens();
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
  };

  const request = async <T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> => {
    const useAuth = options.auth !== false;
    const session: RequestSession = {
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
    };
    let accessToken: string = useAuth ? session.accessToken : "";
    let res = await send(path, options, accessToken);

    if (res.statusCode === 401 && useAuth) {
      const next = await refreshedToken(session);
      if (next === null) {
        await expireSession(session, accessToken);
        throw new ApiError(401, "登录已过期，请重新登录。", res.data);
      }
      accessToken = next;
      res = await send(path, options, accessToken);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }
    if (res.statusCode === 401 && useAuth) {
      await expireSession(session, accessToken);
    }
    const code =
      typeof res.data === "object" &&
      res.data !== null &&
      "message" in res.data &&
      typeof res.data.message === "string"
        ? res.data.message
        : "";
    const messages: Readonly<Record<string, string>> = {
      TEST_LOGIN_DISABLED: "当前环境未开放测试人员登录。",
      TEST_LOGIN_INVALID_CREDENTIALS: "测试口令不正确，请核对后重试。",
      INVALID_TEST_LOGIN_REQUEST: "请选择测试身份并填写测试口令。",
      TEST_ACCOUNT_NOT_READY: "测试账号尚未初始化，请联系管理员。",
      PERSONNEL_NAME_FORMAT_INVALID: "人员档案姓名格式异常，请联系管理员修复历史测试资料。",
      INVALID_UPDATE_TEAM_REQUEST: "请核对班组名称、状态、工种和负责人。",
      PROJECT_TEAM_NAME_ALREADY_EXISTS: "此项目已有同名班组，请更换名称。",
      PROJECT_TEAM_NOT_FOUND: "班组不存在或已变更，请返回列表刷新。",
      TEAM_CHANGED_RELOAD_BEFORE_SAVING:
        "班组资料已被更新，请重新进入后再保存。",
      TEAM_LEADER_MUST_BE_ACTIVE_TEAM_MEMBER:
        "负责人必须是本班组的在场成员，请重新选择。",
      PERSONNEL_REUSE_SOURCE_NOT_ALLOWED:
        "需要同一公司内来源项目的管理权限，才能复用人员。",
      INVALID_REUSE_PARTICIPANT_REQUEST:
        "请核对来源人员、目标岗位、班组及进场日期。",
      REUSE_PROFILE_NOT_ACTIVE: "该人员的基础档案已停用，请先由管理员核实。",
      PROJECT_MANAGERS_NOT_ELIGIBLE: "所选管理员已停用或不属于本公司，请重新选择。",
      INVALID_CREATE_PROJECT_REQUEST: "请检查项目资料，并至少选择一名项目管理员。",
      INVALID_ADDITIONAL_MEMBER_ROLES: "职级或管理班组重复，请重新选择兼任职级。",
      ROLE_SCOPE_NOT_FOUND: "工作范围已变更，请联系管理员核对授权。",
      PROJECT_MEMBER_ALREADY_EXISTS:
        "此人员已在本项目，请在人员列表恢复或编辑已有任职。",
      INVALID_PARTICIPANT_REQUEST:
        "请核对姓名、手机号、工种、岗位及进退场日期。",
      INVALID_UPDATE_PROJECT_REQUEST:
        "请核对项目资料、联系电话、定位及计划日期。",
      PROJECT_MEMBER_PHONE_ALREADY_EXISTS:
        "此项目已有相同手机号的成员，请编辑已有档案。",
      MEMBER_CHANGED_RELOAD_BEFORE_SAVING:
        "成员资料已被更新，请返回列表后重新进入编辑。",
      PROJECT_CHANGED_RELOAD_BEFORE_SAVING:
        "项目资料已被更新，请重新加载后再保存。",
      TEAM_DOES_NOT_BELONG_TO_PROJECT: "所选班组不属于当前项目，请重新选择。",
      PARTICIPANT_TYPE_CANNOT_CHANGE:
        "已建档成员不能直接切换工人或管理人员身份。",
      CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT:
        "请由其他管理员调整你本人的角色、班组或在场状态。",
      SHARED_PROFILE_REQUIRES_ALL_PROJECT_PERMISSIONS:
        "该人员同时属于其他项目，基础资料请由有相应权限的管理员修改。",
      PERSONNEL_ENCRYPTION_KEY_NOT_CONFIGURED:
        "人员资料服务尚未配置，请联系系统管理员。",
      PROJECT_COMPANY_CANNOT_CHANGE: "不能通过项目设置变更所属公司。",
      PROJECT_CODE_ALREADY_EXISTS:
        "该项目编号已被同一公司其他项目使用，请更换编号。",
      ACCOUNT_PROFILE_REQUIRED: "请先完善头像、昵称、真实姓名和手机号。",
      WORKER_REGISTRATION_REQUIRED: "请先补齐身份证、住址、紧急联系人、健康、保险及工资银行卡资料。",
      WORKER_REGISTRATION_INVALID: "用工资料不完整或格式有误，请核对全部必填项。",
      WORKER_PROFILE_NOT_BOUND: "请先用邀请码绑定本人工人档案。",
      WORKER_IDENTITY_CHANGE_REQUIRES_REVIEW: "身份证号与已有档案不一致，请联系管理员核实。",
      WORKER_ID_NUMBER_ALREADY_EXISTS: "该身份证号已有人员档案，请联系管理员核对绑定。",
      FACE_LOCATION_REQUIRED: "请重新获取 GPS 位置后再开始刷脸。",
      LOCATION_ACCURACY_INSUFFICIENT: "定位精度不足，请到开阔位置后重试。",
      OUTSIDE_GEOFENCE: "不在考勤范围内，无法打卡。请进入项目范围后重新打卡。",
      ACCOUNT_BINDING_REQUIRED: "请先使用邀请码绑定本人档案。",
      ACCOUNT_PROFILE_INVALID: "请填写有效昵称、真实姓名和 11 位手机号。",
      ACCOUNT_IDENTITY_MISMATCH:
        "姓名或手机号与人员档案不一致，请核对填写内容或联系管理员。",
      ACCOUNT_NICKNAME_INVALID: "昵称须为 1 至 32 个字符，请修改后重试。",
      ACCOUNT_AVATAR_SIZE_INVALID: "头像不能为空且不能超过 2MB。",
      ACCOUNT_AVATAR_IMAGE_INVALID: "头像格式无效，请选择 JPG 或 PNG 图片。",
      USER_DISABLED: "当前账号已停用，请联系管理员。",
      INVALID_WECHAT_LOGIN_REQUEST: "微信登录凭据无效，请重新点击微信登录。",
      INVALID_BIND_BY_INVITATION_REQUEST: "请填写管理员提供的本人专属邀请码。",
      FACE_BOUND_PROFILE_REQUIRED: "请先绑定工人或管理员档案，再录入人脸。",
      FACE_APPROVED_PROFILE_REQUIRED:
        "请先录入人脸底照，并等待管理员审核通过。",
      FACE_VIDEO_PROVIDER_NOT_CONFIGURED:
        "视频活体服务尚未配置，请联系管理员。",
      FACE_NATIVE_PROVIDER_NOT_CONFIGURED:
        "当前未配置原生人脸核验渠道，请刷新后重试。",
      FACE_SESSION_PROVIDER_MISMATCH: "本次核验渠道不匹配，请重新开始。",
      FACE_SESSION_VIDEO_CHANGED: "本次会话的录像已固定，请重新开始核验。",
      FACE_PROVIDER_ACTION_SEQUENCE_INVALID: "核验动作配置异常，请联系管理员。",
      FACE_PROVIDER_ACTION_SEQUENCE_MISSING:
        "云服务未返回核验动作，请稍后重试。",
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
