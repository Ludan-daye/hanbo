import { useEffect, useState } from "react";
import { Button, Field, ListItem, Section, StateView, Subtitle } from "../ui";
import { fetchProjectManagerCandidates } from "../../services/management";
import type { ProjectManagerCandidate } from "../../services/management.types";

type ProjectManagerPickerProps = {
  readonly companyId: string;
  readonly value: readonly ProjectManagerCandidate[];
  readonly onChange: (managers: readonly ProjectManagerCandidate[]) => void;
  readonly disabled: boolean;
};

export const ProjectManagerPicker = ({
  companyId,
  value,
  onChange,
  disabled,
}: ProjectManagerPickerProps): JSX.Element => {
  const [search, setSearch] = useState<string>("");
  const [candidates, setCandidates] = useState<
    readonly ProjectManagerCandidate[] | null
  >(null);
  const [revision, setRevision] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setCandidates(null);
    setError(null);
    const timer = setTimeout(() => {
      void fetchProjectManagerCandidates(companyId, search.trim())
        .then((items) => {
          if (!cancelled) setCandidates(items);
        })
        .catch((cause: unknown) => {
          if (!cancelled)
            setError(
              cause instanceof Error
                ? cause.message
                : "加载管理人员失败，请重试。",
            );
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyId, search, revision]);

  const select = (person: ProjectManagerCandidate): void => {
    if (
      disabled ||
      value.length >= 20 ||
      value.some((item) => item.profileId === person.profileId)
    )
      return;
    onChange([...value, person]);
  };

  const available = candidates?.filter(
    (person) =>
      !value.some((selected) => selected.profileId === person.profileId),
  );

  return (
    <Section
      title="项目管理员 *"
      sub="至少选择 1 人，可多选。负责项目人员、班组、考勤与报表。"
    >
      {value.map((person) => (
        <ListItem
          key={person.profileId}
          primary={person.name}
          secondary={`${person.phone} · ${person.isBound ? "已绑定微信" : "待绑定微信"}`}
          chip="✓ 已选择"
          onClick={() => {
            if (!disabled)
              onChange(
                value.filter((item) => item.profileId !== person.profileId),
              );
          }}
        />
      ))}
      {!expanded ? (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => setExpanded(true)}
        >
          {value.length === 0 ? "选择项目管理员" : "继续添加管理员"}
        </Button>
      ) : (
        <>
          <Field
            value={search}
            label={
              value.length > 0
                ? `已选 ${value.length} 人 · 点击已选人员可移除`
                : undefined
            }
            placeholder="搜索本公司管理人员姓名 / 手机号"
            maxLength={60}
            disabled={disabled}
            onInput={setSearch}
          />
          {error !== null ? (
            <StateView
              title="加载失败"
              sub={error}
              onRetry={() => setRevision(revision + 1)}
            />
          ) : null}
          {candidates === null && error === null ? (
            <Subtitle>加载管理人员中…</Subtitle>
          ) : null}
          {available?.map((person) => (
            <ListItem
              key={person.profileId}
              primary={person.name}
              secondary={`${person.phone} · ${person.isBound ? "已绑定微信" : "待绑定微信"}`}
              chip={value.length >= 20 ? "已达上限" : "选择"}
              onClick={() => select(person)}
            />
          ))}
          {candidates?.length === 0 ? (
            <Subtitle>
              {search.trim()
                ? "未找到匹配人员，请更换姓名或手机号。"
                : "暂无可选管理人员。请先完善本公司的管理人员档案；公司管理员也可作为项目负责人。"}
            </Subtitle>
          ) : null}
          {candidates?.length === 50 ? (
            <Subtitle>已显示前 50 人，请搜索姓名或手机号缩小范围。</Subtitle>
          ) : null}
          {value.length >= 20 ? (
            <Subtitle>已选满 20 人，可先移除已选人员再调整。</Subtitle>
          ) : null}
          <Button variant="outline" onClick={() => setExpanded(false)}>
            完成选择{value.length > 0 ? ` · ${value.length} 人` : ""}
          </Button>
        </>
      )}
      {value.some((person) => !person.isBound) ? (
        <Subtitle>
          待绑定人员创建后需领取项目邀请码，绑定微信后才能操作。
        </Subtitle>
      ) : null}
    </Section>
  );
};
