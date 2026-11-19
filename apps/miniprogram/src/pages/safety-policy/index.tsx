import { Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyCreditPolicyView } from "@construction/domain";

import { WorkDate, workDateLabel } from "../../components/team-work-fields";
import {
  BottomBar,
  FormRow,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  SkeletonSign,
  StateView,
} from "../../components/ui/index";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  createSafetyPolicy,
  fetchSafetyPolicies,
} from "../../services/safety-credit";
import { chinaToday } from "../../services/time";

import "./index.scss";

/** “2026年11月20日”。 */
const dayText = (value: string): string => {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? `${year}年${month}月${day}日` : value;
};
const ruleText = (row: SafetyCreditPolicyView): string =>
  `扣 ${row.generalPoints} / ${row.seriousPoints} / ${row.majorPoints} 分，${row.recoveryWorkdays} 个用工日无违规恢复 ${row.recoveryPoints} 分`;

/** 一行数字：左边名称，右边直接输入，后面带单位。放在 Sheet 里。 */
const NumberRow = ({
  label,
  unit,
  value,
  placeholder,
  disabled,
  onInput,
}: {
  readonly label: string;
  readonly unit: string;
  readonly value: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly onInput: (value: string) => void;
}): JSX.Element => (
  <FormRow label={label}>
    <Input
      className="ui-form-row__input safety-policy__number num"
      type="number"
      value={value}
      placeholder={placeholder}
      placeholderClass="ui-form-row__placeholder"
      maxlength={3}
      disabled={disabled}
      onInput={(event) => onInput(event.detail.value)}
    />
    <Text className="safety-policy__unit">{unit}</Text>
  </FormRow>
);

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
  // 读取状态：读到之前不知道有没有规则，先放骨架；没读到给重试。
  const [loaded, setLoaded] = useState<boolean>(false);
  const [revision, setRevision] = useState<number>(0);
  useEffect(() => {
    let active = true;
    setError(null);
    void fetchSafetyPolicies().then(
      (rows) => {
        if (!active) return;
        setPolicies(rows);
        setLoaded(true);
      },
      (cause: unknown) => {
        if (active) setError(errorMessage(cause, "规则读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);
  const publish = async (): Promise<void> => {
    if (busy) return;
    // 规则是全平台的，发出去就按它扣分：发布前再问一次。
    const answer = await Taro.showModal({
      title: "发布新规则",
      content: `${workDateLabel(date)}起，一般扣 ${general} 分，严重扣 ${serious} 分，重大扣 ${major} 分；连续 ${days} 个用工日无违规恢复 ${points} 分。`,
      confirmText: "发布",
      confirmColor: "#000000",
    });
    if (!answer.confirm) return;
    setBusy(true);
    setError(null);
    await createSafetyPolicy({
      startsOn: date,
      generalPoints: Number(general),
      seriousPoints: Number(serious),
      majorPoints: Number(major),
      recoveryWorkdays: Number(days),
      recoveryPoints: Number(points),
    })
      .then(
        (row) => {
          setPolicies((current) => [...current, row]);
          void Taro.showToast({ title: "已发布", icon: "success" });
        },
        (cause: unknown) => setError(errorMessage(cause, "规则保存失败")),
      )
      .finally(() => setBusy(false));
  };

  const header = <PageHeader title="信用规则" />;
  if (!loaded)
    return (
      <Screen header={header}>
        {error ? (
          <StateView
            kind="error"
            title="规则没读到"
            sub={error}
            onRetry={() => setRevision((value) => value + 1)}
          />
        ) : (
          <View aria-label="正在读取信用规则">
            <SkeletonSign />
            <SkeletonRows rows={4} gap />
          </View>
        )}
      </Screen>
    );

  const today = chinaToday();
  const current = policies.filter((row) => row.startsOn <= today).at(-1);
  return (
    <Screen header={header}>
      {current ? (
        <SignLine
          title={`扣分 ${current.generalPoints} / ${current.seriousPoints} / ${current.majorPoints}`}
          sub={`一般、严重、重大。连续 ${current.recoveryWorkdays} 个用工日无违规恢复 ${current.recoveryPoints} 分`}
        />
      ) : (
        <SignLine
          title="还没有生效的规则"
          sub="发布后从生效日期起按新规则扣分"
        />
      )}

      <SectionTitle>新版本</SectionTitle>
      <Sheet>
        <View className="safety-policy__pick">
          <WorkDate label="生效日期" value={date} onChange={setDate} />
        </View>
        <NumberRow
          label="一般违规扣"
          unit="分"
          value={general}
          placeholder="1-100"
          disabled={busy}
          onInput={setGeneral}
        />
        <NumberRow
          label="严重违规扣"
          unit="分"
          value={serious}
          placeholder="1-100"
          disabled={busy}
          onInput={setSerious}
        />
        <NumberRow
          label="重大违规扣"
          unit="分"
          value={major}
          placeholder="1-100"
          disabled={busy}
          onInput={setMajor}
        />
        <NumberRow
          label="无违规多少个用工日"
          unit="天"
          value={days}
          placeholder="1-365"
          disabled={busy}
          onInput={setDays}
        />
        <NumberRow
          label="恢复"
          unit="分"
          value={points}
          placeholder="1-100"
          disabled={busy}
          onInput={setPoints}
        />
      </Sheet>
      <Notice>新规则从生效日期起算，旧版本留档。</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {policies.length > 0 ? (
        <>
          <SectionTitle>规则记录</SectionTitle>
          <Sheet>
            {[...policies].reverse().map((row) => (
              <Row
                key={row.version}
                title={`${dayText(row.startsOn)} 起`}
                sub={ruleText(row)}
                value={`版本 ${row.version}`}
                mute
              />
            ))}
          </Sheet>
        </>
      ) : null}
      <BottomBar
        primary={busy ? "发布中…" : "发布新规则"}
        busy={busy}
        onPrimary={() => {
          void publish();
        }}
      />
    </Screen>
  );
}
