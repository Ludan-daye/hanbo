import { Picker } from "@tarojs/components";
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
  const [evidence, setEvidence] = useState<readonly UploadResult[]>([]);
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
          setError(cause instanceof Error ? cause.message : "安全信用读取失败");
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
      setError(cause instanceof Error ? cause.message : "操作失败");
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
      {error && <Notice>{error}</Notice>}
      <Button variant="outline" onClick={() => setCreating(!creating)}>
        {creating ? "收起登记" : "登记违规"}
      </Button>
      {creating && (
        <Section title="违规登记">
          <Picker
            mode="selector"
            range={board?.workers.map((row) => row.name) ?? []}
            onChange={(event) =>
              setMemberId(
                board?.workers[Number(event.detail.value)]?.memberId ?? "",
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
                const uploaded = await Promise.all(
                  photos.tempFilePaths.map(uploadImage),
                );
                setEvidence([...evidence, ...uploaded]);
              });
            }}
          >
            添加凭证照片 · {evidence.length}/5
          </Button>
          {evidence.map((photo, index) => (
            <ListItem
              key={photo.objectKey}
              primary={`照片 ${index + 1}`}
              chip="移除"
              onClick={() =>
                setEvidence(
                  evidence.filter((row) => row.objectKey !== photo.objectKey),
                )
              }
            />
          ))}
          <Button
            loading={busy}
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
              });
            }}
          >
            提交审核
          </Button>
        </Section>
      )}
      {board === null ? (
        <StateView title="读取中" />
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
