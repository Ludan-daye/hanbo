import { useEffect, useState } from "react";
import {
  BottomBar,
  Check,
  Notice,
  Row,
  SearchField,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
} from "../ui";
import { fetchProjectManagerCandidates } from "../../services/management";
import type { ProjectManagerCandidate } from "../../services/management.types";
import { errorMessage } from "../../services/error-messages";
import { MANAGER_LIMIT, managerSub } from "./summary";

export { managerSummary } from "./summary";

type ProjectManagerPickerProps = {
  readonly companyId: string;
  readonly value: readonly ProjectManagerCandidate[];
  readonly onChange: (managers: readonly ProjectManagerCandidate[]) => void;
  readonly disabled: boolean;
  /** 人选从进页面起就读着，轮到“选项目管理员”这一屏才显示。 */
  readonly active: boolean;
  /** 点了“选好了”。 */
  readonly onDone: () => void;
};

/**
 * 选项目管理员：单独的一屏。上面是已选的人，点一下取消；下面是还能选的人，点一下选上。
 * 表单里那一行用 managerSummary 显示选了谁。
 */
export const ProjectManagerPicker = ({
  companyId,
  value,
  onChange,
  disabled,
  active,
  onDone,
}: ProjectManagerPickerProps): JSX.Element | null => {
  const [search, setSearch] = useState<string>("");
  const [candidates, setCandidates] = useState<
    readonly ProjectManagerCandidate[] | null
  >(null);
  const [revision, setRevision] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

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
          if (!cancelled) setError(errorMessage(cause, "请稍后重试。"));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyId, search, revision]);

  if (!active) return null;

  const full = value.length >= MANAGER_LIMIT;
  const select = (person: ProjectManagerCandidate): void => {
    if (
      disabled ||
      full ||
      value.some((item) => item.profileId === person.profileId)
    )
      return;
    onChange([...value, person]);
  };
  const remove = (person: ProjectManagerCandidate): void => {
    if (!disabled)
      onChange(value.filter((item) => item.profileId !== person.profileId));
  };

  const available = candidates?.filter(
    (person) =>
      !value.some((selected) => selected.profileId === person.profileId),
  );

  return (
    <>
      <SearchField
        value={search}
        placeholder="搜索姓名或手机号"
        onInput={(text) => setSearch(text.slice(0, 60))}
      />
      {value.length > 0 ? (
        <>
          <SectionTitle>{`已选 ${value.length} 人`}</SectionTitle>
          <Sheet>
            {value.map((person) => (
              <Row
                key={person.profileId}
                title={person.name}
                sub={managerSub(person)}
                avatar={person.name.slice(0, 1)}
                onClick={() => remove(person)}
              >
                <Check checked />
              </Row>
            ))}
          </Sheet>
          {full ? (
            <Notice>{`最多选 ${MANAGER_LIMIT} 人，先取消一个再选别人。`}</Notice>
          ) : null}
        </>
      ) : null}
      <SectionTitle>可选的管理人员</SectionTitle>
      {error !== null ? (
        <StateView
          kind="error"
          title="人选没读到"
          sub={error}
          onRetry={() => setRevision(revision + 1)}
        />
      ) : candidates === null || available === undefined ? (
        <SkeletonRows rows={3} />
      ) : available.length === 0 ? (
        <Notice>
          {candidates.length > 0
            ? "搜到的人都已经选上了。"
            : search.trim()
              ? "没有找到这个人，换个姓名或手机号试试。"
              : "公司里还没有管理人员，请先添加人员档案。公司管理员可以兼任。"}
        </Notice>
      ) : (
        <Sheet>
          {available.map((person) => (
            <Row
              key={person.profileId}
              title={person.name}
              sub={managerSub(person)}
              avatar={person.name.slice(0, 1)}
              onClick={full ? undefined : () => select(person)}
            >
              <Check checked={false} />
            </Row>
          ))}
        </Sheet>
      )}
      {candidates?.length === 50 ? (
        <Notice>只显示前 50 人，人多时用搜索找。</Notice>
      ) : null}
      <BottomBar primary="选好了" onPrimary={onDone} />
    </>
  );
};
