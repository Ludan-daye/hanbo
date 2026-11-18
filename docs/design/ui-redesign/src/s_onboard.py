"""入场：登录、本人资料、绑定档案、用工登记四步、人脸底照。"""
from lib import *  # noqa: F401,F403

ENT = (
    '<div class="logo">瀚</div>'
    '<div class="say" style="padding-top:16px"><b>瀚渤智慧工地</b><span>先选你的用工方式，再用微信登录。</span></div>'
)

login = phone(
    "登录", "login", "主角是“微信登录”。先选长期还是临时，按钮才亮。管理人员走下面那行字。",
    nav("", back=False),
    ENT,
    '<div class="ent on" style="margin-top:18px"><div><b>长期用工</b><span>长期在项目上，按班组安排干活</span></div><span>✓</span></div>',
    '<div class="ent"><div><b>临时用工</b><span>短期进场，做临时或零星的活</span></div><span class="chev">›</span></div>',
    go("微信登录"),
    b3("我是管理人员", center=True),
    nt("入场要完成微信绑定、用工登记和底照录入。岗位和权限由管理员分配。"),
)

profile0 = phone(
    "本人资料", "complete-profile", "入场一共七步，顶上一直告诉你走到第几步。这一步只填两样。",
    nav("入场登记", back=False),
    steps(1, 7, "姓名和手机号"),
    say("先认识一下你", "姓名和手机号要和管理员建的档案一致。"),
    sheet(f("真实姓名", ph="与人员档案一致", req=True), f("手机号", ph="本人手机号", req=True), gap=True),
    nt("头像和昵称以后可以在“我的”里设置。"),
    cta("保存并继续", b3("退出登录")),
)

bind0 = phone(
    "绑定档案", "bind", "只有一个输入框。档案邀请码和六位临时工邀请码都在这里输。",
    nav("入场登记", back=False),
    steps(2, 7, "绑定档案"),
    say("输入邀请码", "邀请码由班组长或管理员给你，只能本人用。"),
    sheet(f("邀请码", ph="请输入邀请码", req=True), gap=True),
    sheet(row("本人资料", b3("修改"), sub="张建国 138****0001"), gap=True),
    cta("确认绑定", b3("退出登录")),
)

bind1 = phone(
    "绑定成功", "bind 已绑定", "办完了就盖章。下面是绑到了谁、哪个项目，核对一眼再往下走。",
    nav("入场登记", back=False),
    steps(2, 7, "绑定档案"),
    stamp("已绑定", "11-18", big=True),
    '<div class="say center" style="padding-top:18px"><b>档案绑好了</b><span>资料有误，请联系管理员核实。</span></div>',
    sheet(row("姓名", "张建国"), row("项目", "滨江花园一期"), row("班组", "钢筋一班"), row("权限", "一级 普通工人"), gap=True),
    cta("继续填用工登记"),
)

reg1 = phone(
    "用工登记 1/4", "worker-registration 身份与住址", "一屏只问一类事。身份证支持粘贴，自动整理格式。",
    nav("入场登记"),
    steps(3, 7, "身份与住址"),
    sheet(
        f("身份证号", "310101198805123418", req=True),
        f("所在地区", "上海市 黄浦区", chev=True, req=True),
        area("详细地址", "滨江路 168 号 3 栋 502", req=True),
        gap=True,
    ),
    nt("已输入 18 / 18 位。详细地址不用再写省市区。"),
    cta("下一步", b2("上一步")),
)

reg2 = phone(
    "用工登记 2/4", "worker-registration 紧急联系人", "填错了，红线标在那一行，原因写在下面，不弹窗、不清空。",
    nav("入场登记"),
    steps(4, 7, "紧急联系人"),
    sheet(
        f("联系人姓名", "张秀英", req=True),
        f("电话类型", right=chips(["手机", "座机"], "手机")),
        f("联系电话", "1390000", req=True, bad=True),
        gap=True,
    ),
    ferr("手机号是 11 位，现在只有 7 位。"),
    cta("下一步", b2("上一步")),
)

reg3 = phone(
    "用工登记 3/4", "worker-registration 健康与保险", "选了“已购买”才出现保险那几项，没买的人看不到多余的格子。",
    nav("入场登记"),
    steps(5, 7, "健康与保险"),
    sheet(f("长期用药疾病", right=chips(["无", "有"], "无"), req=True), gap=True),
    sheet(
        f("人身保险", right=chips(["未购买", "已购买"], "已购买"), req=True),
        f("保险名称", "团体意外险", req=True),
        f("保险公司", ph="选填"),
        f("保障期限", "2026.1.1 至 12.31", chev=True, req=True),
        gap=True,
    ),
    chips(["人身意外险", "团体意外险", "雇主责任险"], "团体意外险", pad=True),
    cta("下一步", b2("上一步")),
)

reg4 = phone(
    "用工登记 4/4", "worker-registration 银行卡与核对", "最后一步顺手把前面三类核对一遍，哪类要改点哪类。",
    nav("入场登记"),
    steps(6, 7, "银行卡与核对"),
    sheet(f("银行卡号", "6222 0212 3456 7890", req=True), gap=True),
    h("核对已填的资料"),
    sheet(
        row("身份与住址", st("ok", "已填写") + b3("修改")),
        row("紧急联系人", st("ok", "已填写") + b3("修改")),
        row("健康与保险", st("ok", "已填写") + b3("修改")),
    ),
    nt("资料用于用工登记、紧急联络和工资发放。"),
    cta("保存，去拍底照", b2("上一步")),
)

face0 = phone(
    "人脸底照：拍摄", "face-profile 未录入", "主角是“拍摄底照”。同意说明是一行勾选，不同意拍不了。",
    nav("入场登记"),
    steps(7, 7, "人脸底照"),
    say("拍一张本人正脸", "打卡时用它核对是不是你本人，微信头像不算。"),
    pic("正脸对准虚线，光线要足", face=True),
    sheet(row("我已阅读并同意采集与使用说明", ck(True)), gap=True),
    cta("拍摄底照", b3("查看说明")),
)

face1 = phone(
    "人脸底照：审核中", "face-profile 审核中", "交上去之后只有一件事可做：进首页。审核结果会在首页提醒。",
    nav("人脸底照", back=False),
    say("底照审核中", "管理员审核通过后才能正式打卡。"),
    pic("已提交的底照", icon="face"),
    sheet(row("状态", st("warn", "待管理员审核")), row("提交时间", num("11-18 08:12")), gap=True),
    cta("进入首页", b3("更换底照")),
)

face2 = phone(
    "人脸底照：已通过", "face-profile 已通过", "通过了落一个章。以后从“我的”进来看到的就是这一页。",
    nav("人脸底照"),
    stamp("已通过", "11-18", big=True),
    '<div class="say center" style="padding-top:18px"><b>底照可以用来打卡了</b><span>每次打卡会拿现场的人脸和它比对。</span></div>',
    sheet(row("提交时间", num("11-18 08:12")), row("审核时间", num("11-18 09:30")), row("活体测试", "不计考勤", chev=True, mute=True), gap=True),
    cta(None, b2("更换底照"), b3("刷新状态")),
)

face3 = phone(
    "人脸底照：未通过", "face-profile 未通过", "没通过就说清楚为什么、接下来做什么，按钮就是那件事。",
    nav("人脸底照"),
    say("底照没通过", "看一下原因，重新拍一张清楚的正脸。"),
    er("审核意见", "光线太暗，看不清五官。请到亮一点的地方重拍。"),
    pic("上次提交的底照", icon="face"),
    cta("重新拍摄底照"),
)

SECTION = {
    "id": "onboard",
    "title": "入场",
    "flow": "第一次进来要走七步：姓名手机号、绑定档案、用工登记四步、人脸底照。每一屏只问一类事，顶上一直写着走到第几步；"
    "中途退出，下次从停下的那一步接着来。",
    "groups": [
        ("登录和绑定", "选入口，登录，填姓名，输邀请码", [login, profile0, bind0, bind1]),
        ("用工登记", "四类资料，一屏一类", [reg1, reg2, reg3, reg4]),
        ("人脸底照", "拍摄，等审核，看结果", [face0, face1, face2, face3]),
    ],
}
