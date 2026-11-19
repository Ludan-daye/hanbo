import Taro from "@tarojs/taro";

import {
  Check,
  EntryGrid,
  Row,
  SectionTitle,
  Sheet,
  type StatusKind,
} from "../ui/index";
import { FEATURES, PANEL_LABELS, type Feature } from "../../routing/features";
import { roleHomePanel, type PanelKey } from "../../routing/roleHome";
import type { WorkRoleScope } from "../../services/management.types";

import {
  featureUrl,
  scopeKey,
  scopeLine,
  scopeParentName,
  scopeShortName,
} from "./scope";

// only 给出要哪几个入口（按页面地址，也按这个顺序排）；不给就是这一组的全部。
const pick = (
  panel: PanelKey,
  only: readonly string[] | undefined,
): readonly Feature[] =>
  only === undefined
    ? FEATURES[panel]
    : only.flatMap((url) => {
        const feature = FEATURES[panel].find((item) => item.url === url);
        return feature ? [feature] : [];
      });

const open = (
  feature: Feature,
  scope: WorkRoleScope | null | undefined,
): void => {
  void Taro.navigateTo({ url: featureUrl(feature.url, scope) });
};

/** 工作台里的入口：一行一个，带图标和一句说明。 */
export const RolePanel = ({
  panel,
  scope,
  only,
  gap,
  statuses,
}: {
  readonly panel: PanelKey;
  readonly scope?: WorkRoleScope | null;
  readonly only?: readonly string[];
  readonly gap?: boolean;
  /** 某个入口后面的状态，按页面地址给，例如补卡审批后面的“1 条”。 */
  readonly statuses?: Readonly<
    Record<string, { readonly kind?: StatusKind; readonly text: string }>
  >;
}): JSX.Element | null => {
  const features = pick(panel, only);
  if (features.length === 0) return null;
  return (
    <Sheet gap={gap}>
      {features.map((feature) => (
        <Row
          key={feature.url}
          icon={feature.icon}
          title={feature.title}
          sub={feature.sub}
          status={statuses?.[feature.url]}
          chevron
          onClick={() => open(feature, scope)}
        />
      ))}
    </Sheet>
  );
};

/** 首页上的入口宫格：最常用的几个，一行三个。 */
export const RoleGrid = ({
  panel,
  scope,
  only,
}: {
  readonly panel: PanelKey;
  readonly scope?: WorkRoleScope | null;
  readonly only?: readonly string[];
}): JSX.Element | null => {
  const features = pick(panel, only);
  if (features.length === 0) return null;
  return (
    <EntryGrid
      gap
      items={features.map((feature) => ({
        icon: feature.icon,
        label: feature.title,
        onClick: () => open(feature, scope),
      }))}
    />
  );
};

/**
 * 换一个范围：一行一个，当前的那个打勾。
 * showRole 为真时每行先写职级（工作台里一个人可能有几个职级），否则只写范围名。
 */
export const ScopeChooser = ({
  title,
  scopes,
  current,
  showRole,
  onChoose,
  onCancel,
}: {
  readonly title: string;
  readonly scopes: readonly WorkRoleScope[];
  readonly current: WorkRoleScope | null;
  readonly showRole?: boolean;
  readonly onChoose: (scope: WorkRoleScope) => void;
  readonly onCancel: () => void;
}): JSX.Element => (
  <>
    <SectionTitle action="取消" onAction={onCancel}>
      {title}
    </SectionTitle>
    <Sheet>
      {scopes.map((scope) => (
        <Row
          key={scopeKey(scope)}
          title={
            showRole
              ? PANEL_LABELS[roleHomePanel(scope.roleCode)]
              : scopeShortName(scope)
          }
          sub={showRole ? scopeLine(scope) : scopeParentName(scope)}
          onClick={() => onChoose(scope)}
        >
          <Check
            round
            checked={current !== null && scopeKey(scope) === scopeKey(current)}
          />
        </Row>
      ))}
    </Sheet>
  </>
);
