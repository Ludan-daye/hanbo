import Taro from "@tarojs/taro";
import { View } from "@tarojs/components";
import { useEffect, useMemo, useState } from "react";
import { displayProjectRole } from "../../routing/features";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Field,
  Subtitle,
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { fetchCompanyParticipants } from "../../services/management";
import type {
  CompanyParticipant,
  ParticipantType,
} from "../../services/management.types";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";

type Filter = "ALL" | ParticipantType;
const FILTER_OPTIONS = [
  { label: "全部", value: "ALL" as const },
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const },
];

export default function CompanyPeople(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [search, setSearch] = useState<string>("");
  const companyId = useManagedCompanyId(state.me);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<ReadonlyArray<CompanyParticipant> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId === null) {
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const rows = await fetchCompanyParticipants(companyId);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);

  const visible = useMemo(() => {
    if (items === null) {
      return [];
    }
    return items.filter(
      (p) =>
        (filter === "ALL" || p.participantType === filter) &&
        `${p.displayName ?? ""} ${p.phone} ${p.teamName ?? ""} ${displayProjectRole(p.projectRoleLabel)}`.includes(
          search.trim(),
        ),
    );
  }, [items, filter, search]);

  if (companyId === null) {
    return (
      <Screen>
        <PageHeader title="公司人员" />
        <StateView title="无公司" sub="当前账号没有公司管理员身份。" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="公司人员" />
      <Field
        value={search}
        placeholder="搜索姓名、手机号、班组或工种"
        onInput={setSearch}
      />
      <Segmented
        options={FILTER_OPTIONS}
        value={filter}
        onChange={(v) => {
          setFilter(v);
        }}
      />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? (
        <StateView title="加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {items !== null && visible.length === 0 ? (
        <StateView title="尚无人员" />
      ) : null}
      {items !== null ? <Subtitle>共 {visible.length} 名成员 · 点击查看或编辑资料</Subtitle> : null}
      <View>
        {visible.map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? `成员 · ${p.phone.slice(-4)}`}
            secondary={`${displayProjectRole(p.projectRoleLabel)} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.projectName}
            onClick={() => { void Taro.navigateTo({ url: `/pages/person-form/index?projectId=${p.projectId}&memberId=${p.memberId}` }); }}
          />
        ))}
      </View>
    </Screen>
  );
}
