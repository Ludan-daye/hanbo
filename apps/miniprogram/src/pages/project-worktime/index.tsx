import { Picker, View } from "@tarojs/components";
import { useEffect, useRef, useState } from "react";
import { defaultWorktimeRule, type WorktimeRule } from "@construction/domain";

import { WorkTime } from "../../components/team-work-fields";
import {
  BottomBar,
  FormRow,
  FormSwitch,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import { chinaToday } from "../../services/time";
import {
  fetchWorktimeConfiguration,
  saveWorktimeConfiguration,
  type WorktimeConfiguration,
} from "../../services/worktime";
import { useSession } from "../../store/session";

import "./index.scss";

const tomorrow = (): string =>
  new Date(Date.parse(`${chinaToday()}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
const KINDS = ["常规施工", "零星维修"] as const;
/** “11月19日”，不是今年的带上年份。 */
const dayText = (value: string): string => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${String(year) === chinaToday().slice(0, 4) ? "" : `${year}年`}${month}月${day}日`;
};
const ruleText = (rule: WorktimeRule): string =>
  `${rule.overtimeStart === null ? "不区分加班" : `加班 ${rule.overtimeStart} 起`}，${
    rule.lunchStart === null
      ? "不扣午休"
      : `午休 ${rule.lunchStart} 到 ${rule.lunchEnd ?? ""}`
  }`;

export default function ProjectWorktime(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [configuration, setConfiguration] =
    useState<WorktimeConfiguration | null>(null);
  const [rule, setRule] = useState<WorktimeRule>(defaultWorktimeRule);
  const [startsOn, setStartsOn] = useState<string>(tomorrow());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const operation = useRef<boolean>(false);
  useEffect(() => {
    if (!projectId) {
      setError("缺少项目，请从项目设置进入。");
      return;
    }
    let cancelled = false;
    setError(null);
    void fetchWorktimeConfiguration(projectId).then(
      (value) => {
        if (cancelled) return;
        setConfiguration(value);
        const latest = [...value.versions].sort(
          (a, b) => b.version - a.version,
        )[0];
        setRule(latest?.config ?? value.defaultConfig);
        setStartsOn(
          latest && latest.startsOn > tomorrow() ? latest.startsOn : tomorrow(),
        );
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, "规则读取失败"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);
  const update = (value: Partial<WorktimeRule>): void => {
    setRule((current) => ({ ...current, ...value }));
    setSaved(null);
  };
  const save = async (): Promise<void> => {
    if (!projectId || !configuration || operation.current) return;
    if (
      startsOn < tomorrow() ||
      (rule.lunchStart !== null &&
        (rule.lunchEnd === null || rule.lunchEnd <= rule.lunchStart))
    ) {
      setError("请检查生效日期及午休时间。");
      return;
    }
    operation.current = true;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      setConfiguration(
        await saveWorktimeConfiguration(projectId, {
          expectedVersion: configuration.latestVersion,
          startsOn,
          config: rule,
        }),
      );
      setSaved(startsOn);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "保存失败"));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const header = <PageHeader title="工时规则" />;
  if (!projectId)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="还没有选项目"
          sub="请从工作台或公司项目进来。"
        />
      </Screen>
    );
  if (configuration === null)
    return (
      <Screen header={header}>
        {error ? (
          <StateView
            kind="error"
            title="规则没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView title="正在读取工时规则" />
        )}
      </Screen>
    );

  const versions = [...configuration.versions].reverse();
  return (
    <Screen header={header}>
      <Sheet gap>
        <View className="project-worktime__pick">
          <Picker
            mode="selector"
            range={[...KINDS]}
            value={rule.projectKind === "REGULAR" ? 0 : 1}
            disabled={busy}
            onChange={(event) =>
              update({
                projectKind:
                  Number(event.detail.value) === 0 ? "REGULAR" : "REPAIR",
              })
            }
          >
            <FormRow
              label="项目类型"
              value={KINDS[rule.projectKind === "REGULAR" ? 0 : 1]}
              chevron
            />
          </Picker>
        </View>
        <FormRow label="计时单位" value="小时" />
        <FormSwitch
          label="区分加班"
          checked={rule.overtimeStart !== null}
          disabled={busy}
          onChange={(checked) =>
            update({ overtimeStart: checked ? "18:00" : null })
          }
        />
        {rule.overtimeStart !== null ? (
          <View className="project-worktime__pick m-fade">
            <WorkTime
              label="加班从几点算"
              value={rule.overtimeStart}
              onChange={(overtimeStart) => update({ overtimeStart })}
            />
          </View>
        ) : null}
        <FormSwitch
          label="扣除午休"
          checked={rule.lunchStart !== null}
          disabled={busy}
          onChange={(checked) =>
            update(
              checked
                ? { lunchStart: "12:00", lunchEnd: "13:00" }
                : { lunchStart: null, lunchEnd: null },
            )
          }
        />
        {rule.lunchStart !== null ? (
          <>
            <View className="project-worktime__pick m-fade">
              <WorkTime
                label="午休开始"
                value={rule.lunchStart}
                onChange={(lunchStart) => update({ lunchStart })}
              />
            </View>
            <View className="project-worktime__pick m-fade">
              <WorkTime
                label="午休结束"
                value={rule.lunchEnd ?? "13:00"}
                onChange={(lunchEnd) => update({ lunchEnd })}
              />
            </View>
          </>
        ) : null}
        <View className="project-worktime__pick">
          <Picker
            mode="date"
            start={tomorrow()}
            value={startsOn}
            disabled={busy}
            onChange={(event) => {
              setStartsOn(event.detail.value);
              setSaved(null);
            }}
          >
            <FormRow label="生效日期" value={dayText(startsOn)} chevron />
          </Picker>
        </View>
      </Sheet>
      <Notice>
        工时按有效的上下班记录算，缺卡的那天等核实。新规则最早明天生效，旧规则留档。
      </Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? (
        <Notice tone="success">已保存，{dayText(saved)}起生效</Notice>
      ) : null}

      <SectionTitle>规则记录</SectionTitle>
      {versions.length === 0 ? (
        <Notice>还没有保存过规则，以前的工时显示为未分类。</Notice>
      ) : (
        <Sheet>
          {versions.map((item) => (
            <Row
              key={item.version}
              title={`${dayText(item.startsOn)} 起`}
              sub={ruleText(item.config)}
              value={`版本 ${item.version}`}
              mute
            />
          ))}
        </Sheet>
      )}
      <BottomBar
        primary={busy ? "保存中…" : "保存规则"}
        busy={busy}
        onPrimary={() => {
          void save();
        }}
      />
    </Screen>
  );
}
