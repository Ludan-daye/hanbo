import { View } from "@tarojs/components";
import { useEffect, useRef, useState } from "react";
import type {
  AttendanceSafetyNotice,
  AttendanceSafetyReceipt,
} from "@construction/domain";
import { Button, Notice, Subtitle } from "./ui/index";
import {
  confirmAttendanceSafety,
  fetchAttendanceSafety,
} from "../services/attendance-safety";

export type PunchSafetyReceipt = AttendanceSafetyReceipt & {
  readonly context: string;
};
export const AttendanceSafetyCard = ({
  projectId,
  pointCode,
  context,
  revision,
  disabled,
  receipt,
  onConfirmed,
}: {
  readonly projectId: string;
  readonly pointCode: string;
  readonly context: string;
  readonly revision: number;
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
    let active: boolean = true;
    setNotice(null);
    setError(null);
    onConfirmed(null);
    void fetchAttendanceSafety(projectId, pointCode).then(
      (result) => {
        if (active) setNotice(result);
      },
      (cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "安全交底读取失败，请重试。",
          );
      },
    );
    return () => {
      active = false;
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
      setError(
        cause instanceof Error
          ? cause.message
          : "确认失败，请重新读取交底内容。",
      );
      onConfirmed(null);
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  };
  return (
    <View
      className={`punch-step ${receipt !== null ? "punch-step--done" : ""} ${disabled ? "punch-step--locked" : ""}`}
    >
      <View className="punch-step__number">{receipt !== null ? "✓" : "3"}</View>
      <View className="punch-step__body">
        <View className="punch-step__title">本次打卡安全交底</View>
        {notice === null && error === null && (
          <Subtitle>正在读取交底…</Subtitle>
        )}
        {notice !== null && (
          <>
            <Subtitle>{notice.baselineText}</Subtitle>
            {notice.briefings.map((briefing) => (
              <View key={briefing.id} className="punch-safety-content">
                <View>{briefing.title}</View>
                <Subtitle>{briefing.content}</Subtitle>
              </View>
            ))}
            <Button
              variant="outline"
              loading={loading}
              disabled={disabled || loading || receipt !== null}
              onClick={() => {
                void confirm();
              }}
            >
              {receipt !== null
                ? "已确认本次安全交底"
                : "已阅读并理解"}
            </Button>
            <Subtitle>
              {disabled
                ? "完成定位和现场照片后确认"
                : "每次刷脸前须确认交底。"}
            </Subtitle>
          </>
        )}
        {error !== null && (
          <>
            <Notice>{error}</Notice>
            <Button variant="outline" onClick={() => setReload(reload + 1)}>
              重新读取交底
            </Button>
          </>
        )}
      </View>
    </View>
  );
};
