import { useEffect, useState } from "react";
import type { SafetyCreditPolicyView } from "@construction/domain";
import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
} from "../../components/ui/index";
import { WorkDate } from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  fetchSafetyPolicies,
  createSafetyPolicy,
} from "../../services/safety-credit";

export default function SafetyPolicy(): JSX.Element {
  useSessionGuard();
  const [policies, setPolicies] = useState<readonly SafetyCreditPolicyView[]>(
    [],
  );
  const [date, setDate] = useState<string>(
    new Date(Date.now() + 32 * 3600000).toISOString().slice(0, 10),
  );
  const [general, setGeneral] = useState<string>("5");
  const [serious, setSerious] = useState<string>("10");
  const [major, setMajor] = useState<string>("20");
  const [days, setDays] = useState<string>("10");
  const [points, setPoints] = useState<string>("5");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetchSafetyPolicies().then(
      (rows) => {
        if (active) setPolicies(rows);
      },
      (cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "规则读取失败");
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <Screen>
      <PageHeader title="全局安全信用规则" />
      {error && <Notice>{error}</Notice>}
      <Section title="新版本">
        <WorkDate value={date} onChange={setDate} />
        <Field
          label="一般违规扣分"
          type="number"
          value={general}
          onInput={setGeneral}
          placeholder="1—100"
        />
        <Field
          label="严重违规扣分"
          type="number"
          value={serious}
          onInput={setSerious}
          placeholder="1—100"
        />
        <Field
          label="重大违规扣分"
          type="number"
          value={major}
          onInput={setMajor}
          placeholder="1—100"
        />
        <Field
          label="恢复所需用工日"
          type="number"
          value={days}
          onInput={setDays}
          placeholder="1—365"
        />
        <Field
          label="恢复分值"
          type="number"
          value={points}
          onInput={setPoints}
          placeholder="1—100"
        />
        <Button
          loading={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            setError(null);
            void createSafetyPolicy({
              startsOn: date,
              generalPoints: Number(general),
              seriousPoints: Number(serious),
              majorPoints: Number(major),
              recoveryWorkdays: Number(days),
              recoveryPoints: Number(points),
            })
              .then(
                (row) => setPolicies([...policies, row]),
                (cause: unknown) =>
                  setError(
                    cause instanceof Error ? cause.message : "规则保存失败",
                  ),
              )
              .finally(() => setBusy(false));
          }}
        >
          发布规则
        </Button>
      </Section>
      <Section title="规则版本">
        {[...policies].reverse().map((row) => (
          <ListItem
            key={row.version}
            primary={`版本 ${row.version} · ${row.startsOn} 生效`}
            secondary={`扣分 ${row.generalPoints}/${row.seriousPoints}/${row.majorPoints} · ${row.recoveryWorkdays} 个用工日恢复 ${row.recoveryPoints} 分`}
          />
        ))}
      </Section>
    </Screen>
  );
}
