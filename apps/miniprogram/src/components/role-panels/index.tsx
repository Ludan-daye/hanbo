import { View } from "@tarojs/components";

import { Label, Tile, Title } from "../ui/index";
import type { PanelKey } from "../../routing/roleHome";

const TILES: Record<PanelKey, { title: string; tiles: ReadonlyArray<{ title: string; sub: string }> }> = {
  companyAdmin: { title: "公司管理员", tiles: [{ title: "公司与项目", sub: "管理公司下的项目" }, { title: "人员", sub: "公司人员总览" }] },
  none: { title: "已绑定", tiles: [] },
  projectAdmin: { title: "项目管理员", tiles: [{ title: "项目管理", sub: "班组 / 人员 / 排班" }, { title: "报表", sub: "日 / 周 / 月考勤" }, { title: "邀请", sub: "生成绑定邀请码" }] },
  systemAdmin: { title: "系统管理员", tiles: [{ title: "系统配置", sub: "公司 / 角色 / 全局设置" }] },
  teamLeader: { title: "班组长", tiles: [{ title: "补卡审批", sub: "审批本班组补卡" }, { title: "团队考勤", sub: "查看班组出勤" }] },
  worker: { title: "工人", tiles: [{ title: "打卡", sub: "四点考勤 · 拍照 + 定位" }, { title: "我的记录", sub: "查看出勤明细" }, { title: "补卡", sub: "提交补卡申请" }] }
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
        cfg.tiles.map((t) => <Tile key={t.title} title={t.title} sub={t.sub} stub />)
      )}
    </View>
  );
};
