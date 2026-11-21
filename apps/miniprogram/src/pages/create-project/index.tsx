import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  BottomBar,
  Button,
  Chips,
  FormInput,
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
import { dateLabel } from "../../components/member-role-editor/person-text";
import { ProjectGeofence } from "../../components/project-geofence";
import {
  ProjectManagerPicker,
  managerSummary,
} from "../../components/project-manager-picker";
import {
  validateProjectLocation,
  type ProjectLocation,
} from "../../services/project-location";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import {
  createCompanyProject,
  fetchCompanyDefaults,
} from "../../services/management";
import type {
  CompanyAttendanceDefaults,
  ProjectManagerCandidate,
  ProjectStatus,
} from "../../services/management.types";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

import { createProjectDefaultsText } from "../company-settings/settings-view";
import "./index.scss";

const STATUS_OPTIONS: ReadonlyArray<{ label: string; value: ProjectStatus }> = [
  { label: "筹备中", value: "PREPARING" },
  { label: "进行中", value: "ACTIVE" },
];

export default function CreateProject(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const [name, setName] = useState("");
  const [location, setLocation] = useState<ProjectLocation | null>(null);
  const [status, setStatus] = useState<ProjectStatus>("PREPARING");
  const [startsOn, setStartsOn] = useState<string>(chinaToday());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<readonly ProjectManagerCandidate[]>(
    [],
  );
  // 还不在本公司任何项目里的新管理员：姓名＋手机号，建好项目后用邀请码绑定（Q4）。
  const [newManagers, setNewManagers] = useState<
    readonly { readonly name: string; readonly phone: string }[]
  >([]);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const addNewManager = (): void => {
    const name = draftName.trim();
    const phone = draftPhone.trim();
    if (name.length === 0 || !/^1\d{10}$/.test(phone)) {
      setDraftError("请填写姓名和 11 位手机号。");
      return;
    }
    if (
      newManagers.some((row) => row.phone === phone) ||
      managers.some((row) => row.phone === phone)
    ) {
      setDraftError("这个手机号已经在管理员里了。");
      return;
    }
    setNewManagers([...newManagers, { name, phone }]);
    setDraftName("");
    setDraftPhone("");
    setDraftError(null);
  };
  // 套用公司默认的打卡安排和工时规则（Q6），默认打开；读不到公司默认也能建，只是不写摘要。
  const [applyDefaults, setApplyDefaults] = useState<boolean>(true);
  const [defaults, setDefaults] = useState<CompanyAttendanceDefaults | null>(null);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    void fetchCompanyDefaults(companyId).then(
      (value) => {
        if (!cancelled) setDefaults(value);
      },
      (cause: unknown) => {
        if (!cancelled) setDefaultsError(errorMessage(cause, "公司默认没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId]);
  // 同一个页面里的两屏：表单，和选项目管理员。
  const [view, setView] = useState<"form" | "managers">("form");

  if (companyId === null) {
    return (
      <Screen header={<PageHeader title="新建项目" />}>
        <StateView
          kind="empty"
          title="没有公司管理权限"
          sub="这个账号不是公司管理员，不能新建项目。"
        />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (managers.length + newManagers.length === 0) {
      setError("请至少选择或录入一名项目管理员。");
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || location === null) {
      setError("请填写项目名称，并在地图上选择工地位置。");
      return;
    }
    try {
      validateProjectLocation(location);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "工地位置无效，请重新选择。"));
      return;
    }
    if (endsOn !== null && endsOn < startsOn) {
      setError("计划完工不能早于计划开工。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCompanyProject(companyId, {
        managerProfileIds: managers.map((person) => person.profileId),
        ...(newManagers.length > 0 ? { newManagers } : {}),
        applyCompanyDefaults: applyDefaults,
        name: trimmedName,
        ...location,
        address: location.address.trim(),
        status,
        plannedStartDate: startsOn,
        plannedEndDate: endsOn,
      });
      await Taro.showToast({ icon: "success", title: "已创建" });
      // 有还没绑定微信的管理员：建好就去邀请绑定。
      const invite =
        newManagers.length > 0 || managers.some((person) => !person.isBound)
          ? (
              await Taro.showModal({
                title: "去邀请绑定",
                content: "有管理员还没绑定微信，绑定后才能管理这个项目。现在去生成邀请码吗？",
                confirmText: "去邀请",
                cancelText: "以后再说",
              })
            ).confirm
          : false;
      await Taro.redirectTo({
        url: invite
          ? `/pages/invitation/index?projectId=${encodeURIComponent(created.id)}&target=MANAGER`
          : `/pages/company-projects/index?companyId=${companyId}`,
      });
    } catch (e) {
      setError(errorMessage(e, "项目没建成，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  };

  // 四样齐了按钮才亮：名称、管理员、工地位置、地址。
  const missing = [
    name.trim().length === 0 ? "项目名称" : null,
    managers.length + newManagers.length === 0 ? "项目管理员" : null,
    location === null
      ? "工地位置"
      : location.address.trim().length === 0
        ? "详细地址"
        : null,
  ].filter((item): item is string => item !== null);
  const picking = view === "managers";

  return (
    <Screen
      header={
        <PageHeader
          title={picking ? "项目管理员" : "新建项目"}
          onBack={picking ? () => setView("form") : undefined}
        />
      }
    >
      <ProjectManagerPicker
        companyId={companyId}
        value={managers}
        onChange={setManagers}
        disabled={busy}
        active={picking}
        onDone={() => setView("form")}
      />
      {picking ? null : (
        <>
          <Sheet gap>
            <FormInput
              label="项目名称"
              required
              value={name}
              placeholder="例如：滨江花园二期"
              disabled={busy}
              onInput={setName}
            />
            <FormRow
              label="项目管理员"
              required
              placeholder="请选择"
              chevron
              onClick={busy ? undefined : () => setView("managers")}
            >
              {managers.length + newManagers.length > 0 ? (
                <View className="create-project__value">
                  {/* 下面录入的新管理员也算，录了就不再写“请选择”。 */}
                  {managerSummary([...managers, ...newManagers])}
                </View>
              ) : undefined}
            </FormRow>
          </Sheet>
          <SectionTitle>录入新管理员</SectionTitle>
          {newManagers.length > 0 ? (
            <Sheet gap>
              {newManagers.map((row) => (
                <Row
                  key={row.phone}
                  title={row.name}
                  sub={row.phone}
                  value="移除"
                  onClick={
                    busy
                      ? undefined
                      : () =>
                          setNewManagers(
                            newManagers.filter((item) => item.phone !== row.phone),
                          )
                  }
                />
              ))}
            </Sheet>
          ) : null}
          {newManagers.length < 3 ? (
            <>
              <Sheet gap>
                <FormInput
                  label="姓名"
                  value={draftName}
                  placeholder="还不在本公司项目里的人"
                  disabled={busy}
                  onInput={setDraftName}
                />
                <FormInput
                  label="手机号"
                  value={draftPhone}
                  placeholder="绑定时核对用"
                  disabled={busy}
                  onInput={setDraftPhone}
                />
              </Sheet>
              {draftError !== null ? <Notice tone="error">{draftError}</Notice> : null}
              <Button variant="outline" disabled={busy} onClick={addNewManager}>
                加为管理员
              </Button>
            </>
          ) : null}
          {newManagers.length > 0 || managers.some((person) => !person.isBound) ? (
            <Notice>
              选的人里有还没绑定微信的，建好项目后用邀请码让他绑定。
            </Notice>
          ) : null}
          <Sheet gap>
            <FormSwitch
              label="套用公司默认"
              sub="打卡安排和工时规则"
              checked={applyDefaults}
              disabled={busy}
              onChange={setApplyDefaults}
            />
          </Sheet>
          <Notice>
            {applyDefaults
              ? defaultsError ?? createProjectDefaultsText(defaults)
              : "不套用：项目先用平台默认（每日两次），项目管理员再去“打卡安排”“工时规则”里改。"}
          </Notice>
          <SectionTitle>工地位置和考勤范围</SectionTitle>
          <ProjectGeofence
            value={location}
            onChange={setLocation}
            disabled={busy}
          />
          <Sheet gap>
            {location === null ? (
              <FormRow label="详细地址" required placeholder="先选工地位置" />
            ) : (
              <FormInput
                label="详细地址"
                required
                value={location.address}
                placeholder="可以补充门牌、入口"
                disabled={busy}
                onInput={(address) => setLocation({ ...location, address })}
              />
            )}
            <FormRow label="状态">
              <Chips
                onSheet
                options={STATUS_OPTIONS}
                selected={[status]}
                onToggle={(value) => setStatus(value)}
              />
            </FormRow>
            <View className="create-project__pick">
              <Picker
                mode="date"
                value={startsOn}
                disabled={busy}
                onChange={(e) =>
                  setStartsOn(String((e.detail as { value: string }).value))
                }
              >
                <FormRow label="计划开工" value={dateLabel(startsOn)} chevron />
              </Picker>
            </View>
            <View className="create-project__pick">
              <Picker
                mode="date"
                value={endsOn ?? startsOn}
                disabled={busy}
                onChange={(e) =>
                  setEndsOn(String((e.detail as { value: string }).value))
                }
              >
                <FormRow
                  label="计划完工"
                  value={endsOn === null ? undefined : dateLabel(endsOn)}
                  placeholder="可以以后再填"
                  chevron
                />
              </Picker>
            </View>
          </Sheet>
          {endsOn !== null ? (
            <Button
              variant="text"
              onClick={() => {
                setEndsOn(null);
              }}
            >
              先不填计划完工
            </Button>
          ) : null}
          {error !== null ? (
            <Notice tone="error">{error}</Notice>
          ) : missing.length > 0 ? (
            <Notice>{`还差${missing.join("、")}，填齐了才能创建。`}</Notice>
          ) : null}
          <BottomBar
            primary={busy ? "创建中…" : "创建项目"}
            busy={busy}
            disabled={missing.length > 0}
            onPrimary={() => {
              void submit();
            }}
          />
        </>
      )}
    </Screen>
  );
}
