import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  PageHeader,
  Row,
  Screen,
  SearchField,
  Segmented,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { fetchCompanyParticipants } from "../../services/management";
import type { CompanyParticipant } from "../../services/management.types";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";
import { matchesPerson, personRow, type PeopleFilter } from "./person-row";

export default function CompanyPeople(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [search, setSearch] = useState<string>("");
  const companyId = useManagedCompanyId(state.me);
  const [filter, setFilter] = useState<PeopleFilter>("ALL");
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
          setError(errorMessage(e, "请稍后重试。"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);

  const visible = useMemo(
    () =>
      (items ?? []).filter((person) => matchesPerson(person, filter, search)),
    [items, filter, search],
  );

  if (companyId === null) {
    return (
      <Screen header={<PageHeader title="公司人员" />}>
        <StateView
          kind="empty"
          title="没有公司管理权限"
          sub="这个账号不是公司管理员。"
        />
      </Screen>
    );
  }

  return (
    <Screen header={<PageHeader title="公司人员" />}>
      <SearchField
        value={search}
        placeholder="搜索姓名、手机号、班组或工种"
        onInput={setSearch}
      />
      <Segmented<PeopleFilter>
        options={[
          {
            value: "ALL",
            label: items === null ? "全部" : `全部 ${items.length}`,
          },
          { value: "WORKER", label: "工人" },
          { value: "MANAGEMENT", label: "管理" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {error !== null ? (
        <StateView
          kind="error"
          title="人员没读到"
          sub={error}
          onRetry={refresh}
        />
      ) : items === null ? (
        <SkeletonRows rows={5} gap />
      ) : visible.length === 0 ? (
        items.length === 0 ? (
          <StateView
            kind="empty"
            title="公司里还没有人"
            sub="进入项目，在“项目人员”里添加成员。"
          />
        ) : (
          <StateView
            kind="empty"
            title="没有找到人"
            sub="换个关键词，或者换一个筛选。"
          />
        )
      ) : (
        <Sheet gap>
          {visible.map((person) => {
            const row = personRow(person);
            return (
              <Row
                key={person.memberId}
                title={row.title}
                avatar={row.avatar}
                sub={row.sub}
                status={row.status ?? undefined}
                value={row.status === null ? (row.tag ?? undefined) : undefined}
                mute
                chevron
                onClick={() => {
                  void Taro.navigateTo({
                    url: `/pages/person-form/index?projectId=${person.projectId}&memberId=${person.memberId}`,
                  });
                }}
              />
            );
          })}
        </Sheet>
      )}
    </Screen>
  );
}
