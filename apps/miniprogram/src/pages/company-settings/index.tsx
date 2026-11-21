import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { ScheduledAttendancePoint, WorktimeRule } from "@construction/domain";

import { WorkTime } from "../../components/team-work-fields";
import {
  BottomBar,
  Button,
  FormInput,
  FormRow,
  FormSwitch,
  Links,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
  Weekdays,
} from "../../components/ui/index";
import { useLeaveGuard } from "../../hooks/use-leave-guard";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchCompanyDefaults,
  fetchCompanyProfile,
  saveCompanyDefaults,
  updateCompanyProfile,
} from "../../services/management";
import type {
  CompanyAttendanceDefaults,
  CompanyAttendanceDefaultValues,
  CompanyProfile,
} from "../../services/management.types";
import { formatChinaDate } from "../../services/time";
import { useSession } from "../../store/session";
import { graceLabel, pointRule, POINT_KINDS } from "../schedules/plan-view";

import { defaultsProblem, defaultsSaveBody, withCheckpoint } from "./settings-view";
import "./index.scss";

type Tab = "DEFAULTS" | "PROFILE";
const KINDS = ["常规施工", "零星维修"] as const;

/**
 * 公司设置（2026-11-21 第四期）：
 * - 默认规则：一份打卡安排和工时规则，新建项目时套用一次（Q6）；改了不影响已建的项目。
 * - 公司资料：联系人、电话、地址可改，名称和信用代码只能由平台改（Q12）。
 */
export default function CompanySettings(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [tab, setTab] = useState<Tab>("DEFAULTS");
  const [defaults, setDefaults] = useState<CompanyAttendanceDefaults | null>(null);
  const [values, setValues] = useState<CompanyAttendanceDefaultValues | null>(null);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [contact, setContact] = useState({ address: "", contactName: "", contactPhone: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    setLoadError(null);
    void Promise.all([fetchCompanyDefaults(companyId), fetchCompanyProfile(companyId)]).then(
      ([nextDefaults, nextProfile]) => {
        if (cancelled) return;
        setDefaults(nextDefaults);
        setValues(nextDefaults.current ?? nextDefaults.fallback);
        setProfile(nextProfile);
        setContact({
          address: nextProfile.address ?? "",
          contactName: nextProfile.contactName ?? "",
          contactPhone: nextProfile.contactPhone ?? "",
        });
        setDirty(false);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "公司设置没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);
  useEffect(() => {
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  }, [editingCode]);
  useLeaveGuard(dirty || editingCode !== null ? "公司设置还没保存，离开后改动不保留。" : null);

  const header = (
    <PageHeader
      title={editingCode === null ? "公司设置" : "改一张卡"}
      onBack={editingCode === null ? undefined : () => setEditingCode(null)}
    />
  );
  if (companyId === null)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从公司工作台进入" />
      </Screen>
    );
  if (loadError !== null)
    return (
      <Screen header={header}>
        <StateView title="公司设置没读到" sub={loadError} onRetry={refresh} />
      </Screen>
    );
  if (defaults === null || values === null || profile === null)
    return (
      <Screen header={header}>
        <SkeletonRows rows={4} gap />
      </Screen>
    );

  const change = (next: Partial<CompanyAttendanceDefaultValues>): void => {
    setValues({ ...values, ...next });
    setDirty(true);
    setSaved(null);
    setError(null);
  };
  const worktime = (next: Partial<WorktimeRule>): void =>
    change({ worktime: { ...values.worktime, ...next } });
  const updatePoint = (code: string, next: Partial<ScheduledAttendancePoint>): void =>
    change({ points: values.points.map((row) => (row.code === code ? { ...row, ...next } : row)) });

  const saveDefaults = async (): Promise<void> => {
    if (busy) return;
    const problem = defaultsProblem(values);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await saveCompanyDefaults(companyId, defaultsSaveBody(values, defaults.latestVersion));
      setDefaults(next);
      setValues(next.current ?? next.fallback);
      setDirty(false);
      setSaved("已保存。以后新建的项目会套用这一份，已建的项目不变。");
    } catch (cause: unknown) {
      setError(errorMessage(cause, "没有保存成功，请重试"));
    } finally {
      setBusy(false);
    }
  };
  const saveProfile = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await updateCompanyProfile(companyId, {
        address: contact.address.trim() || null,
        contactName: contact.contactName.trim() || null,
        contactPhone: contact.contactPhone.trim() || null,
        expectedUpdatedAt: profile.updatedAt,
      });
      setProfile(next);
      setDirty(false);
      setSaved("公司资料已保存。");
    } catch (cause: unknown) {
      setError(errorMessage(cause, "没有保存成功，请重试"));
    } finally {
      setBusy(false);
    }
  };

  const editing = values.points.find((row) => row.code === editingCode) ?? null;
  if (editing !== null)
    return (
      <Screen header={header}>
        <Sheet gap>
          <FormInput
            label="名称"
            value={editing.label}
            placeholder="例如：上班"
            disabled={busy}
            onInput={(label) => updatePoint(editing.code, { label })}
          />
          <View className="company-settings__pick">
            <Picker
              mode="selector"
              range={POINT_KINDS.map((kind) => kind.label)}
              value={POINT_KINDS.findIndex((kind) => kind.value === editing.kind)}
              onChange={(event) => {
                const kind = POINT_KINDS[Number(event.detail.value)];
                if (kind) updatePoint(editing.code, { kind: kind.value });
              }}
            >
              <FormRow label="类型" value={POINT_KINDS.find((kind) => kind.value === editing.kind)?.label} chevron />
            </Picker>
          </View>
          <View className="company-settings__pick">
            <WorkTime label="打卡时间" value={editing.time} onChange={(time) => updatePoint(editing.code, { time })} />
          </View>
          <FormInput
            label={`${graceLabel(editing.kind)}（分钟）`}
            value={String(editing.graceMins)}
            type="number"
            disabled={busy}
            onInput={(value) => updatePoint(editing.code, { graceMins: value === "" ? 0 : Number(value) })}
          />
        </Sheet>
        <Notice>上班和下班要成对，中途签到不算工时。点“改好了”回到公司设置，再点“保存公司默认”才生效。</Notice>
        <BottomBar primary="改好了" onPrimary={() => setEditingCode(null)}>
          {values.points.length > 2 ? (
            <Button
              variant="danger"
              onClick={() => {
                change({ points: values.points.filter((row) => row.code !== editing.code) });
                setEditingCode(null);
              }}
            >
              删除这张卡
            </Button>
          ) : null}
        </BottomBar>
      </Screen>
    );

  return (
    <Screen header={header}>
      <Segmented<Tab>
        options={[
          { value: "DEFAULTS", label: "默认规则" },
          { value: "PROFILE", label: "公司资料" },
        ]}
        value={tab}
        onChange={(value) => {
          if (busy) return;
          setTab(value);
          setError(null);
          setSaved(null);
        }}
      />
      {tab === "DEFAULTS" ? (
        <>
          <SignLine
            title={defaults.current === null ? "还没有公司默认" : "新建项目时套用"}
            sub={
              defaults.current === null
                ? "没设默认时，新项目用平台的每日两次"
                : `${defaults.current.createdByName ?? "公司管理员"} ${formatChinaDate(defaults.current.createdAt)} 保存`
            }
            value={defaults.current === null ? undefined : `版本 ${defaults.current.version}`}
          />
          <Notice>只影响以后新建的项目，已经建好的项目不跟着改；项目建好后可以自己再改。</Notice>
          <SectionTitle
            action="添加"
            onAction={() => {
              const next = withCheckpoint(values.points, `POINT_${Date.now()}_${values.points.length}`);
              if (next === null) setError("最后两张卡挨得太近。先把时间调开，再添加。");
              else change({ points: next });
            }}
          >
            {`每天 ${values.points.length} 张卡`}
          </SectionTitle>
          <Sheet>
            {values.points.map((point) => (
              <Row
                key={point.code}
                title={point.label}
                titleNum={point.time}
                sub={pointRule(point)}
                chevron
                onClick={busy ? undefined : () => setEditingCode(point.code)}
              />
            ))}
          </Sheet>
          <Links>
            <Button variant="text" disabled={busy} onClick={() => change({ name: defaults.fallback.name, points: defaults.fallback.points })}>
              恢复平台默认（每日两次）
            </Button>
          </Links>
          <Sheet gap>
            <FormInput label="安排名称" value={values.name} placeholder="例如：每日两次" disabled={busy} onInput={(name) => change({ name })} />
            <View className="company-settings__days">
              <View className="company-settings__days-label">工作日</View>
              <Weekdays
                selected={values.workdays}
                disabled={busy}
                onToggle={(day) =>
                  change({
                    workdays: values.workdays.includes(day)
                      ? values.workdays.filter((value) => value !== day)
                      : [...values.workdays, day].sort(),
                  })
                }
              />
            </View>
          </Sheet>
          <SectionTitle>工时规则</SectionTitle>
          <Sheet gap>
            <View className="company-settings__pick">
              <Picker
                mode="selector"
                range={[...KINDS]}
                value={values.worktime.projectKind === "REGULAR" ? 0 : 1}
                disabled={busy}
                onChange={(event) => worktime({ projectKind: Number(event.detail.value) === 0 ? "REGULAR" : "REPAIR" })}
              >
                <FormRow label="项目类型" value={KINDS[values.worktime.projectKind === "REGULAR" ? 0 : 1]} chevron />
              </Picker>
            </View>
            <FormSwitch
              label="区分加班"
              checked={values.worktime.overtimeStart !== null}
              disabled={busy}
              onChange={(checked) => worktime({ overtimeStart: checked ? "18:00" : null })}
            />
            {values.worktime.overtimeStart !== null ? (
              <View className="company-settings__pick m-fade">
                <WorkTime label="加班从几点算" value={values.worktime.overtimeStart} onChange={(overtimeStart) => worktime({ overtimeStart })} />
              </View>
            ) : null}
            <FormSwitch
              label="扣除午休"
              checked={values.worktime.lunchStart !== null}
              disabled={busy}
              onChange={(checked) => worktime(checked ? { lunchStart: "12:00", lunchEnd: "13:00" } : { lunchStart: null, lunchEnd: null })}
            />
            {values.worktime.lunchStart !== null ? (
              <>
                <View className="company-settings__pick m-fade">
                  <WorkTime label="午休开始" value={values.worktime.lunchStart} onChange={(lunchStart) => worktime({ lunchStart })} />
                </View>
                <View className="company-settings__pick m-fade">
                  <WorkTime label="午休结束" value={values.worktime.lunchEnd ?? "13:00"} onChange={(lunchEnd) => worktime({ lunchEnd })} />
                </View>
              </>
            ) : null}
          </Sheet>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="success">{saved}</Notice> : null}
          <BottomBar primary={busy ? "保存中…" : "保存公司默认"} busy={busy} onPrimary={() => void saveDefaults()} />
        </>
      ) : (
        <>
          <Sheet gap>
            <FormRow label="公司名称" value={profile.name} />
            <FormRow label="信用代码" value={profile.creditCode ?? "未填写"} />
          </Sheet>
          <Notice>名称和信用代码要由平台管理员修改。</Notice>
          <Sheet gap>
            <FormInput
              label="联系人"
              value={contact.contactName}
              placeholder="可以不填"
              disabled={busy}
              onInput={(contactName) => {
                setContact({ ...contact, contactName });
                setDirty(true);
              }}
            />
            <FormInput
              label="联系电话"
              value={contact.contactPhone}
              placeholder="手机或座机"
              disabled={busy}
              onInput={(contactPhone) => {
                setContact({ ...contact, contactPhone });
                setDirty(true);
              }}
            />
            <FormInput
              label="地址"
              value={contact.address}
              placeholder="可以不填"
              disabled={busy}
              onInput={(address) => {
                setContact({ ...contact, address });
                setDirty(true);
              }}
            />
          </Sheet>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {saved ? <Notice tone="success">{saved}</Notice> : null}
          <BottomBar primary={busy ? "保存中…" : "保存资料"} busy={busy} onPrimary={() => void saveProfile()} />
        </>
      )}
    </Screen>
  );
}
