import { useDidShow } from "@tarojs/taro";
import { useCallback, useState } from "react";

export const usePageRefresh = (): {
  readonly revision: number;
  readonly refresh: () => void;
} => {
  const [revision, setRevision] = useState<number>(0);
  const refresh = useCallback((): void => {
    setRevision((value) => value + 1);
  }, []);
  useDidShow(refresh);
  return { revision, refresh };
};
