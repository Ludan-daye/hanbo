export const API_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  REGISTRATION_SELF_VERIFY_FORBIDDEN: "不能核实自己的用工资料，请其他管理员办理。",
  REGISTRATION_NOT_SUBMITTED: "他还没填用工登记，不能核实。",
  REGISTRATION_CHANGED_RELOAD_BEFORE_SAVING:
    "资料刚有变化，请返回后重新打开再核实。",
  REGISTRATION_ONLY_FOR_WORKERS: "管理人员没有用工登记。",
  INVALID_REGISTRATION_VERIFICATION_REQUEST: "核实请求不完整，请重新打开再试。",
  MANAGEMENT_ASSIGNMENT_REQUIRES_HIGHER_ROLE:
    "项目管理员的任免和调整要由公司管理员办理。",
  INVALID_OVERVIEW_QUERY: "日期不对，请返回首页重新打开。",
  INVALID_MAKEUP_INBOX_QUERY: "补卡列表的筛选条件不对，请返回重新打开。",
  TEST_LOGIN_DISABLED: "当前环境未开放测试人员登录。",
  INVALID_TEST_LOGIN_REQUEST: "测试登录请求无效，请重新选择测试身份。",
  TEST_ACCOUNT_NOT_READY: "测试账号尚未初始化，请联系管理员。",
  PERSONNEL_NAME_FORMAT_INVALID: "档案姓名格式异常，请联系管理员修正。",
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
    "跨项目人员资料须由有权限的管理员修改。",
  PERSONNEL_ENCRYPTION_KEY_NOT_CONFIGURED:
    "人员资料服务尚未配置，请联系系统管理员。",
  PROJECT_COMPANY_CANNOT_CHANGE: "不能通过项目设置变更所属公司。",
  PROJECT_CODE_ALREADY_EXISTS:
    "该项目编号已被同一公司其他项目使用，请更换编号。",
  ACCOUNT_PROFILE_REQUIRED: "请先完善真实姓名和手机号。",
  WORKER_REGISTRATION_REQUIRED: "请完成用工登记各项必填资料。",
  WORKER_REGISTRATION_INVALID: "用工资料不完整或格式有误，请核对全部必填项。",
  WORKER_PROFILE_NOT_BOUND: "请先用邀请码绑定本人工人档案。",
  WORKER_IDENTITY_CHANGE_REQUIRES_REVIEW: "身份证号与已有档案不一致，请联系管理员核实。",
  WORKER_ID_NUMBER_ALREADY_EXISTS: "该身份证号已有人员档案，请联系管理员核对绑定。",
  FACE_LOCATION_REQUIRED: "请重新获取 GPS 位置后再开始刷脸。",
  LOCATION_ACCURACY_INSUFFICIENT: "定位精度不足，请到开阔位置后重试。",
  OUTSIDE_GEOFENCE: "超出考勤范围，请到场后打卡。",
  ACCOUNT_BINDING_REQUIRED: "请先使用邀请码绑定本人档案。",
  ACCOUNT_PROFILE_INVALID: "请填写真实姓名和 11 位手机号，昵称最多 32 个字符。",
  ACCOUNT_IDENTITY_MISMATCH:
    "姓名或手机号与档案不符，请核对或联系管理员。",
  ACCOUNT_NICKNAME_INVALID: "昵称须为 1 至 32 个字符，请修改后重试。",
  ACCOUNT_AVATAR_SIZE_INVALID: "头像不能为空且不能超过 2MB。",
  ACCOUNT_AVATAR_IMAGE_INVALID: "头像格式无效，请选择 JPG 或 PNG 图片。",
  USER_DISABLED: "当前账号已停用，请联系管理员。",
  INVALID_WECHAT_LOGIN_REQUEST: "微信登录凭据无效，请重新点击微信登录。",
  INVALID_BIND_BY_INVITATION_REQUEST: "请输入本人专属邀请码。",
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
  SAFETY_CONFIRMATION_REQUIRED: "请先阅读并确认本次安全交底。",
  SAFETY_CONFIRMATION_EXPIRED: "安全确认已失效或已使用，请重新确认后刷脸。",
  SAFETY_BRIEFING_CHANGED: "班组长更新了安全交底，请重新阅读并确认。",
  SAFETY_FACE_SESSION_MISMATCH: "本次刷脸与安全确认不一致，请重新确认后刷脸。",
  SAFETY_CONFIRMATION_TOO_FREQUENT: "确认过于频繁，请稍后再试。",
  SAFETY_CONFIRMATION_INVALID: "安全确认内容不完整，请重新读取交底。",
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
  FACE_IMAGE_INVALID: "照片须为清晰的 JPG 或 PNG。",
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
  MAKEUP_APPROVAL_DENIED: "不能审批本人的补卡申请，请由其他负责人处理。",
  MAKEUP_PARTICIPANT_MEMBERSHIP_NOT_FOUND:
    "当前账号尚未加入这个项目，暂不能申请补卡。",
  MAKEUP_REQUESTED_OCCURRED_AT_DATE_MISMATCH:
    "补卡时间与所选日期不一致，请重新选择。",
  REQUESTED_OCCURRED_AT_DATE_MISMATCH: "补卡时间与所选日期不一致，请重新选择。",
  ATTENDANCE_OCCURRED_AT_DATE_MISMATCH: "打卡时间与考勤日期不一致，请重新打卡。",
  ATTENDANCE_POINT_NOT_SCHEDULED: "当前时段没有安排打卡，请核对打卡安排。",
  ATTENDANCE_PLAN_NOT_FOUND: "当前没有可用的打卡安排，请联系班组长。",
  INVALID_ATTENDANCE_DATE: "考勤日期无效，请重新选择。",
  PROJECT_MEMBERSHIP_REQUIRED: "当前账号尚未加入这个项目，请联系管理员。",
  SCHEDULE_HISTORY_IS_IMMUTABLE_USE_A_FUTURE_START_DATE:
    "已生效的打卡安排不能修改，请选择今天或之后的生效日期。",
  SCHEDULE_START_MUST_FOLLOW_THE_LATEST_VERSION:
    "生效日期须晚于当前最新的打卡安排。",
  UPLOAD_FILE_REQUIRED: "请先选择照片。",
  UPLOAD_CONTENT_TYPE_NOT_ALLOWED: "照片须为 JPG 或 PNG 格式。",
  UPLOAD_IMAGE_CONTENT_INVALID: "照片内容无法识别，请重新拍摄。",
  UPLOAD_FILE_TOO_LARGE: "照片过大，请重新拍摄后上传。",
  UPLOAD_RESPONSE_INVALID: "上传结果异常，请重新上传。",
  FACE_VIDEO_SIZE_INVALID: "录像超过 5MB，请重新录制。",
  REQUEST_FAILED: "操作未完成，请稍后重试。",
};

export const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: "填写的信息不完整或格式有误，请检查后重试。",
  401: "登录已过期，请重新登录。",
  403: "当前身份没有此操作权限，请联系管理员。",
  404: "相关信息已不存在，请刷新页面。",
  409: "信息状态已变化，请刷新后重试。",
  413: "文件过大，请压缩后重新上传。",
  429: "操作过于频繁，请稍后重试。",
};

const CJK = /[㐀-鿿]/;
const SCREAMING = /^[A-Z][A-Z0-9_]+$/;

/** 服务端错误 → 用户可读文案。服务端已返回中文说明时直接透传。 */
export const messageForApiError = (
  statusCode: number,
  code: string,
  fallback?: string,
): string =>
  API_ERROR_MESSAGES[code] ??
  (statusCode < 500 && CJK.test(code) ? code : undefined) ??
  STATUS_MESSAGES[statusCode] ??
  fallback ??
  (statusCode >= 500 ? "服务暂时不可用，请稍后重试。" : "操作未完成，请稍后重试。");

const wechatErrMsg = (cause: unknown): string | null => {
  if (typeof cause === "object" && cause !== null && "errMsg" in cause) {
    const m = (cause as { errMsg?: unknown }).errMsg;
    return typeof m === "string" ? m : null;
  }
  return null;
};

/** 用户主动取消（取消拍照、取消拨号、取消选择位置等），不应当作错误提示。 */
export const isUserCancel = (cause: unknown): boolean => {
  const m = wechatErrMsg(cause) ?? (cause instanceof Error ? cause.message : "");
  return /fail\s*cancel|cancelled|canceled|用户取消/i.test(m);
};

const WECHAT_FAIL_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/auth\s*deny|authorize/i, "未授权，请在微信设置中允许本小程序使用相机和定位。"],
  [/getLocation.*timeout|location.*timeout/i, "定位超时，请到开阔位置后重试。"],
  [/getLocation|location/i, "定位未完成，请检查手机定位是否开启。"],
  [/chooseMedia|chooseImage|chooseVideo|camera/i, "拍摄未完成，请重新拍摄。"],
  [/uploadFile|request.*timeout|timeout/i, "网络超时，请检查网络后重试。"],
  [/network|request:fail/i, "网络连接未完成，请检查网络后重试。"],
  [/makePhoneCall/i, "拨号未完成，请手动拨打。"],
  [/openLocation|chooseLocation/i, "地图打开未完成，请稍后重试。"],
];

/**
 * 任意异常 → 用户可读文案。
 * 处理 ApiError、普通 Error、微信 errMsg 以及服务端常量；用户取消时返回 fallback 不合适，请先用 isUserCancel 判断。
 */
export const errorMessage = (cause: unknown, fallback = "操作未完成，请稍后重试。"): string => {
  if (cause instanceof Error && cause.name === "ApiError") return cause.message;
  const raw =
    wechatErrMsg(cause) ??
    (cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "");
  if (raw.length === 0) return fallback;
  if (SCREAMING.test(raw)) return API_ERROR_MESSAGES[raw] ?? fallback;
  if (/:fail/.test(raw)) {
    const hit = WECHAT_FAIL_MESSAGES.find(([re]) => re.test(raw));
    return hit ? hit[1] : fallback;
  }
  return raw;
};
