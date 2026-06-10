import { Button } from "@tarojs/components";
import Taro from "@tarojs/taro";

export const CopyButton = ({ value, label = "复制" }: { readonly value: string; readonly label?: string }): JSX.Element => (
  <Button
    className="ui-btn ui-btn--outline"
    onClick={async () => {
      await Taro.setClipboardData({ data: value });
      await Taro.showToast({ icon: "success", title: "已复制" });
    }}
  >
    {label}
  </Button>
);
