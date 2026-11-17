export type StateKind = "loading" | "error" | "empty";

const ERROR_TITLE = /失败|错误|出错|未完成|无法|异常/;
const LOADING_TITLE = /加载|读取|正在|…$/;

/**
 * 按标题文案推断状态。出错优先于加载中：
 * “安全信用读取失败”同时含有“读取”，必须显示为出错并保留重试按钮。
 */
export const stateKindForTitle = (title: string): StateKind =>
  ERROR_TITLE.test(title)
    ? "error"
    : LOADING_TITLE.test(title)
      ? "loading"
      : "empty";
