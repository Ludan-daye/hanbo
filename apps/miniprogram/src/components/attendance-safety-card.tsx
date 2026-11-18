import { View } from "@tarojs/components";
import { useEffect, useRef, useState } from "react";
import type {
  AttendanceSafetyNotice,
  AttendanceSafetyReceipt,
} from "@construction/domain";
import { BottomBar, Button, Card, Notice, Say, SkeletonRows } from "./ui/index";
import {
  confirmAttendanceSafety,
  fetchAttendanceSafety,
} from "../services/attendance-safety";
import { formatChinaHm } from "../services/time";

import "./attendance-safety-card.scss";
import { errorMessage } from "../services/error-messages";

export type PunchSafetyReceipt = AttendanceSafetyReceipt & {
  readonly context: string;
};

/**
 * 打卡第 3 步：安全交底。
 * 进打卡页就挂载并读取交底，轮到这一步（active）才显示，所以打开时内容已经在了。
 * onConfirmed 的引用必须稳定：它一变，这里就会清空回执并重新读取。
 */
export const AttendanceSafetyCard = ({
  projectId,
  pointCode,
  context,
  revision,
  active,
  disabled,
  receipt,
  onConfirmed,
}: {
  readonly projectId: string;
  readonly pointCode: string;
  readonly context: string;
  readonly revision: number;
  /** 现在是不是轮到这一步。 */
  readonly active: boolean;
  readonly disabled: boolean;
  readonly receipt: PunchSafetyReceipt | null;
  readonly onConfirmed: (receipt: PunchSafetyReceipt | null) => void;
}): JSX.Element => {
  const [notice, setNotice] = useState<AttendanceSafetyNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [reload, setReload] = useState<number>(0);
  const generation = useRef<number>(0);
  useEffect(() => {
    generation.current += 1;
    setLoading(false);
    let alive: boolean = true;
    setNotice(null);
    setError(null);
    onConfirmed(null);
    void fetchAttendanceSafety(projectId, pointCode).then(
      (result) => {
        if (alive) setNotice(result);
      },
      (cause: unknown) => {
        if (alive) setError(errorMessage(cause, "安全交底读取失败，请重试。"));
      },
    );
    return () => {
      alive = false;
      generation.current += 1;
    };
  }, [projectId, pointCode, context, revision, reload, onConfirmed]);
  useEffect(() => {
    if (receipt === null) return;
    const timer = setTimeout(
      () => onConfirmed(null),
      Math.max(0, Date.parse(receipt.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [receipt, onConfirmed]);
  const confirm = async (): Promise<void> => {
    if (notice === null || disabled || loading) return;
    const currentGeneration: number = generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await confirmAttendanceSafety(projectId, {
        pointCode,
        baselineVersion: notice.baselineVersion,
        briefingIds: notice.briefings.map((row) => row.id),
      });
      if (currentGeneration === generation.current)
        onConfirmed({ ...result, context });
    } catch (cause: unknown) {
      if (currentGeneration !== generation.current) return;
      setError(errorMessage(cause, "确认失败，请重新读取交底内容。"));
      onConfirmed(null);
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  };
  return (
    <>
      <View className={active ? "m-step" : "safety-step--waiting"}>
        <Say title="读完今天的安全交底" />
        {notice === null && error === null ? (
          <SkeletonRows rows={3} gap />
        ) : null}
        {notice !== null ? (
          <Card gap>
            <View className="safety-step__text">{notice.baselineText}</View>
            {notice.briefings.map((briefing) => (
              <View key={briefing.id}>
                <View className="ui-divider" />
                <View className="safety-step__title">{briefing.title}</View>
                <View className="safety-step__text">{briefing.content}</View>
                <View className="ui-card__meta">
                  {formatChinaHm(briefing.publishedAt)} 发布
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        {error !== null ? (
          <>
            <Notice tone="error">{error}</Notice>
            <Button variant="outline" onClick={() => setReload(reload + 1)}>
              重新读取交底
            </Button>
          </>
        ) : null}
      </View>
      {/* 操作条固定在底部，不能放进带动画的容器里。 */}
      {active ? (
        <BottomBar
          primary={loading ? "确认中…" : "已阅读并理解"}
          busy={loading}
          disabled={disabled || notice === null || receipt !== null}
          onPrimary={() => {
            void confirm();
          }}
        />
      ) : null}
    </>
  );
};
