"""生成全部页面的设计稿：python3 build.py <输出文件> [app.config.ts 路径]"""
import re
import sys

from lib import CSS, ICONS, b2, b3, st, stamp
import s_onboard
import s_worker
import s_leader
import s_admin

SECTIONS = [s_onboard.SECTION, s_worker.SECTION, s_leader.SECTION, s_admin.PROJECT, s_admin.COMPANY]


def render():
    links = "".join(f'<a href="#{s["id"]}">{s["title"]}</a>' for s in SECTIONS)
    out = [
        "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>",
        "<meta name='viewport' content='width=device-width, initial-scale=1'>",
        "<title>瀚渤智慧工地：全部页面设计稿</title><style>", CSS, "</style></head><body>", ICONS,
        f'<div class="top"><div><b>瀚渤智慧工地 设计稿</b>{links}</div></div>',
        '<div class="wrap">',
        "<h1>全部页面设计稿</h1>",
        '<p class="lead">每个页面只回答一个问题：用的人现在最想知道什么、最该点哪里。答案放进一块橙色标牌，'
        "或者做成底部那一个黑色按钮；其余内容退到灰底白条里。页面按角色和使用顺序排列，每张图上面一行字写的是这一页的主角。</p>",
        '<div class="rules">',
        "<div><h4>颜色各有一个意思</h4><p>橙色是这一页的主角，一屏只出现一处。黄黑条只表示等你处理。红是异常，绿是正常。</p>"
        '<div class="demo pal"><i style="background:#FF6A13"></i><i style="background:#000"></i>'
        '<i style="background:#EDEEF0;border:1px solid #D9DCDF"></i>'
        '<i style="background:repeating-linear-gradient(-45deg,#000 0 5px,#FFD100 5px 10px)"></i>'
        '<i style="background:#D7261E"></i><i style="background:#00843D"></i></div></div>',
        "<div><h4>按钮只有三级</h4><p>黑色实心的一屏只放一个，是这一页要做的事。其余是黑框，或者一行带下划线的字。</p>"
        f'<div class="demo"><span class="go" style="height:44px;padding:0 22px;font-size:15px;letter-spacing:2px">保存</span>{b2("修改")}{b3("查看记录")}</div></div>',
        "<div><h4>状态用形状加颜色</h4><p>绿方正常，黄三角待处理，红圆异常。强光下颜色看不准，靠形状也分得清。</p>"
        f'<div class="demo" style="gap:16px">{st("ok", "到岗")}{st("warn", "待审批")}{st("bad", "缺卡")}</div></div>',
        "<div><h4>办完了就盖章</h4><p>打卡成功、审批通过、底照通过，都落一个红章。数字一律用标牌上那种窄体粗字。</p>"
        f'<div class="demo">{stamp("已打卡", "07:52")}{stamp("已通过", "11-18", rot=8)}</div></div>',
        "</div>",
    ]
    routes = []
    count = 0
    for s in SECTIONS:
        out.append(f'<section class="sec" id="{s["id"]}"><h2>{s["title"]}</h2><p class="flow">{s["flow"]}</p>')
        for title, note, screens in s["groups"]:
            out.append(f'<div class="grp">{title}<small>{note}</small></div><div class="shots">')
            out.extend(screens)
            out.append("</div>")
            for html in screens:
                count += 1
                routes += re.findall(r"<figcaption>.*?<span>([^<]*)</span>", html)
        out.append("</section>")
    out.append("</div></body></html>")
    return "\n".join(out), routes, count


if __name__ == "__main__":
    html, routes, count = render()
    open(sys.argv[1], "w").write(html)
    covered = {r.split(" ")[0] for r in routes}
    print(f"screens: {count}, distinct pages: {len(covered)}")
    if len(sys.argv) > 2:
        config = open(sys.argv[2]).read()
        pages = re.findall(r'"pages/([a-z-]+)/index"', config)
        missing = [p for p in pages if p not in covered]
        extra = sorted(covered - set(pages))
        print(f"registered pages: {len(pages)}, missing: {missing}, unknown: {extra}")
