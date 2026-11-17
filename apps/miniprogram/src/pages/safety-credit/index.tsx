import { Image, Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyCreditBoard, SafetySeverity } from "@construction/domain";
import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
} from "../../components/ui/index";
import {
  SafetyPolicySummary,
  SafetyViolationCard,
} from "../../components/safety-credit-cards";
import {
  WorkDate,
  WorkNotes,
  WorkTime,
} from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import {
  fetchTeamSafetyCredit,
  recordSafetyViolation,
} from "../../services/safety-credit";
import { uploadImage, type UploadResult } from "../../services/uploads";
import { chinaToday } from "../../services/time";
import { errorMessage, isUserCancel } from "../../services/error-messages";

import "./index.scss";

export default function TeamSafetyCredit(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [board, setBoard] = useState<SafetyCreditBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [memberId, setMemberId] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState<SafetySeverity>("GENERAL");
  const [date, setDate] = useState<string>(chinaToday());
  const [time, setTime] = useState<string>(
    new Date(Date.now() + 8 * 3600000).toISOString().slice(11, 16),
  );
  const [description, setDescription] = useState<string>("");
  const [evidence, setEvidence] = useState<
    readonly (UploadResult & { readonly preview: string })[]
  >([]);
  const [workerSearch, setWorkerSearch] = useState<string>("");
  const pickableWorkers = (board?.workers ?? []).filter(
    (row) =>
      workerSearch.trim().length === 0 || row.name.includes(workerSearch.trim()),
  );
  useEffect(() => {
    if (teamId === null) return;
    let active = true;
    setError(null);
    void fetchTeamSafetyCredit(teamId).then(
      (value) => {
        if (active) setBoard(value);
      },
      (cause: unknown) => {
        if (active)
          setError(errorMessage(cause, "安全信用读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, revision]);
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause: unknown) {
      if (isUserCancel(cause)) return;
      const message = errorMessage(cause, "操作失败");
      setError(message);
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setBusy(false);
    }
  };
  if (teamId === null)
    return (
      <Screen>
        <PageHeader title="安全信用" />
        <StateView title="请先选择班组" />
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="安全信用" />
      {error && board !== null && <Notice tone="error">{error}</Notice>}
      <Button
        variant="outline"
        disabled={board === null}
        onClick={() => setCreating(!creating)}
      >
        {creating ? "收起登记" : "登记违规"}
      </Button>
      {creating && board !== null && (
        <Section title="违规登记">
          {board.workers.length > 10 && (
            <Field
              value={workerSearch}
              placeholder="搜索姓名后再选择"
              onInput={setWorkerSearch}
            />
          )}
          <Picker
            mode="selector"
            range={pickableWorkers.map((row) => row.name)}
            value={Math.max(
              0,
              pickableWorkers.findIndex((row) => row.memberId === memberId),
            )}
            onChange={(event) =>
              setMemberId(
                pickableWorkers[Number(event.detail.value)]?.memberId ?? "",
              )
            }
          >
            <ListItem
              primary="人员"
              chip={
                board?.workers.find((row) => row.memberId === memberId)?.name ??
                "选择人员"
              }
            />
          </Picker>
          <Field
            label="违规类别"
            value={category}
            onInput={setCategory}
            placeholder="未佩戴安全帽"
            maxLength={40}
          />
          <Segmented
            options={[
              { label: "一般", value: "GENERAL" },
              { label: "严重", value: "SERIOUS" },
              { label: "重大", value: "MAJOR" },
            ]}
            value={severity}
            onChange={(value: SafetySeverity) => setSeverity(value)}
          />
          <WorkDate value={date} onChange={setDate} />
          <WorkTime label="发生时间" value={time} onChange={setTime} />
          <WorkNotes
            label="情况说明"
            value={description}
            onChange={setDescription}
          />
          <Button
            variant="outline"
            disabled={evidence.length >= 5}
            loading={busy}
            onClick={() => {
              void perform(async () => {
                const photos = await Taro.chooseImage({
                  count: 5 - evidence.length,
                  sourceType: ["camera", "album"],
                  sizeType: ["compressed"],
                });
                const results = await Promise.allSettled(
                  photos.tempFilePaths.map(async (path) => ({
                    ...(await uploadImage(path)),
                    preview: path,
                  })),
                );
                const uploaded = results.flatMap((result) =>
                  result.status === "fulfilled" ? [result.value] : [],
                );
                const failed = results.find(
                  (result): result is PromiseRejectedResult =>
                    result.status === "rejected",
                );
                setEvidence((current) => [...current, ...uploaded]);
                if (failed !== undefined)
                  throw new Error(
                    `${results.length - uploaded.length} 张照片上传失败：${errorMessage(failed.reason, "请重试")}`,
                  );
              });
            }}
          >
            添加凭证照片 · {evidence.length}/5
          </Button>
          {evidence.length > 0 && (
            <View className="safety-evidence">
              {evidence.map((photo, index) => (
                <View key={photo.objectKey} className="safety-evidence__item">
                  <Image
                    className="safety-evidence__image"
                    src={photo.preview}
                    mode="aspectFill"
                    onClick={() => {
                      void Taro.previewImage({
                        current: photo.preview,
                        urls: evidence.map((row) => row.preview),
                      });
                    }}
                  />
                  <Button
                    variant="text"
                    disabled={busy}
                    onClick={() =>
                      setEvidence(
                        evidence.filter(
                          (row) => row.objectKey !== photo.objectKey,
                        ),
                      )
                    }
                  >
                    移除第 {index + 1} 张
                  </Button>
                </View>
              ))}
            </View>
          )}
          <Button
            loading={busy}
            disabled={
              busy ||
              !memberId ||
              !category.trim() ||
              !description.trim() ||
              evidence.length === 0
            }
            onClick={() => {
              void perform(async () => {
                if (
                  !memberId ||
                  !category.trim() ||
                  !description.trim() ||
                  evidence.length === 0
                )
                  throw new Error("请选择人员并填写类别、说明和凭证照片");
                await recordSafetyViolation(teamId, {
                  memberId,
                  category,
                  severity,
                  occurredAt: new Date(
                    `${date}T${time}:00+08:00`,
                  ).toISOString(),
                  description,
                  evidence: evidence.map((row) => ({
                    objectKey: row.objectKey,
                    hash: row.hash,
                  })),
                });
                setCreating(false);
                setCategory("");
                setDescription("");
                setEvidence([]);
                refresh();
                await Taro.showToast({ icon: "success", title: "已提交审核" });
              });
            }}
          >
            提交审核
          </Button>
        </Section>
      )}
      {board === null ? (
        error ? (
          <StateView title="安全信用读取失败" sub={error} onRetry={refresh} />
        ) : (
          <StateView title="正在读取安全信用…" />
        )
      ) : (
        <>
          <SafetyPolicySummary policies={board.policies} />
          <Section title="违规次数排行">
            {board.workers.length === 0 ? (
              <StateView title="暂无班组工人" />
            ) : (
              board.workers.map((row) => (
                <ListItem
                  key={row.memberId}
                  primary={`${row.rank}. ${row.name}`}
                  secondary={`累计 ${row.confirmedViolationCount} 次 · 恢复 ${row.recoveryPoints} 分`}
                  chip={`${row.score} 分`}
                />
              ))
            )}
          </Section>
          {board.violations.map((row) => (
            <Section
              key={row.id}
              title={
                board.workers.find((person) => person.workerId === row.workerId)
                  ?.name ?? "历史人员"
              }
            >
              <SafetyViolationCard row={row} />
            </Section>
          ))}
        </>
      )}
    </Screen>
  );
}
