import {
  BottomBar,
  Button,
  FormInput,
  Notice,
  Row,
  Sheet,
  StateView,
  type StatusKind,
} from "../../../components/ui";
import type { CompanyProject } from "../../../services/management.types";
import type { Company } from "../../../services/workflows";

const companyStatus = (
  company: Company,
): { readonly kind: StatusKind; readonly text: string } =>
  company.status === "ACTIVE"
    ? { kind: "ok", text: "正常" }
    : { kind: "warn", text: "已暂停" };

/** “公司”标签：一行一家。暂停、恢复在点进去之后。 */
export const CompaniesTab = ({
  companies,
  projects,
  onOpen,
  onAdd,
}: {
  readonly companies: readonly Company[];
  readonly projects: readonly CompanyProject[];
  readonly onOpen: (companyId: string) => void;
  readonly onAdd: () => void;
}): JSX.Element => (
  <>
    {companies.length === 0 ? (
      <StateView
        kind="empty"
        title="还没有公司"
        sub="点下面的“新增公司”添加第一家。"
      />
    ) : (
      <>
        <Sheet gap>
          {companies.map((company) => (
            <Row
              key={company.id}
              title={company.name}
              sub={`${projects.filter((row) => row.companyId === company.id).length} 个项目`}
              status={companyStatus(company)}
              chevron
              onClick={() => onOpen(company.id)}
            />
          ))}
        </Sheet>
        <Notice>{`共 ${companies.length} 家公司，${projects.length} 个项目。`}</Notice>
      </>
    )}
    <BottomBar primary="新增公司" onPrimary={onAdd} />
  </>
);

/** 点开一家公司：看它的项目，暂停或恢复。 */
export const CompanyView = ({
  company,
  projectCount,
  busy,
  problem,
  onProjects,
  onToggle,
}: {
  readonly company: Company;
  readonly projectCount: number;
  readonly busy: boolean;
  /** 暂停、恢复没成功的原因。 */
  readonly problem: string | null;
  readonly onProjects: () => void;
  readonly onToggle: () => void;
}): JSX.Element => {
  const active = company.status === "ACTIVE";
  return (
    <>
      <Sheet gap>
        <Row title="状态" status={companyStatus(company)} />
        <Row
          title="公司项目"
          value={`${projectCount} 个`}
          mute
          chevron
          onClick={onProjects}
        />
      </Sheet>
      <Notice>
        {active
          ? "暂停后，这家公司的管理员暂时不能管理公司和项目。"
          : "这家公司已经暂停，恢复后公司管理员照常使用。"}
      </Notice>
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
      <Button
        variant={active ? "danger" : "outline"}
        wide
        loading={busy}
        onClick={onToggle}
      >
        {busy ? "保存中…" : active ? "暂停公司" : "恢复公司"}
      </Button>
    </>
  );
};

/** 新增公司：只填一个名称。 */
export const NewCompanyView = ({
  name,
  busy,
  problem,
  onName,
  onCreate,
}: {
  readonly name: string;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onName: (name: string) => void;
  readonly onCreate: () => void;
}): JSX.Element => (
  <>
    <Sheet gap>
      <FormInput
        label="公司名称"
        required
        value={name}
        placeholder="填完整的公司名称"
        disabled={busy}
        onInput={onName}
      />
    </Sheet>
    {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    <BottomBar
      primary={busy ? "创建中…" : "创建公司"}
      busy={busy}
      disabled={!name.trim()}
      onPrimary={onCreate}
    />
  </>
);
