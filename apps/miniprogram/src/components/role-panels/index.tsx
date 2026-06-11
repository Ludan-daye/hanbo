import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { Label, Tile, Title } from "../ui/index";
import type { PanelKey } from "../../routing/roleHome";

type Nav = { url: string };
type TileCfg = { title: string; sub: string; nav?: Nav };

const TILES: Record<PanelKey, { title: string; tiles: ReadonlyArray<TileCfg> }> = {
  companyAdmin: {
    title: "公司管理员",
    tiles: [
      { title: "公司与项目", sub: "管理公司下的项目", nav: { url: "/pages/company-projects/index" } },
      { title: "人员", sub: "公司人员总览", nav: { url: "/pages/company-people/index" } }
    ]
  },
  none: { title: "已绑定", tiles: [] },
  projectAdmin: {
    title: "项目管理员",
    tiles: [
      { title: "项目参与者", sub: "查看工人 / 管理员", nav: { url: "/pages/participants/index" } },
      { title: "考勤报表", sub: "日 / 周 / 月", nav: { url: "/pages/reports/index" } },
      { title: "邀请", sub: "生成绑定邀请码", nav: { url: "/pages/invitation/index" } }
    ]
  },
  systemAdmin: { title: "系统管理员", tiles: [{ title: "系统配置", sub: "公司 / 角色 / 全局设置" }] },
  teamLeader: {
    title: "班组长",
    tiles: [
      { title: "补卡审批", sub: "审批本班组补卡", nav: { url: "/pages/team-makeups/index" } },
      { title: "团队考勤", sub: "查看班组出勤", nav: { url: "/pages/team-attendance/index" } }
    ]
  },
  worker: {
    title: "工人",
    tiles: [
      { title: "打卡", sub: "四点考勤 · 拍照 + 定位" },
      { title: "我的记录", sub: "查看出勤明细", nav: { url: "/pages/my-records/index" } },
      { title: "补卡", sub: "我的申请 · 提交补卡", nav: { url: "/pages/my-makeups/index" } }
    ]
  },
};

export const RolePanel = ({ panel }: { panel: PanelKey }): JSX.Element => {
  const cfg = TILES[panel];
  return (
    <View>
      <Label>当前身份</Label>
      <Title>{cfg.title}</Title>
      {panel === "none" ? (
        <Tile title="尚未分配角色" sub="你已绑定账号，但还没有被授予项目角色。请联系管理员分配后再使用。" />
      ) : (
        cfg.tiles.map((t) => (
          <Tile
            key={t.title}
            title={t.title}
            sub={t.sub}
            stub={t.nav === undefined}
            onClick={t.nav !== undefined ? () => { void Taro.navigateTo({ url: t.nav!.url }); } : undefined}
          />
        ))
      )}
    </View>
  );
};
