"""项目管理员、公司管理员、超级管理员。"""
from lib import *  # noqa: F401,F403


def sign_count(top_left, top_right, number, unit, exc_label, exc_value):
    return (
        f'<div class="sign"><div class="top2"><span>{top_left}</span><span>{top_right}</span></div>'
        f'<div class="hl"><span class="num">{number}</span><b>{unit}</b></div>'
        f'<div class="exc"><span>{exc_label}</span><b>{exc_value}</b><i>查看</i></div></div>'
    )


# =============== 项目管理员 ===============
p_home = phone(
    "首页", "home 项目管理员", "和班组长首页一个结构：标牌说今天到了多少、缺多少；三类待办排成一列。",
    nav("滨江花园一期", back=False, switch=True),
    sign_count("11月18日 周三", "应到 48 人", "43", "人到岗", "缺卡", "5 人"),
    h("等你处理"),
    sheet(
        row("补卡申请 3 条", chev=True, haz=True),
        row("违规待复核 1 条", chev=True, haz=True),
        row("底照待审核 2 人", chev=True, haz=True),
    ),
    grid([("users", "项目人员"), ("chart", "考勤报表"), ("grid", "班组管理")], gap=True),
    tab("manager", "首页"),
)

people = phone(
    "项目人员", "participants", "找人是第一位的：搜索在最上面，按身份筛。添加是黑按钮，从别的项目调人是黑框。",
    nav("项目人员"),
    search("搜索姓名、手机号、班组或工种"),
    seg(["全部 48", "工人", "班组长", "管理员"], "全部 48"),
    sheet(
        row("张建国", chev=True, sub="钢筋工，钢筋一班", avatar="张"),
        row("王师傅", "班组长", chev=True, sub="钢筋工，钢筋一班", avatar="王", mute=True),
        row("李明", st("warn", "已暂停"), chev=True, sub="木工，木工一班", avatar="李"),
        row("周强", st("off", "已退场"), chev=True, sub="临时工，钢筋一班", avatar="周"),
        row("陈工", "管理员", chev=True, sub="安全管理", avatar="陈", mute=True),
        gap=True,
    ),
    cta("添加成员", b2("复用人员")),
)

person = phone(
    "成员资料", "person-form", "两块：这个人是谁，在本项目怎么安排。身份可以点多个；点了班组长，才出现“管哪个班组”。",
    nav("添加成员"),
    sheet(f("姓名", "孙立", req=True), f("手机号", "13900002211", req=True), f("工种", "钢筋工", req=True), first=True),
    sheet(
        f("本项目身份", right=chips(["工人", "班组长", "管理员"], "工人"), req=True),
        f("班组", "钢筋一班", chev=True),
        f("进场日期", "11月18日", chev=True),
        f("参与考勤", right=sw(True)),
        gap=True,
    ),
    nt("建档后到“邀请绑定”生成邀请码，交给本人用微信绑定。"),
    cta("保存"),
)

reuse = phone(
    "复用人员", "person-reuse", "从公司别的项目把人调过来，档案和微信绑定都沿用。先选来源项目，再勾人。",
    nav("复用人员"),
    cs("加到 滨江花园一期", "沿用原档案和微信绑定，原项目的记录保留"),
    sheet(f("从哪个项目", "城市更新 · 配套中心", chev=True), gap=True),
    search("搜索姓名、手机号或工种"),
    sheet(
        row("李明", ck(True, round_=True), sub="木工，原项目在场", avatar="李"),
        row("吴刚", ck(False, round_=True), sub="电工，原项目在场", avatar="吴"),
        row("郑伟", ck(False, round_=True), sub="普工，原项目已退场", avatar="郑"),
        gap=True,
    ),
    cta("下一步：安排岗位"),
)

face_review = phone(
    "底照审核", "face-review", "一次只展开一个人，其余收成一行。照片够大，通过是黑按钮，不通过必须写原因。",
    nav("底照审核"),
    seg(["待审核 2", "已审核"], "待审核 2"),
    card('<div class="tt">张建国' + st("warn", "待审核") + "</div>" + '<div class="me2">钢筋工，钢筋一班，第 2 次提交</div>', gap=True),
    pic("张建国 提交的底照", icon="face"),
    sheet(area("核对依据或不通过原因", ph="例如：已和本人、身份证核对"), gap=True),
    cta("核对通过", b3("不通过", red=True)),
)

invite = phone(
    "邀请绑定", "invitation", "给还没绑微信的成员发邀请码。选一个人，生成，把码交给他本人。",
    nav("邀请绑定"),
    seg(["工人", "管理员"], "工人"),
    sheet(
        row("孙立", ck(True, round_=True), sub="钢筋工，钢筋一班", avatar="孙"),
        row("钱勇", ck(False, round_=True), sub="木工，木工一班", avatar="钱"),
        gap=True,
    ),
    card(
        '<div class="me2">孙立的邀请码</div>' + code("482913") + '<div class="me2">有效到 11月25日。请交给他本人。</div>'
        + '<div class="act"><div class="go">复制邀请码</div></div>',
        gap=True,
    ),
)

teams = phone(
    "班组管理", "project-management", "班组一行一个：工种、人数、负责人。发出去的邀请码在第二个标签里。",
    nav("班组管理"),
    seg(["班组 2", "邀请"], "班组 2"),
    sheet(
        row("钢筋一班", chev=True, sub="钢筋工，在场 12 人，负责人 张建国"),
        row("木工一班", st("warn", "已暂停"), chev=True, sub="木工，在场 0 人，没有负责人"),
        gap=True,
    ),
    cta("新增班组"),
)

team = phone(
    "班组资料", "team-detail", "标题就是班组名。负责人单独一块，成员是一行入口，点进去是筛好的项目人员。",
    nav("钢筋一班"),
    sheet(f("班组名称", "钢筋一班", req=True), f("主要工种", "钢筋工"), f("状态", right=chips(["正常", "暂停"], "正常")), first=True),
    h("负责人"),
    sheet(row("张建国", b3("更换"), sub="138****0001", avatar="张")),
    nt("负责人管联络。审批补卡需要班组长权限。"),
    sheet(row("班组成员", "在场 12 人", chev=True, icon="users", mute=True), gap=True),
    cta("保存"),
)

worktime = phone(
    "工时规则", "project-worktime", "两个开关决定工时怎么算。打开开关才出现对应的时间。新规则从选的那天起算，旧的留档。",
    nav("工时规则"),
    sheet(
        f("项目类型", "常规施工", chev=True),
        f("区分加班", right=sw(True)),
        f("加班从几点算", num("18:00"), chev=True),
        f("扣除午休", right=sw(True)),
        f("午休", num("12:00") + " 到 " + num("13:00"), chev=True),
        f("生效日期", "11月19日", chev=True),
        first=True,
    ),
    h("规则记录"),
    sheet(row("11月01日 起", "版本 1", sub="加班 18:00，午休 12:00 到 13:00", mute=True)),
    cta("保存规则"),
)

review = phone(
    "违规复核", "safety-review", "一次只展开一条。确认才扣分，所以确认前要看凭证、写意见。",
    nav("违规复核"),
    seg(["待审核 1", "申诉", "全部"], "待审核 1"),
    card(
        '<div class="tt">未佩戴安全帽<span class="me2">拟扣 ' + num("10") + " 分</span></div>"
        '<div class="me2">张建国，严重，11-18 09:20，王师傅登记</div>'
        "<div style='margin-top:6px'>进入 3 号楼作业区时未佩戴安全帽，经提醒后佩戴。</div>",
        gap=True,
    ),
    pics(pic("凭证 1", small=True), pic("凭证 2", small=True)),
    sheet(area("审核意见", ph="写清依据", req=True), gap=True),
    cta("确认违规", b3("驳回")),
)

settings = phone(
    "项目设置", "project-detail 设置", "项目管理员从工作台进来直接到这里：只管项目资料和考勤范围。",
    nav("项目设置"),
    sheet(
        f("项目名称", "滨江花园 · 一期工程", req=True),
        f("状态", "进行中", chev=True),
        f("计划工期", "2026.3.1 到 12.31", chev=True),
        f("联系人", "陈工 13800000002", chev=True),
        first=True,
    ),
    h("考勤范围"),
    mapbox("半径 300 米，黄浦区滨江路 168 号", height=132),
    b2("重新选择工地中心", wide=True),
    cta("保存"),
)

reports = phone(
    "考勤报表", "reports", "和班组考勤是同一页，范围换成整个项目，多一行班组筛选。",
    nav("考勤报表"),
    seg(["日报", "周报", "月报"], "日报"),
    dsw("11月18日 周三"),
    cs("43 人到岗，5 人缺卡", "应到 48 人，已记工 338.5 小时"),
    sheet(f("班组", "全部班组", chev=True), gap=True),
    h("人员", "全部统计"),
    sheet(
        row("李卫东", st("bad", "缺卡"), sub="普工，钢筋一班", avatar="李", chev=True),
        row("李明", st("bad", "迟到"), sub="木工，木工一班", avatar="李", chev=True),
        row("张建国", num("8.5") + " 小时", sub="钢筋工，钢筋一班", avatar="张", chev=True),
    ),
    time="17:50",
)

PROJECT = {
    "id": "project",
    "title": "项目管理员",
    "flow": "项目管理员管四样：人、规则、审核、报表。首页和班组长一个结构，只是范围变成整个项目；"
    "打卡安排、补卡审批和班组长用的是同一页，这里不重复画。",
    "groups": [
        ("首页", "", [p_home]),
        ("人", "找人、加人、调人、审底照、发邀请码、管班组", [people, person, reuse, face_review, invite, teams, team]),
        ("规则、审核和报表", "", [worktime, review, settings, reports]),
    ],
}

# =============== 公司管理员、超级管理员 ===============
c_home = phone(
    "首页（公司管理员）", "home 公司管理员", "标牌换成全公司今天的到岗数。下面一个项目一行，哪个项目缺得多一眼看到。",
    nav("瀚渤建设", back=False, switch=True),
    sign_count("11月18日 周三", "2 个项目", "66", "人到岗", "缺卡", "7 人"),
    h("项目"),
    sheet(
        row("滨江花园 · 一期工程", st("bad", "缺 5 人"), sub="到岗 43 / 48", chev=True),
        row("城市更新 · 配套中心", st("bad", "缺 2 人"), sub="到岗 23 / 25", chev=True),
    ),
    grid([("users", "公司人员"), ("chart", "公司报表"), ("plus", "新建项目")], gap=True),
    tab("manager", "首页"),
)

c_projects = phone(
    "公司项目", "company-projects", "项目一张卡：名称、状态、地址。点开能看到考勤范围和工期，黑框进入这个项目。",
    nav("公司项目"),
    search("搜索项目名称或地址"),
    seg(["全部 2", "进行中", "筹备中", "已完工"], "全部 2"),
    card(
        '<div class="tt">滨江花园 · 一期工程' + st("ok", "进行中") + "</div>"
        '<div class="me2">上海市黄浦区滨江路 168 号</div><div class="div"></div>'
        + kv("考勤范围", "工地中心周围 300 米") + kv("计划工期", "2026-03-01 到 2026-12-31")
        + '<div class="act">' + b2("进入项目") + b3("收起") + "</div>",
        gap=True,
    ),
    card('<div class="tt">城市更新 · 配套中心' + st("warn", "筹备中") + "</div>" + '<div class="me2">上海市浦东新区建设路 66 号</div>', gap=True),
    cta("新建项目"),
)

c_hub = phone(
    "进入项目", "project-detail", "公司管理员从公司项目点“进入项目”到这里：这个项目的八个入口，加一行项目设置。左上角返回公司。",
    nav("滨江花园一期"),
    cs("进行中", "黄浦区滨江路 168 号，在场 48 人"),
    grid([("check", "补卡审批"), ("shield", "违规复核"), ("clock", "工时规则"), ("users", "项目人员"),
          ("chart", "考勤报表"), ("key", "邀请绑定"), ("grid", "班组管理"), ("cal", "打卡安排")], cols=4, gap=True),
    sheet(row("项目设置", "资料和考勤范围", chev=True, icon="gear", mute=True), gap=True),
)

c_new = phone(
    "新建项目", "create-project", "四样齐了按钮才亮：名称、管理员、工地位置、地址。工期可以以后再填。",
    nav("新建项目"),
    sheet(
        f("项目名称", "滨江花园 · 二期工程", req=True),
        f("项目管理员", "陈工 等 2 人", chev=True, req=True),
        first=True,
    ),
    h("工地位置和考勤范围"),
    mapbox("半径 300 米"),
    sheet(f("详细地址", "滨江路 188 号东门", req=True), f("状态", right=chips(["筹备中", "进行中"], "筹备中")), f("计划开工", "11月18日", chev=True), gap=True),
    cta("创建项目"),
)

c_people = phone(
    "公司人员", "company-people", "和项目人员一个样子，范围是全公司，副行里写这个人在哪个项目。",
    nav("公司人员"),
    search("搜索姓名、手机号、班组或工种"),
    seg(["全部 73", "工人", "管理"], "全部 73"),
    sheet(
        row("张建国", chev=True, sub="钢筋工，滨江花园一期", avatar="张"),
        row("王师傅", "班组长", chev=True, sub="钢筋工，滨江花园一期", avatar="王", mute=True),
        row("李明", "2 个项目", chev=True, sub="木工，滨江花园一期 等", avatar="李", mute=True),
        row("陈工", "管理员", chev=True, sub="安全管理，滨江花园一期", avatar="陈", mute=True),
        gap=True,
    ),
)

c_reports = phone(
    "公司报表", "company-reports", "同一套报表，按项目分行。月报在这里生成全公司的 Excel。",
    nav("公司报表"),
    seg(["日报", "周报", "月报"], "月报"),
    dsw("2026年11月"),
    cs("出勤率 93%", "2 个项目，73 人，记工 9,860 小时"),
    h("按项目"),
    sheet(
        row("滨江花园 · 一期工程", num("94") + "%", sub="48 人，6,540 小时", chev=True),
        row("城市更新 · 配套中心", num("91") + "%", sub="25 人，3,320 小时", chev=True),
    ),
    h("月度 Excel"),
    sheet(row("2026-11 第 1 版", b3("下载并打开"), sub="11-18 09:02 生成")),
    cta("重新生成 Excel"),
)

s_home = phone(
    "首页（超级管理员）", "home 超级管理员", "平台没有“今天到岗”这件事，标牌改说平台的规模和有没有账号等着分配权限。",
    nav("平台", back=False),
    '<div class="sign"><div class="big">1 家公司，2 个项目</div><div class="sub">52 个账号在用</div>'
    '<div class="exc"><span>待分配权限</span><b>3 个账号</b><i>查看</i></div></div>',
    grid([("gear", "平台管理"), ("star", "信用规则"), ("clock", "打卡安排")], gap=True),
    sheet(row("补卡审批", chev=True, icon="check"), gap=True),
    tab("manager", "首页"),
)

s_company = phone(
    "平台管理：公司", "system-management", "四个标签：公司、账号、设置、日志。公司一行一家，暂停放在点进去之后，不放在列表上。",
    nav("平台管理"),
    seg(["公司", "账号", "设置", "日志"], "公司"),
    sheet(row("瀚渤建设（演示）", st("ok", "正常"), chev=True, sub="2 个项目"), gap=True),
    cta("新增公司"),
)

s_account = phone(
    "平台管理：账号", "system-management 账号", "点一个账号，在下面改等级、范围和状态。改自己的不行，要别的管理员来改。",
    nav("平台管理"),
    seg(["公司", "账号", "设置", "日志"], "账号"),
    search("搜索姓名或手机号"),
    sheet(row("陈工", st("ok", "正常"), sub="项目管理员，138****0002", avatar="陈"), gap=True),
    sheet(
        f("权限等级", "三级 项目管理员", chev=True),
        f("管理范围", "滨江花园 · 一期工程", chev=True),
        f("状态", right=chips(["正常使用", "停用"], "正常使用")),
        gap=True,
    ),
    nt("新权限在这个账号下次进入时生效。"),
    cta("保存权限"),
)

s_setting = phone(
    "平台管理：设置", "system-management 设置", "只有两项。公告会显示在所有人的首页。",
    nav("平台管理"),
    seg(["公司", "账号", "设置", "日志"], "设置"),
    sheet(f("联系电话", "021-5555 0100", req=True), area("首页公告", "安全第一，进入施工现场请佩戴安全帽。"), gap=True),
    nt("公告最多 160 字。"),
    cta("保存"),
)

s_log = phone(
    "平台管理：日志", "system-management 日志", "只读。谁、什么时候、做了什么，按时间倒着排。",
    nav("平台管理"),
    seg(["公司", "账号", "设置", "日志"], "日志"),
    sheet(
        row("调整账号权限", num("11-18 10:20"), sub="陈工 改为项目管理员", mute=True),
        row("发布信用规则", num("11-17 16:05"), sub="版本 2", mute=True),
        row("新增公司", num("11-01 09:00"), sub="瀚渤建设（演示）", mute=True),
        gap=True,
    ),
)

policy = phone(
    "信用规则", "safety-policy", "顶上是现在生效的规则。下面填新版本，从选的那天起算，旧版本留档。发布前会再问一次。",
    nav("信用规则"),
    cs("扣分 5 / 10 / 20", "一般、严重、重大。连续 10 个用工日无违规恢复 5 分"),
    h("新版本"),
    sheet(
        f("生效日期", "11月20日", chev=True),
        f("一般违规扣", num("5") + " 分"),
        f("严重违规扣", num("10") + " 分"),
        f("重大违规扣", num("20") + " 分"),
        f("无违规多少个用工日", num("10") + " 天"),
        f("恢复", num("5") + " 分"),
    ),
    cta("发布新规则"),
)

COMPANY = {
    "id": "company",
    "title": "公司和平台",
    "flow": "公司管理员看全公司的项目和人，建新项目，出公司报表。超级管理员管公司、账号权限、平台设置和全局的信用规则。",
    "groups": [
        ("公司管理员", "", [c_home, c_projects, c_hub, c_new, c_people, c_reports]),
        ("超级管理员", "", [s_home, s_company, s_account, s_setting, s_log, policy]),
    ],
}
