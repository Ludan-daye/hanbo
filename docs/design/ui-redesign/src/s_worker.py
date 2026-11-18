"""工人：首页、打卡四步、项目、任务、考勤、补卡、信用、我的。"""
from lib import *  # noqa: F401,F403

MONTH = nums([("18", "天", "出勤"), ("142.5", "", "工时"), ("1", "天", "缺卡", "#D7261E")])


def sign_punch(card, before, clock, button, where):
    return (
        f'<div class="sign"><div class="l0"><b>{card}</b><span>{before}</span></div>'
        f'<div class="num clock">{clock}</div><div class="go">{button}</div><div class="where">{where}</div></div>'
    )


def sign_text(big, sub, button=""):
    return f'<div class="sign"><div class="big">{big}</div><div class="sub">{sub}</div>{f"<div class=go>{button}</div>" if button else ""}</div>'


home_due = phone(
    "首页：该打卡了", "home 工人", "主角是橙色标牌：哪张卡、现在几点、一个“打卡”。首页不读定位，定位是点了打卡之后的第一步。",
    nav("滨江花园一期", back=False, switch=True),
    sign_punch("上班卡", "08:00 前打", "07:46", "打卡", "钢筋一班，钢筋工"),
    h("本月", "考勤记录"),
    MONTH,
    sheet(row("11月17日缺卡，去补卡", chev=True, haz=True), row("我的任务", st("warn", "1 项进行中")), gap=True),
    tab("worker", "首页"),
)

home_done = phone(
    "首页：今天打完了", "home 工人 已完成", "卡打完了，标牌换成一句结论，不再放按钮。",
    nav("滨江花园一期", back=False, switch=True),
    sign_text("今天两张卡都打了", "上班 07:52，下班 17:34，记工 8.5 小时"),
    h("今天"),
    sheet(row("上班 " + num("08:00"), st("ok", "07:52 已打卡")), row("下班 " + num("17:30"), st("ok", "17:34 已打卡"))),
    h("本月", "考勤记录"),
    MONTH,
    sheet(row("我的任务", chev=True), gap=True),
    tab("worker", "首页"),
    time="17:40",
)

home_block = phone(
    "首页：还不能打卡", "home 工人 底照审核中", "打不了卡的时候，标牌直接说原因和该去哪。休息日、没排班、没项目也是这个样子。",
    nav("滨江花园一期", back=False, switch=True),
    sign_text("底照还在审核", "审核通过后才能打卡。一般当天会有结果。", "查看底照"),
    h("今天"),
    sheet(row("上班 " + num("08:00"), st("off", "等底照通过")), row("下班 " + num("17:30"), st("off", "到点再打"))),
    h("本月", "考勤记录"),
    MONTH,
    tab("worker", "首页"),
)

# ---------- 打卡四步 ----------
p_loc = phone(
    "打卡 1：定位", "punch 定位", "进来自动定位。在范围内就一句话加一张示意图（圆圈和圆点，不用地图组件），按钮指向下一步。",
    nav("上班卡"),
    steps(1, 4, "定位"),
    say("你在考勤范围内", "距工地中心 32 米，允许 300 米。"),
    mapbox("滨江花园一期，半径 300 米", me=(54, 44)),
    sheet(row("今天的卡", "上班 " + num("08:00"), chev=True), gap=True),
    cta("下一步：拍现场照片"),
)

p_out = phone(
    "打卡 1：不在范围内", "punch 范围外", "不在范围就停在这一步。说清差多远，按钮是“重新定位”。",
    nav("上班卡"),
    steps(1, 4, "定位"),
    say("你不在考勤范围内", "距工地中心 812 米，允许 300 米。到了工地再点重新定位。"),
    mapbox("滨江花园一期，半径 300 米", me=(88, 20)),
    cta("重新定位", b3("工地位置和联系人")),
)

p_photo = phone(
    "打卡 2：现场照片", "punch 照片", "拍完就能看到照片，不满意点重拍。",
    nav("上班卡"),
    steps(2, 4, "现场照片"),
    say("现场照片拍好了", "只能现场拍，不能从相册选。"),
    pic("07:47 拍摄"),
    cta("下一步：安全交底", b2("重拍")),
)

p_safety = phone(
    "打卡 3：安全交底", "punch 交底", "交底是这一屏唯一的内容。点了“已阅读并理解”直接进人脸，不用再点一次。",
    nav("上班卡"),
    steps(3, 4, "安全交底"),
    say("读完今天的安全交底"),
    card(
        "<b>进入作业区</b><div>正确佩戴安全帽和岗位要求的防护用品。遇到没排除的危险或身体不适，停止作业并报告班组长。</div>"
        '<div class="div"></div><b>今日高处作业注意事项</b><div>3 号楼临边防护今天整改，6 层以上作业必须系安全带。</div>'
        '<div class="me2" style="margin-top:6px">王师傅 07:20 发布</div>',
        gap=True,
    ),
    cta("已阅读并理解"),
)

p_face = phone(
    "打卡 4：人脸核验", "punch 人脸", "屏幕上只有要做的动作和取景框。核验通过自动保存。",
    nav("上班卡"),
    steps(4, 4, "人脸核验"),
    say("请张嘴，再自然合上", "两个动作，大约 8 秒。请留在考勤范围内。"),
    pic("录制中，还剩 5 秒", face=True),
    cta("核验中…", b3("取消"), off=True),
)

p_ok = phone(
    "打卡成功", "punch 成功", "成功就是一个红章。接下来最可能做的事是回首页。",
    nav("上班卡"),
    stamp("已打卡", "07:52", big=True),
    '<div class="say center" style="padding-top:18px"><b>上班卡打好了</b><span>滨江花园一期，钢筋一班</span></div>',
    sheet(row("位置", "范围内，距中心 32 米", mute=True), row("人脸核验", st("ok", "通过")), row("下一张卡", "下班 " + num("17:30")), gap=True),
    cta("回首页", b2("今天的记录")),
    time="7:52",
)

p_retry = phone(
    "打卡没保存上", "punch 未保存", "核验过了但网络断了：说明发生了什么，核验结果还在，按钮只有“重新提交”。",
    nav("上班卡"),
    steps(4, 4, "人脸核验"),
    say("打卡还没保存", "人脸核验已经通过，保存时网络断了。核验结果还有效，不用重拍。"),
    er("网络连接没完成", "检查一下信号，再点重新提交。"),
    cta("重新提交"),
    time="7:52",
)

p_points = phone(
    "今天的卡", "punch 时点", "原来挤在页头的“切换时点、加班打卡、加班补卡”收到这一页，要用时才进来。",
    nav("今天的卡"),
    h("每日两次"),
    sheet(
        row("上班 " + num("08:00"), st("ok", "07:52 已打卡"), sub="迟到宽限 10 分钟"),
        row("下班 " + num("17:30"), st("warn", "待打卡"), sub="早退宽限 0 分钟"),
    ),
    h("加班"),
    sheet(row("加班进场", "18:00 以后", chev=True, mute=True), row("加班补卡", chev=True)),
    nt("打卡要求由班组长或项目管理员设置。"),
    time="12:10",
)

p_test = phone(
    "打卡流程测试", "punch-test", "只在测试版里出现。三步结果竖着排，按钮永远是“下一步该做的那件事”。",
    nav("打卡测试"),
    cs("测试不计考勤", "试一遍定位、拍照和人脸核验"),
    sheet(row("测试项目", "滨江花园一期", chev=True), gap=True),
    sheet(
        tl(
            ("done", "1 定位", "距中心 42 米，允许 300 米", st("ok", "通过")),
            ("done", "2 现场照片", "已上传 186KB", st("ok", "已上传")),
            ("now", "3 活体核验", "录一段动作视频，和底照比对", st("warn", "待测试")),
        ),
        gap=True,
    ),
    cta("开始活体核验"),
)

# ---------- 项目和任务 ----------
projects = phone(
    "我的项目", "my-projects", "最该打卡的那个项目用黑按钮，其余用黑框。一屏仍然只有一个黑按钮。",
    nav("我的项目", back=False),
    seg(["全部 2", "今日 1"], "全部 2"),
    card(
        '<div class="tt">滨江花园 · 一期工程' + st("warn", "待上班") + "</div>"
        '<div class="me2">钢筋一班 钢筋工</div><div class="div"></div>'
        + kv("下一张卡", "上班 " + num("08:00"))
        + '<div class="act"><div class="go">去打卡</div>' + b3("项目详情") + "</div>",
        gap=True,
    ),
    card(
        '<div class="tt">城市更新 · 配套中心' + st("off", "今日无需打卡") + "</div>"
        '<div class="me2">木工一班 普工</div>'
        '<div class="act">' + b2("本项目考勤") + b3("项目详情") + "</div>",
        gap=True,
    ),
    tab("worker", "项目"),
)

project_detail = phone(
    "项目详情", "my-project-detail", "标题就是项目名。今天的安排在最上面，要找人时联系人紧跟着，地图放最后。",
    nav("滨江花园一期"),
    h("今天 11月18日"),
    sheet(row("上班 " + num("08:00"), st("ok", "07:52 已打卡")), row("下班 " + num("17:30"), st("warn", "待打卡"))),
    h("联系人"),
    sheet(row("王师傅", b3("拨打"), sub="班组长", avatar="王"), row("陈工", b3("拨打"), sub="项目负责人", avatar="陈")),
    h("工地"),
    mapbox("上海市黄浦区滨江路 168 号", height=112),
    cta("去打卡", b2("本项目考勤")),
)

tasks = phone(
    "我的任务", "my-tasks", "有多个任务时，只有正在做或最先要做的那个用黑按钮，其余用黑框。交底排在任务后面。",
    nav("我的任务"),
    dsw("11月18日 周三"),
    card(
        '<div class="tt">3 号楼照明维修' + st("warn", "作业中") + "</div>"
        '<div class="me2">滨江花园一期，负责人 王师傅</div><div class="div"></div>'
        + kv("计划", num("08:00") + " 到 " + num("12:00") + "，约 4 小时")
        + kv("开工", num("08:05"))
        + '<div class="act"><div class="go">完工打卡</div>' + b3("申请完工补卡") + "</div>",
        gap=True,
    ),
    h("安全交底"),
    card("<b>今日高处作业注意事项</b><div>6 层以上作业必须系安全带。</div>" + '<div class="act">' + b2("已阅读并理解") + "</div>"),
    b3("输入邀请码，加入临时任务", center=True),
    time="10:30",
)

# ---------- 考勤和补卡 ----------
records = phone(
    "我的考勤", "my-records", "顶上一句话说这段时间的结果。有问题的那天排在明细里，补卡按钮就在那天下面。",
    nav("我的考勤"),
    seg(["今天", "近7天", "本月", "自选"], "本月"),
    cs("本月出勤 18 天", "记工 142.5 小时，缺卡 1 天"),
    sheet(f("项目", "全部项目", chev=True), gap=True),
    sheet(
        row("11月18日 周三", st("ok", "8.5 小时"), chev=True),
        row("11月17日 周二", st("bad", "缺卡")),
        tl(("done", "上班 08:00", "", num("07:55")), ("", "下班 17:30", "", '<span style="color:#D7261E;font-weight:600">没有记录</span>')),
        row("为这一天申请补卡", chev=True, haz=True),
        row("11月16日 周一", st("ok", "8.0 小时"), chev=True),
        gap=True,
    ),
)

makeup_new = phone(
    "申请补卡", "submit-makeup", "从缺卡那天进来，项目、日期、哪张卡都已经带好，只要写时间和原因。",
    nav("申请补卡"),
    sheet(
        f("项目", "滨江花园一期", chev=True, req=True),
        f("日期", "11月17日 周二", chev=True, req=True),
        f("补哪张卡", "下班（计划 17:30）", chev=True, req=True),
        f("实际时间", num("17:35"), chev=True, req=True),
        area("申请原因", ph="说明漏打卡的实际情况", req=True),
        first=True,
    ),
    nt("提交后由班组长审批，通过后考勤会重新计算。"),
    cta("提交申请"),
)

makeups = phone(
    "我的补卡", "my-makeups", "通过的落红章，驳回的把原因直接写在卡片上，不用点开。",
    nav("我的补卡"),
    seg(["全部", "待审批", "通过", "驳回"], "全部"),
    card('<div class="tt">11月17日 下班' + st("warn", "待审批") + "</div>" + '<div class="me2">申请时间 17:35，滨江花园一期</div>', gap=True),
    card('<div class="tt">11月10日 上班</div><div class="me2">申请时间 08:00</div><div class="me2">审批意见：情况属实</div>' + stamp("已通过", "11-11"), gap=True, stamped=True),
    card('<div class="tt">11月03日 下班' + st("bad", "已驳回") + "</div>" + '<div class="me2">申请时间 17:30，滨江花园一期</div><div>审批意见：与现场记录不符。</div>', gap=True),
    cta("申请补卡"),
)

credit = phone(
    "我的安全信用", "my-safety-credit", "分数就是标牌上的大数字。每条违规能看到依据，不服可以申请复核。",
    nav("安全信用"),
    cs("安全信用分", "累计违规 1 次，已连续 3 个用工日无违规", "95"),
    nt("初始 100 分。一般扣 5，严重扣 10，重大扣 20。连续 10 个用工日无违规，恢复 5 分。"),
    h("违规记录"),
    card(
        '<div class="tt">未戴安全帽<span class="num val" style="color:#D7261E">−5</span></div>'
        '<div class="me2">一般，11-17 09:20，已确认</div><div>进入 3 号楼作业区时未佩戴安全帽。</div>'
        '<div class="me2" style="margin-top:4px">审核意见：现场照片核实。</div>'
        '<div class="act">' + b2("申请复核") + b3("凭证照片") + "</div>"
    ),
)

me = phone(
    "我的", "profile", "上面是一张工牌。下面两组：和我这个人有关的，和记录有关的。退出在最底下。",
    nav("我的", back=False),
    '<div class="badge"><div class="bband"><i></i></div><div class="bbody"><div class="idrow"><span class="photo">张</span>'
    "<div><b>张建国</b><small>钢筋工，钢筋一班</small><small>138****0001，微信已关联</small></div></div></div></div>",
    sheet(row("本人资料", chev=True), row("用工登记", chev=True), row("人脸底照", st("ok", "已通过"), chev=True), gap=True),
    sheet(row("我的考勤", chev=True), row("补卡记录", chev=True), row("安全信用", num("95") + " 分", chev=True), gap=True),
    links(b3("权限与范围"), b3("退出登录", red=True)),
    tab("worker", "我的"),
)

levels = phone(
    "权限与范围", "permission-levels", "先说我是哪一级、管到哪，再列五个等级，自己那一级标出来。",
    nav("权限与范围"),
    cs("一级 普通工人", "范围：本人。滨江花园一期，钢筋一班"),
    nt("可以：定位和人脸打卡，看本人考勤，申请补卡，看本人任务和安全信用。"),
    h("五个等级"),
    '<div class="sheet">'
    '<div class="lvl on"><span class="n num">1</span><div><b>普通工人</b><span>本人的打卡、考勤和补卡</span></div></div>'
    '<div class="lvl"><span class="n num">2</span><div><b>班组长</b><span>本班组的安排、审批和日报</span></div></div>'
    '<div class="lvl"><span class="n num">3</span><div><b>项目管理员</b><span>本项目的人员、规则和报表</span></div></div>'
    '<div class="lvl"><span class="n num">4</span><div><b>公司管理员</b><span>本公司的项目和人员</span></div></div>'
    '<div class="lvl"><span class="n num">5</span><div><b>超级管理员</b><span>平台、公司和账号</span></div></div>'
    "</div>",
)

SECTION = {
    "id": "worker",
    "title": "工人",
    "flow": "工人打开小程序，看到的就是今天该打的那张卡。点“打卡”，按定位、照片、交底、人脸四步走完，落一个红章。"
    "月底看考勤，哪天缺卡，就在那天下面补。",
    "groups": [
        ("首页", "三种情况：该打卡、打完了、打不了", [home_due, home_done, home_block]),
        ("打卡", "一屏一步，四步走完盖章", [p_loc, p_out, p_photo, p_safety, p_face, p_ok, p_retry, p_points]),
        ("项目和任务", "", [projects, project_detail, tasks, p_test]),
        ("考勤、补卡和我的", "", [records, makeup_new, makeups, credit, me, levels]),
    ],
}
