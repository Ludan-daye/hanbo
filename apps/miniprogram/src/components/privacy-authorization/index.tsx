import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import "./index.scss";

type PrivacyResolver = (
  option: Taro.onNeedPrivacyAuthorization.ResolveOption,
) => void;

type PrivacyContextValue = {
  readonly requests: readonly PrivacyResolver[];
  readonly agree: () => void;
  readonly disagree: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export const PrivacyProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [requests, setRequests] = useState<readonly PrivacyResolver[]>([]);

  useEffect(() => {
    if (process.env.TARO_ENV !== "weapp") return;
    Taro.onNeedPrivacyAuthorization((resolve: PrivacyResolver): void => {
      setRequests((current) => [...current, resolve]);
    });
  }, []);

  const agree = (): void => {
    requests.forEach((resolve) =>
      resolve({ event: "agree", buttonId: "attendance-privacy-agree" }),
    );
    setRequests([]);
  };
  const disagree = (): void => {
    requests.forEach((resolve) => resolve({ event: "disagree" }));
    setRequests([]);
  };

  return (
    <PrivacyContext.Provider value={{ requests, agree, disagree }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const PrivacyAuthorization = (): JSX.Element | null => {
  const context = useContext(PrivacyContext);
  const [active, setActive] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  Taro.useDidShow(() => setActive(true));
  Taro.useDidHide(() => setActive(false));
  useEffect(() => setError(null), [context?.requests]);
  if (context === null)
    throw new Error("PrivacyAuthorization requires PrivacyProvider.");

  const openContract = (): void => {
    setError(null);
    Taro.openPrivacyContract({
      fail: (reason): void => {
        setError(`无法打开隐私保护指引，请核对小程序后台配置后重试。${reason.errMsg}`);
      },
    });
  };

  if (!active || context.requests.length === 0) return null;

  return (
    <View className="privacy-authorization">
      <View className="privacy-authorization__dialog">
        <View className="privacy-authorization__title">请确认隐私授权</View>
        <View className="privacy-authorization__body">
          头像和昵称用于账号展示，位置信息用于核对项目考勤范围，照片用于本人及现场考勤记录，摄像头录像用于腾讯云活体检测和本人比对。
          请先阅读用户隐私保护指引，再选择是否同意授权。
        </View>
        <Text className="privacy-authorization__link" onClick={openContract}>
          查看用户隐私保护指引
        </Text>
        {error ? <View className="privacy-authorization__error">{error}</View> : null}
        <View className="privacy-authorization__actions">
          <Button className="privacy-authorization__decline" onClick={context.disagree}>
            暂不同意
          </Button>
          <Button
            id="attendance-privacy-agree"
            className="privacy-authorization__agree"
            openType="agreePrivacyAuthorization"
            onAgreePrivacyAuthorization={context.agree}
          >
            同意并继续
          </Button>
        </View>
      </View>
    </View>
  );
};
