import { useSession } from "../../store/session";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { Picker, Switch, View } from "@tarojs/components";
import { useEffect, useRef, useState } from "react";
import { defaultWorktimeRule, type WorktimeRule } from "@construction/domain";
import { Button, ListItem, Notice, PageHeader, Screen, Section, StateView } from "../../components/ui/index";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { chinaToday } from "../../services/time";
import { fetchWorktimeConfiguration, saveWorktimeConfiguration, type WorktimeConfiguration } from "../../services/worktime";

const tomorrow = (): string => new Date(Date.parse(`${chinaToday()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
export default function ProjectWorktime(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [configuration, setConfiguration] = useState<WorktimeConfiguration | null>(null);
  const [rule, setRule] = useState<WorktimeRule>(defaultWorktimeRule);
  const [startsOn, setStartsOn] = useState<string>(tomorrow());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const operation = useRef<boolean>(false);
  useEffect(() => {
    if (!projectId) { setError("缺少项目，请从项目设置进入。"); return; }
    let cancelled = false;
    setError(null);
    void fetchWorktimeConfiguration(projectId).then((value) => {
      if (cancelled) return;
      setConfiguration(value);
      const latest = [...value.versions].sort((a, b) => b.version - a.version)[0];
      setRule(latest?.config ?? value.defaultConfig);
      setStartsOn(latest && latest.startsOn > tomorrow() ? latest.startsOn : tomorrow());
    }, (cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "规则读取失败"); });
    return () => { cancelled = true; };
  }, [projectId, revision]);
  const update = (value: Partial<WorktimeRule>): void => { setRule((current) => ({ ...current, ...value })); setSaved(null); };
  const save = async (): Promise<void> => {
    if (!projectId || !configuration || operation.current) return;
    if (startsOn < tomorrow() || (rule.lunchStart !== null && (rule.lunchEnd === null || rule.lunchEnd <= rule.lunchStart))) {
      setError("请检查生效日期及午休时间。"); return;
    }
    operation.current = true; setBusy(true); setError(null); setSaved(null);
    try {
      setConfiguration(await saveWorktimeConfiguration(projectId, { expectedVersion: configuration.latestVersion, startsOn, config: rule }));
      setSaved(`${startsOn} 生效`);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { operation.current = false; setBusy(false); }
  };
  return <Screen>
    <PageHeader title="工时规则" />
    {error && <Notice>{error}</Notice>}
    {saved && <Notice>{saved}</Notice>}
    {configuration === null ? <StateView title={error ? "读取失败" : "加载中"} onRetry={error ? refresh : undefined} /> : <>
      <Section title="计时设置">
        <Picker mode="selector" range={["常规施工", "零星维修"]} value={rule.projectKind === "REGULAR" ? 0 : 1} onChange={(event) => update({ projectKind: Number(event.detail.value) === 0 ? "REGULAR" : "REPAIR" })}>
          <ListItem primary="项目类型" chip={rule.projectKind === "REGULAR" ? "常规施工" : "零星维修"} />
        </Picker>
        <ListItem primary="计时单位" chip="小时" />
        <View className="ui-listitem"><View>加班时段</View><Switch checked={rule.overtimeStart !== null} onChange={(event) => update({ overtimeStart: event.detail.value ? "18:00" : null })} /></View>
        {rule.overtimeStart !== null && <Picker mode="time" value={rule.overtimeStart} onChange={(event) => update({ overtimeStart: event.detail.value })}><ListItem primary="加班开始" chip={rule.overtimeStart} /></Picker>}
        <View className="ui-listitem"><View>扣除午休</View><Switch checked={rule.lunchStart !== null} onChange={(event) => update(event.detail.value ? { lunchStart: "12:00", lunchEnd: "13:00" } : { lunchStart: null, lunchEnd: null })} /></View>
        {rule.lunchStart !== null && <>
          <Picker mode="time" value={rule.lunchStart} onChange={(event) => update({ lunchStart: event.detail.value })}><ListItem primary="午休开始" chip={rule.lunchStart} /></Picker>
          <Picker mode="time" value={rule.lunchEnd ?? "13:00"} onChange={(event) => update({ lunchEnd: event.detail.value })}><ListItem primary="午休结束" chip={rule.lunchEnd ?? "13:00"} /></Picker>
        </>}
        <Picker mode="date" start={tomorrow()} value={startsOn} onChange={(event) => { setStartsOn(event.detail.value); setSaved(null); }}><ListItem primary="生效日期" chip={startsOn} /></Picker>
      </Section>
      <Notice>按有效上下班记录计时，缺卡待核实。历史规则保留。</Notice>
      <Button disabled={busy} onClick={() => { void save(); }}>{busy ? "保存中" : "保存规则"}</Button>
      <Section title="规则记录">{configuration.versions.length === 0 ? <View>尚未配置，历史工时显示为未分类。</View> : [...configuration.versions].reverse().map((item) => <ListItem key={item.version} primary={`${item.startsOn} 生效`} chip={`版本 ${item.version}`} secondary={`加班 ${item.config.overtimeStart ?? "未设置"} · 午休 ${item.config.lunchStart === null ? "不扣除" : `${item.config.lunchStart}–${item.config.lunchEnd}`}`} />)}</Section>
    </>}
  </Screen>;
}
