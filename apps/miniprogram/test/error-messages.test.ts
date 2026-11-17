import { describe, expect, it } from "vitest";

import { ApiError } from "../src/services/apiClient";
import {
  errorMessage,
  isUserCancel,
  messageForApiError,
} from "../src/services/error-messages";

describe("messageForApiError", () => {
  it("maps known constants to Chinese copy", () => {
    expect(messageForApiError(403, "MAKEUP_APPROVAL_DENIED")).toContain("本人");
    expect(messageForApiError(400, "UPLOAD_CONTENT_TYPE_NOT_ALLOWED")).toContain("JPG");
  });

  it("passes through server-side Chinese messages below 500", () => {
    expect(messageForApiError(409, "违规时间不在该人员在场期间")).toBe(
      "违规时间不在该人员在场期间",
    );
    expect(messageForApiError(500, "内部错误")).toBe("服务暂时不可用，请稍后重试。");
  });

  it("falls back to status copy, then the caller's fallback", () => {
    expect(messageForApiError(403, "SOMETHING_NEW")).toContain("权限");
    expect(messageForApiError(418, "SOMETHING_NEW", "自定义")).toBe("自定义");
    expect(messageForApiError(418, "")).toBe("操作未完成，请稍后重试。");
  });
});

describe("errorMessage", () => {
  it("keeps ApiError messages", () => {
    expect(errorMessage(new ApiError(409, "已处理", {}))).toBe("已处理");
  });

  it("translates raw constants and WeChat errMsg", () => {
    expect(errorMessage(new Error("UPLOAD_RESPONSE_INVALID"))).toContain("上传");
    expect(errorMessage(new Error("UNKNOWN_CODE"), "兜底")).toBe("兜底");
    expect(errorMessage({ errMsg: "getLocation:fail auth deny" })).toContain("授权");
    expect(errorMessage({ errMsg: "getLocation:fail timeout" })).toContain("定位超时");
    expect(errorMessage({ errMsg: "chooseMedia:fail something" })).toContain("拍摄");
  });

  it("returns plain Chinese messages unchanged", () => {
    expect(errorMessage(new Error("请填写姓名"))).toBe("请填写姓名");
    expect(errorMessage(null, "兜底")).toBe("兜底");
  });
});

describe("isUserCancel", () => {
  it("detects user cancellation from WeChat and Error", () => {
    expect(isUserCancel({ errMsg: "chooseImage:fail cancel" })).toBe(true);
    expect(isUserCancel({ errMsg: "makePhoneCall:fail cancel" })).toBe(true);
    expect(isUserCancel(new Error("chooseLocation:fail cancel"))).toBe(true);
    expect(isUserCancel({ errMsg: "getLocation:fail timeout" })).toBe(false);
  });
});
