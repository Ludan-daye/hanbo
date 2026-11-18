"""班组长：首页、工作台、工作安排、班组安全、安全信用、日报、打卡安排、补卡审批、班组考勤。"""
from lib import *  # noqa: F401,F403

WORK = [("task", "工作安排"), ("shield", "班组安全"), ("doc", "班组日报"), ("clock", "打卡安排"), ("check", "补卡审批"), ("chart", "班组考勤")]

home = phone(
    "首页", "home 班组长", "主角是橙色标牌：几个人到了、谁没到。等你处理的事排成一列，自己的卡也在里面。",
    nav("钢筋一班", back=False, switch=True),
    '<div class="sign"><div class="top2"><span>11月18日 周三</span><span>共 5 人</span></div>'
    '<div class="hl"><span class="num">4</span><b>人到岗</b></div>'
    '<div class="exc"><span>未到</span><b>李卫东</b><i>查看</i></div></div>',
    h("等你处理"),
    sheet(row("我的上班卡", num("08:00") + " 前", chev=True, haz=True), row("补卡申请 1 条", "张建国", chev=True, haz=True, mute=True)),
    grid(WORK, gap=True),
    tab("manager", "首页"),
)

workspace = phone(
    "工作台", "workspace", "工作台只放管理的事，每个入口带一句说明。兼任多个职级的人在顶上切换。自己的考勤和补卡归到“我的”。",
    nav("工作台", back=False),
    sheet(row("班组长", b3("切换"), sub="滨江花园一期，钢筋一班"), first=True),
    h("班组"),
    sheet(
        row("工作安排", sub="安排工人，邀请临时工", chev=True, icon="task"),
        row("班组安全", sub="安全交底和隐患整改", chev=True, icon="shield"),
        row("班组日报", sub="自动汇总出勤和工作", chev=True, icon="doc"),
        row("打卡安排", sub="设置本班组的打卡要求", chev=True, icon="clock"),
        row("补卡审批", st("warn", "1 条"), sub="处理本班组的补卡申请", chev=True, icon="check"),
        row("班组考勤", sub="日报、周报和月报", chev=True, icon="chart"),
    ),
    tab("manager", "工作台"),
)

me = phone(
    "我的（班组长）", "profile 班组长", "班组长自己也要打卡。自己的项目、任务、考勤和补卡都在这里，和工人看到的是同一套。",
    nav("我的", back=False),
    '<div class="badge"><div class="bband"><i></i></div><div class="bbody"><div class="idrow"><span class="photo">王</span>'
    "<div><b>王师傅</b><small>班组长，钢筋一班</small><small>138****0003，微信已关联</small></div></div></div></div>",
    sheet(row("我的项目", chev=True), row("我的任务", chev=True), row("我的考勤", chev=True), row("补卡申请", chev=True), gap=True),
    sheet(row("本人资料", chev=True), row("人脸底照", st("ok", "已通过"), chev=True), gap=True),
    links(b3("权限与范围"), b3("退出登录", red=True)),
    tab("manager", "我的"),
)

# ---------- 工作安排 ----------
work_list = phone(
    "工作安排", "team-work", "顶上一句话说今天排了多少。主角是底部的“新建安排”，套用历史是旁边的黑框。",
    nav("工作安排"),
    dsw("11月18日 周三"),
    cs("今天 2 项安排", "已安排 4 人，1 项待完成"),
    sheet(
        row("3 号楼照明维修", st("warn", "待完成"), sub="08:00 到 17:30，3 人", chev=True),
        row("地下室材料清点", st("ok", "已完成"), sub="13:00 到 15:00，1 人", chev=True),
        gap=True,
    ),
    cta("新建安排", b2("套用历史")),
)

work_new = phone(
    "新建安排", "team-work 新建", "必填的只有工作内容和人。时间默认取今天的排班，工种和备注不填也能发。",
    nav("新建安排"),
    sheet(
        f("工作内容", "3 号楼照明维修", req=True),
        f("安排人员", "张建国、赵大勇 等 3 人", chev=True, req=True),
        f("时间", "今天 08:00 到 17:30", chev=True),
        f("工种", ph="选填", chev=True),
        f("备注", ph="选填", chev=True),
        first=True,
    ),
    sheet(row("发布后邀请临时工", sw(False)), gap=True),
    nt("最长 24 小时，夜班结束时间选次日。"),
    cta("发布安排"),
)

work_pick = phone(
    "选择人员", "team-work 选人", "搜索、按工种筛、勾选。底部按钮一直显示已经选了几个人。",
    nav("选择人员"),
    search("搜索姓名、工种或手机尾号"),
    chips(["全部工种", "钢筋工", "普工"], "全部工种", pad=True),
    h("钢筋一班，在场 5 人", "全选"),
    sheet(
        row("张建国", ck(True), sub="钢筋工 138****0001", avatar="张"),
        row("赵大勇", ck(True), sub="钢筋工 137****0012", avatar="赵"),
        row("刘海", ck(True), sub="普工 136****0031", avatar="刘"),
        row("陈国强", ck(False), sub="钢筋工 135****0044", avatar="陈"),
        row("李卫东", ck(False), sub="普工 139****0006", avatar="李"),
    ),
    cta("确定，已选 3 人"),
)

work_detail = phone(
    "安排详情", "team-work 详情", "原来一张卡片里塞了八块，现在分开：人在中间，加人和邀请是两行入口，完成是黑按钮。",
    nav("3 号楼照明维修"),
    cs("待完成", "今天 08:00 到 17:30，约 9.5 小时"),
    h("人员 3 人"),
    sheet(
        row("张建国", st("ok", "08:05 开工"), sub="钢筋工", avatar="张"),
        row("赵大勇", b3("撤下"), sub="还没开工", avatar="赵"),
        row("周强", b3("确认退场"), sub="临时工，420 分钟", avatar="周"),
    ),
    sheet(row("添加本班人员", chev=True, icon="plus"), row("邀请临时工", "1 个邀请码有效", chev=True, icon="key", mute=True), gap=True),
    cta("确认已完成", b3("取消任务", red=True), b2("修改")),
    time="15:20",
)

work_invite = phone(
    "邀请临时工", "team-work 邀请", "填姓名手机号，生成六位码。码只显示这一次，所以放得很大，旁边就是复制。",
    nav("邀请临时工"),
    sheet(f("真实姓名", "周强", req=True), f("手机号", "13800005678", req=True), first=True),
    card(
        '<div class="me2">邀请码已生成，只给周强本人用</div>' + code("482913")
        + '<div class="me2">有效到 11-19 08:00。离开这一页就不再显示完整的码。</div>'
        + '<div class="act">' + '<div class="go">复制邀请码</div>' + "</div>",
        gap=True,
    ),
    h("发出过的邀请"),
    sheet(
        row("周强", b3("作废", red=True), sub="138****5678，有效到 11-19 08:00"),
        row("孙立", st("ok", "已加入"), sub="139****2211"),
    ),
)

# ---------- 班组安全 ----------
safety = phone(
    "班组安全：交底", "team-safety", "今天的交底在最上面，谁还没确认单独一行。往日的交底只能看，不能补发。",
    nav("班组安全"),
    seg(["安全交底", "待整改 1", "按日记录"], "安全交底"),
    dsw("11月18日 周三"),
    card(
        '<div class="tt">今日高处作业注意事项</div><div class="me2">07:20 发布，已确认 4 人</div>'
        "<div style='margin-top:6px'>3 号楼临边防护今天整改，6 层以上作业必须系安全带。</div>",
        gap=True,
    ),
    sheet(row("还没确认", "李卫东", haz=True), gap=True),
    sheet(row("安全信用", "本班平均 " + num("96") + " 分", chev=True, icon="star"), gap=True),
    cta("发布安全交底"),
)

safety_new = phone(
    "发布交底", "team-safety 发布", "发出去就不能改，所以按钮上方先说清发给谁、哪一天。可以一键套用前一天的。",
    nav("发布交底"),
    cs("发给钢筋一班", "11月18日。发布后不能修改，要补充只能另发一条"),
    sheet(
        f("标题", "今日高处作业注意事项", req=True),
        area("内容", "3 号楼临边防护今天整改，6 层以上作业必须系安全带。", req=True),
        gap=True,
    ),
    b3("套用前一天的交底", center=True),
    cta("发布给本班工人"),
)

safety_issue = phone(
    "班组安全：待整改", "team-safety 待整改", "没整改的隐患不分日期都在这里，左边带警戒条。整改完登记结果才会消失。",
    nav("班组安全"),
    seg(["安全交底", "待整改 1", "按日记录"], "待整改 1"),
    sheet(
        row("3 号楼 6 层临边防护缺失", st("bad", "严重"), sub="11月17日，班组现场", haz=True),
        area("整改措施和核查结果", ph="写清怎么整改的、谁核查的"),
        gap=True,
    ),
    go("确认整改并关闭"),
    b3("记录一条新隐患", center=True),
)

credit = phone(
    "安全信用", "safety-credit", "谁的分低一眼看到。登记违规是黑按钮，登记后要项目管理员确认才扣分。",
    nav("安全信用"),
    cs("本班平均 96 分", "1 条违规等项目管理员审核"),
    sheet(
        row("张建国", num("85") + " 分", sub="累计 2 次", avatar="张"),
        row("李卫东", num("95") + " 分", sub="累计 1 次", avatar="李"),
        row("赵大勇", num("100") + " 分", sub="没有违规", avatar="赵"),
        gap=True,
    ),
    h("违规记录"),
    card('<div class="tt">未佩戴安全帽' + st("warn", "待审核") + "</div>" + '<div class="me2">张建国，严重，11-18 09:20，拟扣 10 分</div>'),
    cta("登记违规"),
)

credit_new = phone(
    "登记违规", "safety-credit 登记", "凭证照片至少一张，直接显示缩略图，传错了能看出来。",
    nav("登记违规"),
    sheet(
        f("人员", "张建国", chev=True, req=True),
        f("违规类别", "未佩戴安全帽", req=True),
        f("严重程度", right=chips(["一般", "严重", "重大"], "严重")),
        f("发生时间", "11月18日 " + num("09:20"), chev=True),
        area("情况说明", "进入 3 号楼作业区时未佩戴安全帽，经提醒后佩戴。", req=True),
        first=True,
    ),
    h("凭证照片 2 / 5"),
    pics(pic("照片 1", small=True), pic("照片 2", small=True), addpic()),
    cta("提交审核"),
)

# ---------- 日报、排班 ----------
log = phone(
    "班组日报", "team-log", "系统自己汇总。顶上是结论，下面是分项，有异常的人排在前面。看过没问题就保存。",
    nav("班组日报"),
    dsw("11月18日 周三"),
    cs("4 人出勤，记工 31.5 小时", "缺卡 1 人次，任务完成 1 / 2"),
    nums([("28.0", "", "正常工时"), ("3.5", "", "加班工时"), ("0.0", "", "未分类")], gap=True),
    sheet(row("安全交底", "1 条，已确认 4 人", mute=True), row("隐患", st("warn", "1 条待整改")), gap=True),
    sheet(row("李卫东", st("bad", "缺卡"), sub="普工", avatar="李"), row("张建国", num("8.5") + " 小时", sub="钢筋工", avatar="张"), gap=True),
    cta("保存日报", b2("复制")),
    time="17:50",
)

sched = phone(
    "打卡安排", "schedules", "先选给谁排，再看每天几张卡、哪几天上班、从哪天起。班组长到超级管理员用的是同一页。",
    nav("打卡安排"),
    sheet(f("给谁排", "钢筋一班", chev=True), first=True),
    nt("最早明天生效。个人的安排优先于班组的。"),
    h("每天 2 张卡", "添加"),
    sheet(
        row("上班 " + num("08:00"), sub="迟到宽限 10 分钟", chev=True),
        row("下班 " + num("17:30"), sub="早退宽限 0 分钟", chev=True),
    ),
    sheet(
        '<div class="f col"><span class="l">工作日</span>' + weekdays("一二三四五六") + "</div>",
        f("生效日期", "11月19日", chev=True),
        f("截止日期", "长期有效", chev=True),
        gap=True,
    ),
    cta("保存", b3("恢复继承上级")),
)

# ---------- 补卡审批、考勤 ----------
approve = phone(
    "补卡审批", "team-makeups", "多条申请时一次只展开一条，其余收成一行，所以屏上始终只有一个黑按钮。驳回是红字且必须写原因。",
    nav("补卡审批"),
    seg(["待审批 1", "我已处理"], "待审批 1"),
    card(
        '<div class="tt">张建国' + st("warn", "待审批") + "</div>"
        '<div class="me2">11月17日 下班，申请时间 ' + num("17:35") + "</div>"
        "<div style='margin-top:6px'>收工时手机没电，没打上下班卡。</div>"
        + '<div style="margin-top:12px">' + chips(["情况属实", "已核实出勤", "与现场记录不符"], "情况属实") + "</div>"
        + '<div class="act"><div class="go">通过</div>' + b3("驳回", red=True) + "</div>",
        gap=True,
    ),
    nt("通过后考勤会重新计算。不能审批自己的申请。"),
)

approved = phone(
    "补卡审批：已处理", "team-makeups 已处理", "处理过的落章存档。驳回的把原因留在卡片上。",
    nav("补卡审批"),
    seg(["待审批", "我已处理"], "我已处理"),
    card('<div class="tt">刘海</div><div class="me2">11月12日 上班，' + num("08:00") + '</div><div class="me2">审批意见：情况属实</div>' + stamp("已通过", "11-13"), gap=True, stamped=True),
    card('<div class="tt">陈国强' + st("bad", "已驳回") + "</div>" + '<div class="me2">11月09日 下班，申请时间 ' + num("17:30") + "</div><div>审批意见：与现场记录不符。</div>", gap=True),
)

attend = phone(
    "班组考勤", "team-attendance", "十四个统计格只留最常看的三个，其余点“全部统计”。有异常的人排在最前面。",
    nav("班组考勤"),
    seg(["日报", "周报", "月报"], "日报"),
    dsw("11月18日 周三"),
    cs("4 人到岗，1 人缺卡", "应到 5 人，已记工 31.5 小时"),
    nums([("0", "", "迟到"), ("0", "", "早退"), ("3.5", "", "加班工时")], gap=True),
    h("人员", "全部统计"),
    sheet(
        row("李卫东", st("bad", "缺卡"), sub="普工", avatar="李", chev=True),
        row("张建国", num("8.5") + " 小时", sub="钢筋工", avatar="张", chev=True),
        row("赵大勇", num("8.0") + " 小时", sub="钢筋工", avatar="赵", chev=True),
    ),
    time="17:50",
)

attend_person = phone(
    "个人考勤明细", "team-attendance 个人", "点开一个人：这个月的结论、信用和评分、每天的记录。缺卡那天能看到缺的是哪一张。",
    nav("张建国"),
    cs("11月出勤 18 天", "记工 142.5 小时，缺卡 1 天"),
    sheet(row("安全信用", num("95") + " / 100"), row("项目评分", num("88") + " 分" + b3("修改")), gap=True),
    h("每天"),
    sheet(
        row("11月18日 周三", st("ok", "8.5 小时"), chev=True),
        row("11月17日 周二", st("bad", "缺卡")),
        tl(("done", "上班 08:00", "核验通过", num("07:55")), ("", "下班 17:30", "", '<span style="color:#D7261E;font-weight:600">没有记录</span>')),
        row("11月16日 周一", st("ok", "8.0 小时"), chev=True),
    ),
)

attend_month = phone(
    "月报和导出", "team-attendance 月报", "月报多一件事：生成 Excel。生成过的版本留在下面，能再下载。",
    nav("班组考勤"),
    seg(["日报", "周报", "月报"], "月报"),
    dsw("2026年11月"),
    cs("出勤率 94%", "应出勤 110 天，实出勤 103 天"),
    nums([("3", "", "迟到"), ("4", "", "缺卡"), ("3", "", "缺勤"), ("2", "", "补卡通过"), ("1", "", "违规"), ("18.5", "", "加班工时")], wrap=True, gap=True),
    h("月度 Excel"),
    sheet(row("2026-11 第 2 版", b3("下载并打开"), sub="11-18 10:20 生成")),
    cta("重新生成 Excel"),
)

SECTION = {
    "id": "leader",
    "title": "班组长",
    "flow": "班组长一天做四件事：早上看谁没到，白天排工作、发交底，随时批补卡，收工出日报。"
    "首页先回答“谁没到、有什么等我处理”，其余的事从六个入口进去。",
    "groups": [
        ("首页、工作台和我的", "", [home, workspace, me]),
        ("工作安排", "看今天的安排，新建，选人，跟进，邀请临时工", [work_list, work_new, work_pick, work_detail, work_invite]),
        ("安全", "交底、隐患、信用分", [safety, safety_new, safety_issue, credit, credit_new]),
        ("日报和打卡安排", "", [log, sched]),
        ("审批和考勤", "", [approve, approved, attend, attend_person, attend_month]),
    ],
}
