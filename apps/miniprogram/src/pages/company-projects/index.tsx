import { View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { resolveCompanyAdminCompanyId } from "../../routing/companyAdmin";
import { fetchCompanyProjects } from "../../services/management";
import type { CompanyProject } from "../../services/management.types";
import { useSession } from "../../store/session";

const STATUS_LABEL: Record<CompanyProject["status"], string> = {
  ACTIVE: "进行中",
  COMPLETED: "已完工",
  PREPARING: "筹备中",
  SUSPENDED: "已暂停"
};

export default function CompanyProjects(): JSX.Element {
  const { state } = useSession();
  const companyId = resolveCompanyAdminCompanyId(state.me);
  const [items, setItems] = useState<ReadonlyArray<CompanyProject> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchCompanyProjects(companyId);
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (companyId === null) {
    return (
      <Screen>
        <PageHeader title="公司与项目" />
        <StateView title="无公司" sub="当前账号没有公司管理员身份。" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="公司与项目" />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && items.length === 0 ? <StateView title="尚无项目" /> : null}
      <View>
        {(items ?? []).map((p) => (
          <ListItem
            key={p.id}
            primary={p.name}
            secondary={`${p.address} · 起 ${p.plannedStartDate}${p.plannedEndDate ? ` · 止 ${p.plannedEndDate}` : ""} · 半径 ${p.geofenceRadiusM}m`}
            chip={STATUS_LABEL[p.status]}
          />
        ))}
      </View>
    </Screen>
  );
}
