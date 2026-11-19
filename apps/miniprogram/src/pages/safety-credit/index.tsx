import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyCreditBoard, SafetySeverity } from "@construction/domain";
import {
  BottomBar,
  Card,
  CardMeta,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import {
  SafetyPolicySummary,
  SafetyViolationCard,
} from "../../components/safety-credit-cards";
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
import { creditHeadline, creditSub } from "./credit-view";
import { MAX_EVIDENCE, ViolationForm } from "./views/form";

import "./index.scss";

type Doing = "upload" | "submit";
export default function TeamSafetyCredit(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [board, setBoard] = useState<SafetyCreditBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doing, setDoing] = useState<Doing | null>(null);
  /** 同一个页面路径里的两个视图：列表和“登记违规”表单。 */
  const [view, setView] = useState<"list" | "form">("list");
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
  const busy: boolean = doing !== null;
  const pickableWorkers = (board?.workers ?? []).filter(
    (row) =>
      workerSearch.trim().length === 0 ||
      row.name.includes(workerSearch.trim()),
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
        if (active) setError(errorMessage(cause, "安全信用读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, revision]);
  // 换了视图就回到顶上：同一个页面里切换，滚动位置不会自己复位。
  useEffect(() => {
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  }, [view]);
  const perform = async (
    kind: Doing,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    setDoing(kind);
    setError(null);
    try {
      await action();
    } catch (cause: unknown) {
      if (isUserCancel(cause)) return;
      const message = errorMessage(cause, "操作失败");
      setError(message);
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setDoing(null);
    }
  };
  if (teamId === null)
    return (
      <Screen header={<PageHeader title="安全信用" />}>
        <StateView kind="empty" title="请先选择班组" />
      </Screen>
    );

  const complete: boolean =
    Boolean(memberId) &&
    Boolean(category.trim()) &&
    Boolean(description.trim()) &&
    evidence.length > 0;
  const addPhotos = (): Promise<void> =>
    perform("upload", async () => {
      const photos = await Taro.chooseImage({
        count: MAX_EVIDENCE - evidence.length,
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
  const submit = (): Promise<void> =>
    perform("submit", async () => {
      if (!complete) throw new Error("请选择人员并填写类别、说明和凭证照片");
      await recordSafetyViolation(teamId, {
        memberId,
        category,
        severity,
        occurredAt: new Date(`${date}T${time}:00+08:00`).toISOString(),
        description,
        evidence: evidence.map((row) => ({
          objectKey: row.objectKey,
          hash: row.hash,
        })),
      });
      setView("list");
      setCategory("");
      setDescription("");
      setEvidence([]);
      refresh();
      await Taro.showToast({ icon: "success", title: "已提交审核" });
    });

  if (view === "form" && board !== null)
    return (
      <Screen
        header={
          <PageHeader
            title="登记违规"
            onBack={() => {
              if (busy) return;
              setError(null);
              setView("list");
            }}
          />
        }
      >
        <ViolationForm
          search={board.workers.length > 10 ? workerSearch : null}
          people={pickableWorkers.map((row) => row.name)}
          personIndex={Math.max(
            0,
            pickableWorkers.findIndex((row) => row.memberId === memberId),
          )}
          personName={
            board.workers.find((row) => row.memberId === memberId)?.name ?? null
          }
          category={category}
          severity={severity}
          date={date}
          time={time}
          description={description}
          photos={evidence}
          error={error}
          busy={busy}
          uploading={doing === "upload"}
          submitting={doing === "submit"}
          complete={complete}
          onSearch={setWorkerSearch}
          onPerson={(index) =>
            setMemberId(pickableWorkers[index]?.memberId ?? "")
          }
          onCategory={setCategory}
          onSeverity={setSeverity}
          onDate={setDate}
          onTime={setTime}
          onDescription={setDescription}
          onAddPhoto={() => {
            void addPhotos();
          }}
          onRemovePhoto={(objectKey) =>
            setEvidence(evidence.filter((row) => row.objectKey !== objectKey))
          }
          onSubmit={() => {
            void submit();
          }}
        />
      </Screen>
    );

  const headline = board === null ? null : creditHeadline(board);
  return (
    <Screen header={<PageHeader title="安全信用" />}>
      {board === null || headline === null ? (
        error ? (
          <StateView
            kind="error"
            title="安全信用没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <>
            <View className="sk safety-credit__sk-sign" />
            <SkeletonRows rows={3} gap />
          </>
        )
      ) : (
        <>
          <SignLine title={headline.title} sub={headline.sub} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <SectionTitle>违规次数排行</SectionTitle>
          {board.workers.length === 0 ? (
            <Notice>本班还没有在场的工人。</Notice>
          ) : (
            <Sheet>
              {board.workers.map((row) => (
                <Row
                  key={row.memberId}
                  title={row.name}
                  avatar={row.name.slice(0, 1)}
                  sub={creditSub(row)}
                >
                  <View>
                    <Text className="num safety-credit__score">
                      {row.score}
                    </Text>
                    分
                  </View>
                </Row>
              ))}
            </Sheet>
          )}
          <SafetyPolicySummary policies={board.policies} />
          {board.violations.length > 0 ? (
            <SectionTitle>违规记录</SectionTitle>
          ) : null}
          {board.violations.map((row, index) => (
            <Card key={row.id} gap={index > 0}>
              <CardMeta>
                {board.workers.find(
                  (person) => person.workerId === row.workerId,
                )?.name ?? "历史人员"}
              </CardMeta>
              <SafetyViolationCard row={row} />
            </Card>
          ))}
        </>
      )}
      <BottomBar
        primary="登记违规"
        disabled={board === null}
        onPrimary={() => {
          setError(null);
          setView("form");
        }}
      />
    </Screen>
  );
}
