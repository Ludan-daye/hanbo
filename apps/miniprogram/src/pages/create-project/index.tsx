import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  BottomBar,
  Button,
  Chips,
  FormInput,
  FormRow,
  Notice,
  PageHeader,
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
import { createCompanyProject } from "../../services/management";
import type {
  ProjectManagerCandidate,
  ProjectStatus,
} from "../../services/management.types";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

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
    if (managers.length === 0) {
      setError("请至少选择一名项目管理员。");
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
      await createCompanyProject(companyId, {
        managerProfileIds: managers.map((person) => person.profileId),
        name: trimmedName,
        ...location,
        address: location.address.trim(),
        status,
        plannedStartDate: startsOn,
        plannedEndDate: endsOn,
      });
      await Taro.showToast({ icon: "success", title: "已创建" });
      await Taro.redirectTo({
        url: `/pages/company-projects/index?companyId=${companyId}`,
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
    managers.length === 0 ? "项目管理员" : null,
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
              {managers.length > 0 ? (
                <View className="create-project__value">
                  {managerSummary(managers)}
                </View>
              ) : undefined}
            </FormRow>
          </Sheet>
          {managers.some((person) => !person.isBound) ? (
            <Notice>
              选的人里有还没绑定微信的，建好项目后用邀请码让他绑定。
            </Notice>
          ) : null}
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
