"""瀚渤智慧工地 UI 设计稿：组件库。

每个函数返回一段 HTML。页面由这些组件拼出来，保证四十多个页面用的是同一套零件。
"""

CSS = r"""
*{box-sizing:border-box;margin:0;padding:0}
:root{--o:#FF6A13;--c:#EDEEF0;--y:#FFD100;--r:#D7261E;--g:#00843D;--m:#7A8087;--hair:#EEF0F1;--ph:#B4B9BE}
body{font-family:-apple-system,"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;background:#F6F7F8;color:#000;-webkit-font-smoothing:antialiased}
.num{font-family:"DIN Alternate","DIN Condensed","Bahnschrift","Roboto Condensed",-apple-system,sans-serif;font-weight:700;font-variant-numeric:tabular-nums}
.ic{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}

/* ---------- 展示页 ---------- */
.top{position:sticky;top:0;z-index:20;background:rgba(246,247,248,.94);backdrop-filter:blur(8px);border-bottom:1px solid #E1E4E7}
.top div{max-width:1400px;margin:0 auto;padding:12px 28px;display:flex;gap:22px;align-items:center;font-size:13.5px;flex-wrap:wrap}
.top b{font-size:15px;font-weight:900;margin-right:8px}
.top a{color:#3D4349;text-decoration:none;font-weight:600}
.top a:hover{color:var(--o)}
.wrap{max-width:1400px;margin:0 auto;padding:40px 28px 110px}
h1{font-size:32px;font-weight:900}
.lead{color:#5A6067;margin-top:10px;font-size:15px;line-height:1.85;max-width:720px}
.rules{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;margin-top:28px;padding-top:26px;border-top:1px solid #E1E4E7}
.rules h4{font-size:14.5px;font-weight:800}
.rules p{font-size:13px;color:#5A6067;line-height:1.75;margin-top:6px}
.rules .demo{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px;min-height:46px}
.pal i{width:26px;height:26px;border-radius:6px;display:inline-block}
section.sec{margin-top:64px;padding-top:34px;border-top:1px solid #E1E4E7}
section.sec>h2{font-size:26px;font-weight:900}
section.sec>p.flow{color:#3D4349;font-size:14.5px;line-height:1.85;margin-top:8px;max-width:820px}
.grp{font-size:15px;font-weight:800;margin:36px 0 4px}
.grp small{font-weight:500;color:var(--m);font-size:13px;margin-left:10px}
.shots{display:flex;gap:30px 28px;flex-wrap:wrap;margin-top:18px}
figure.ph{width:300px}
figure.ph figcaption{font-size:13px;font-weight:700;margin:0 0 4px 4px;display:flex;justify-content:space-between;align-items:baseline}
figure.ph figcaption span{font-size:11px;color:#A3A8AE;font-weight:500;font-family:ui-monospace,Menlo,monospace}
figure.ph p.why{font-size:12px;color:var(--m);line-height:1.65;margin:0 0 9px 4px;min-height:40px}

/* ---------- 手机 ---------- */
.phone{width:300px;height:660px;border-radius:42px;border:8px solid #111417;position:relative;overflow:hidden;font-size:12px;line-height:1.45;background:var(--c);color:#000;box-shadow:0 18px 40px rgba(17,20,23,.14)}
.isl{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:74px;height:21px;border-radius:11px;background:#000;z-index:5}
.sb{height:36px;display:flex;justify-content:space-between;align-items:flex-end;padding:0 24px 3px;font-weight:600;font-size:11.5px}
.nav{height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 16px}
.nav .t{display:flex;align-items:center;gap:4px;font-size:16px;font-weight:800;white-space:nowrap}
.nav .t em{font-style:normal;font-size:10px;margin-left:3px;opacity:.5}
.nav .bk{width:20px;height:20px;stroke:#000;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;margin-left:-4px}
.cap{display:inline-flex;align-items:center;gap:7px;height:25px;padding:0 9px;border-radius:13px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.8)}
.cap .cdots{width:16px;height:4px;background:radial-gradient(circle,#111 1.6px,transparent 2px) 0 0/5.33px 4px}
.cap .csep{width:1px;height:12px;background:rgba(0,0,0,.14)}
.cap .cring{width:12px;height:12px;border:2px solid #111;border-radius:50%;position:relative}
.cap .cring::after{content:"";position:absolute;inset:2px;border-radius:50%;background:#111}
.tab{position:absolute;left:0;right:0;bottom:0;height:58px;background:#fff;box-shadow:0 -1px 0 #E4E6E9;display:flex;justify-content:space-around;align-items:center;font-size:10px;color:#A3A8AE;font-weight:600;padding-bottom:6px;z-index:4}
.tab div{display:flex;flex-direction:column;align-items:center;gap:2px}
.tab .on{color:#000}
.tab .ic{width:21px;height:21px}
.cta{position:absolute;left:0;right:0;bottom:0;background:#fff;box-shadow:0 -1px 0 #E4E6E9;padding:10px 14px 18px;display:flex;gap:10px;align-items:center;z-index:4}
.cta .go{flex:1;height:50px;font-size:16px;letter-spacing:3px;padding-left:3px}
.cta .b2{height:50px;border-radius:14px}
.cta .b3{padding:0 6px}

/* ---------- 主角：标牌 ---------- */
.sign{margin:8px 14px 0;background:var(--o);border-radius:18px;padding:18px}
.sign .top2{display:flex;justify-content:space-between;font-size:12px;font-weight:600;height:16px;line-height:16px}
.sign .hl{display:flex;align-items:baseline;gap:6px;margin-top:4px}
.sign .hl .num{font-size:92px;line-height:.88}
.sign .hl b{font-size:26px;font-weight:900}
.sign .exc{margin-top:14px;background:#000;color:#fff;border-radius:12px;height:46px;display:flex;align-items:center;padding:0 15px;gap:10px;font-size:13px}
.sign .exc span{color:var(--o);font-weight:700}
.sign .exc b{font-size:16px;font-weight:700}
.sign .exc i{margin-left:auto;font-style:normal;font-size:12px;color:#A3A8AE}
.sign .l0{display:flex;align-items:baseline;justify-content:space-between;height:30px}
.sign .l0 b{font-size:22px;font-weight:900}
.sign .l0 span{font-size:12px;font-weight:600}
.sign .clock{font-size:104px;line-height:.88;margin-top:4px;letter-spacing:-1px}
.sign .go{margin-top:14px}
.sign .where{font-size:12px;font-weight:600;margin-top:12px;text-align:center}
.sign .big{font-size:24px;font-weight:900;line-height:1.35}
.sign .sub{font-size:12.5px;font-weight:600;margin-top:4px;line-height:1.6}
/* 小标牌：内页顶上一句话 */
.cs{margin:8px 14px 0;background:var(--o);border-radius:16px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:68px}
.cs b{font-size:19px;font-weight:900;line-height:1.3;display:block}
.cs span{font-size:12px;font-weight:600;display:block;margin-top:2px}
.cs .num{font-size:44px;line-height:.9;flex-shrink:0}
.cs .num small{font-size:18px;opacity:.55}

/* ---------- 按钮 ---------- */
.go{height:56px;border-radius:14px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;letter-spacing:10px;padding-left:10px}
.go.off{background:#C9CDD1}
.go.m{margin:14px 14px 0;height:50px;font-size:16px;letter-spacing:3px;padding-left:3px}
.b2{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 16px;border-radius:12px;border:1.5px solid #000;font-size:13.5px;font-weight:600;background:#fff;white-space:nowrap}
.b2.red{color:var(--r);border-color:var(--r)}
.b2.w{display:flex;margin:10px 14px 0;height:46px}
.b3{font-size:13px;font-weight:500;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
.b3.red{color:var(--r)}
.b3.c{display:block;text-align:center;margin-top:14px}
.bar{margin:10px 14px 0;height:50px;border-radius:12px;background:#000;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:14.5px;font-weight:700}
.bar span{font-size:11.5px;font-weight:400;color:#A3A8AE}

/* ---------- 次要内容：灰底白条 ---------- */
.h{font-size:12px;font-weight:600;color:var(--m);margin:20px 18px 8px;line-height:17px;display:flex;justify-content:space-between}
.h a{color:#000;font-weight:500;text-decoration:underline;text-underline-offset:3px}
.sheet{background:#fff;margin:0 14px;border-radius:14px;overflow:hidden}
.sheet.gap{margin-top:12px}
.row{display:flex;justify-content:space-between;align-items:center;min-height:48px;padding:0 15px;border-bottom:1px solid var(--hair);font-size:13.5px;font-weight:600;position:relative;gap:10px}
.row:last-child{border-bottom:0}
.row .l{display:flex;align-items:center;min-width:0}
.row .l>div{min-width:0}
.row small{font-size:11.5px;color:var(--m);font-weight:400;display:block;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row.p{min-height:58px}
.row .r{display:flex;align-items:center;gap:8px;font-weight:500;color:#000;font-size:13px;flex-shrink:0;white-space:nowrap}
.row .r.mu{color:var(--m)}
.row .chev{color:var(--ph);font-size:15px}
.row.haz{min-height:52px;padding-left:24px}
.row.haz::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;background:repeating-linear-gradient(-45deg,#000 0 5px,var(--y) 5px 10px)}
.av{width:34px;height:34px;border-radius:50%;background:var(--c);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;margin-right:10px;flex-shrink:0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);padding:6px 0}
.grid.c4{grid-template-columns:repeat(4,1fr)}
.grid div{height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:500}
.nums{display:flex;height:60px;align-items:center}
.nums div{flex:1;padding-left:15px}
.nums b{display:block;font-size:24px;line-height:1.1}
.nums b small{font-size:11px;font-family:-apple-system,"PingFang SC",sans-serif;font-weight:500;margin-left:1px}
.nums span{font-size:11px;color:var(--m)}
.nums.wrap4{flex-wrap:wrap;height:auto;padding:6px 0}
.nums.wrap4 div{flex:0 0 33.33%;padding:8px 0 8px 15px}
.s{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-style:normal;white-space:nowrap;font-weight:500}
.s::before{content:"";width:10px;height:10px;flex-shrink:0}
.s.ok{color:var(--m)}.s.ok::before{background:var(--g);border-radius:2px}
.s.warn{color:#6B5000;font-weight:600}.s.warn::before{width:12px;height:11px;background:var(--y);clip-path:polygon(50% 0,100% 100%,0 100%)}
.s.bad{color:var(--r);font-weight:700}.s.bad::before{background:var(--r);border-radius:50%}
.s.off{color:var(--ph)}.s.off::before{display:none}
.nt{font-size:12px;color:var(--m);line-height:1.7;margin:8px 18px 0}
.er{margin:10px 14px 0;background:#fff;border-left:6px solid var(--r);border-radius:0 12px 12px 0;padding:10px 13px;font-size:13px;font-weight:600}
.er span{display:block;font-weight:400;color:#5A6067;font-size:12px;margin-top:2px}

/* ---------- 筛选 ---------- */
.seg{display:flex;margin:10px 14px 0;background:#E1E4E7;border-radius:11px;padding:3px}
.seg span{flex:1;height:32px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#5A6067;border-radius:8px;white-space:nowrap}
.seg .on{background:#fff;color:#000}
.dsw{display:flex;align-items:center;justify-content:space-between;margin:10px 14px 0;background:#fff;border-radius:12px;height:44px;padding:0 4px}
.dsw b{font-size:14px;font-weight:700}
.dsw i{width:38px;text-align:center;font-style:normal;color:var(--m);font-size:17px}
.srch{margin:10px 14px 0;height:40px;border-radius:12px;background:#fff;display:flex;align-items:center;padding:0 13px;font-size:13px;color:var(--ph);gap:8px}
.srch .ic{width:17px;height:17px;color:var(--m)}

/* ---------- 表单 ---------- */
.f{display:flex;justify-content:space-between;align-items:center;min-height:48px;padding:0 15px;border-bottom:1px solid var(--hair);font-size:13.5px;gap:12px}
.f:last-child{border-bottom:0}
.f .l{font-weight:600;flex-shrink:0}
.f .l i{color:var(--r);font-style:normal;margin-left:3px}
.f .v{text-align:right;display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden}
.f .v.ph{color:var(--ph)}
.f .chev{color:var(--ph);font-size:15px}
.f.col{flex-direction:column;align-items:stretch;padding:12px 15px;gap:8px}
.f.col .box{min-height:62px;border-radius:10px;background:#F4F5F6;padding:9px 12px;font-size:13px;line-height:1.6}
.f.col .box.ph{color:var(--ph)}
.f.bad{box-shadow:inset 3px 0 0 var(--r)}
.ferr{font-size:11.5px;color:var(--r);padding:6px 18px 0;font-weight:500}
.sw{width:42px;height:25px;border-radius:13px;background:#D9DCDF;position:relative;flex-shrink:0}
.sw::after{content:"";position:absolute;left:2px;top:2px;width:21px;height:21px;border-radius:50%;background:#fff}
.sw.on{background:#000}.sw.on::after{left:19px}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chips span{font-size:12px;font-weight:500;padding:5px 11px;border-radius:8px;background:var(--c)}
.chips span.on{background:#000;color:#fff}
.chips.pad{margin:10px 14px 0}
.chips.pad span{background:#fff}
.chips.pad span.on{background:#000}
.wk{display:flex;gap:6px}
.wk span{width:30px;height:30px;border-radius:8px;background:var(--c);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:600;color:var(--m)}
.wk span.on{background:#000;color:#fff}

/* ---------- 流程 ---------- */
.stp{margin:10px 18px 0}
.stp div{display:flex;gap:5px}
.stp div i{flex:1;height:4px;border-radius:2px;background:#D5D8DB}
.stp div i.on{background:#000}
.stp p{font-size:12px;color:var(--m);margin-top:8px;font-weight:500}
.stp p b{color:#000;font-weight:700}
.say{padding:14px 18px 0}
.say b{display:block;font-size:24px;font-weight:900;line-height:1.35}
.say span{display:block;font-size:12.5px;color:var(--m);line-height:1.7;margin-top:2px}
.pic{margin:12px 14px 0;border-radius:14px;background:#D9DCDF;height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#5A6067;font-size:12.5px;gap:8px;font-weight:500}
.pic .ic{width:30px;height:30px}
.pic.face{height:230px;background:#1B1E22;color:#C9CDD1;position:relative}
.pic.face::before{content:"";width:132px;height:166px;border-radius:50%;border:2px dashed #fff;opacity:.8}
.pic.sm{height:92px;margin:0;flex:1}
.pics{display:flex;gap:8px;margin:12px 14px 0}
.map{margin:12px 14px 0;border-radius:14px;height:160px;position:relative;overflow:hidden;background:
  linear-gradient(#DCDFE2 1px,transparent 1px) 0 0/100% 32px,
  linear-gradient(90deg,#DCDFE2 1px,transparent 1px) 0 0/40px 100%,#E7E9EB}
.map .zone{position:absolute;left:50%;top:50%;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;border:2px solid var(--o);background:rgba(255,106,19,.16)}
.map .me{position:absolute;width:12px;height:12px;border-radius:50%;background:#000;border:2px solid #fff;box-shadow:0 0 0 1px #000}
.map .lb{position:absolute;left:10px;bottom:9px;font-size:11px;font-weight:600;background:#fff;padding:2px 8px;border-radius:6px}
.card{background:#fff;margin:0 14px;border-radius:14px;padding:14px 15px;position:relative;font-size:13px;line-height:1.6}
.card.gap{margin-top:10px}
.card .tt{font-size:16px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
.card .me2{color:var(--m);font-size:12px}
.card .act{display:flex;gap:10px;align-items:center;margin-top:13px}
.card .act .go{flex:1;height:46px;font-size:15px;letter-spacing:3px;padding-left:3px}
.stamp{width:66px;height:66px;border-radius:50%;border:2.5px solid var(--r);color:var(--r);display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;font-size:12px;line-height:1.15;transform:rotate(-12deg);box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3.5px var(--r);flex-shrink:0}
.stamp .num{font-size:14px}
.stamp.big{width:118px;height:118px;font-size:20px;border-width:4px;box-shadow:inset 0 0 0 3px var(--c),inset 0 0 0 5.5px var(--r);margin:26px auto 0}
.stamp.big .num{font-size:25px}
.card .stamp{position:absolute;right:12px;top:10px}
.card.stamped{padding-right:92px;min-height:88px}
.links{display:flex;justify-content:center;gap:26px;margin-top:16px}
.center{text-align:center}
.empty{text-align:center;padding:46px 30px 0}
.empty b{font-size:16px;font-weight:800;display:block}
.empty span{font-size:12.5px;color:var(--m);display:block;margin-top:6px;line-height:1.7}
.empty .b2{margin-top:16px}
.logo{width:64px;height:64px;border-radius:18px;background:var(--o);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;margin:34px 0 0 18px}
.ent{background:#fff;margin:10px 14px 0;border-radius:14px;padding:15px;display:flex;justify-content:space-between;align-items:center}
.ent b{font-size:16px;font-weight:800;display:block}
.ent span{font-size:12px;color:var(--m);display:block;margin-top:2px}
.ent.on{background:#000;color:#fff}.ent.on span{color:#A3A8AE}
.ent .chev{color:var(--ph);font-size:18px}
.badge{margin:8px 14px 0;background:#fff;border-radius:18px;overflow:hidden}
.bband{background:var(--o);height:40px;position:relative}
.bband i{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:40px;height:8px;border-radius:4px;background:var(--c)}
.bbody{padding:16px}
.idrow{display:flex;gap:13px;align-items:center}
.photo{width:56px;height:56px;border-radius:12px;background:var(--c);display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:900;flex-shrink:0}
.idrow b{font-size:22px;font-weight:900;display:block;line-height:1.2}
.idrow small{display:block;font-size:11.5px;color:var(--m);margin-top:2px}
.lvl{display:flex;align-items:center;gap:12px;padding:12px 15px;border-bottom:1px solid var(--hair)}
.lvl:last-child{border:0}
.lvl .n{width:34px;height:34px;border-radius:9px;background:var(--c);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.lvl.on .n{background:var(--o)}
.lvl b{font-size:14px;font-weight:700;display:block}
.lvl span{font-size:11.5px;color:var(--m);display:block;line-height:1.5}
.tl{padding:4px 15px 4px 34px;position:relative}
.tl::before{content:"";position:absolute;left:19px;top:14px;bottom:14px;width:2px;background:#E1E4E7}
.tl div{position:relative;padding:9px 0;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
.tl div::before{content:"";position:absolute;left:-20px;top:50%;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:#fff;border:2px solid #C9CDD1}
.tl div.done::before{background:#000;border-color:#000}
.tl div.now::before{background:var(--o);border-color:#000}
.tl small{font-size:11.5px;color:var(--m);font-weight:400;display:block}
.pbar{height:6px;border-radius:3px;background:#E4E6E9;overflow:hidden;margin-top:6px}
.pbar i{display:block;height:100%;background:#000}
.ri{display:flex;margin-right:11px;color:#000}
.ri .ic{width:20px;height:20px}
.ck{width:20px;height:20px;border-radius:6px;border:1.5px solid #C9CDD1;display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:#fff;flex-shrink:0}
.ck.on{background:#000;border-color:#000}
.ck.rd{border-radius:50%}
.code{font-size:46px;line-height:1;letter-spacing:6px;margin:6px 0 4px}
.pic.add{background:#fff;border:1.5px dashed #C9CDD1;color:var(--m)}
.sheet.first{margin-top:8px}
.val{font-size:17px}
.div{height:1px;background:var(--hair);margin:12px 0}
.kv{display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0}
.kv span{color:var(--m)}
"""

ICONS = r"""
<svg width="0" height="0" style="position:absolute">
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M3.5 11.5 12 4l8.5 7.5M5.5 10v9.5h13V10"/></symbol>
  <symbol id="i-grid" viewBox="0 0 24 24"><path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.2-3.6 4-5 7.5-5s6.3 1.400 7.500 5"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><path d="M9 11.500a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7zM2.500 19.500c1-3.200 3.400-4.500 6.500-4.500s5.500 1.300 6.500 4.500M16 4.800a3.500 3.500 0 0 1 0 6.400M18 15.300c1.800.600 3 2 3.500 4.200"/></symbol>
  <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6zM9 12l2.2 2.2 3.8-4.2"/></symbol>
  <symbol id="i-doc" viewBox="0 0 24 24"><path d="M6.5 3.5h8l4 4v13h-12zM14.5 3.5v4h4M9.5 12.5h5M9.5 16h5"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><path d="M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 4.5h14v15H5zM8.5 12l2.5 2.5 4.5-5"/></symbol>
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4.5 19.5h15M7.5 16v-5M12 16V6.5M16.5 16V9"/></symbol>
  <symbol id="i-task" viewBox="0 0 24 24"><path d="M9 4.5h6v3H9zM9 6H5.5v14.5h13V6H15M9 13.5l2 2 4-4.5"/></symbol>
  <symbol id="i-bld" viewBox="0 0 24 24"><path d="M5 20.5V4.5h9v16M14 9.5h5v11M3.5 20.5h17M8 8h3M8 11.5h3M8 15h3"/></symbol>
  <symbol id="i-cam" viewBox="0 0 24 24"><path d="M4 8h3l1.500-2.500h7L17 8h3v11H4zM12 16.500a3.200 3.200 0 1 0 0-6.400 3.200 3.200 0 0 0 0 6.400z"/></symbol>
  <symbol id="i-face" viewBox="0 0 24 24"><path d="M8 3.500H5.500a2 2 0 0 0-2 2V8M16 3.500h2.500a2 2 0 0 1 2 2V8M8 20.500H5.500a2 2 0 0 1-2-2V16M16 20.500h2.500a2 2 0 0 0 2-2V16M9 10v1.500M15 10v1.500M9.500 15c1.600 1.200 3.400 1.200 5 0"/></symbol>
  <symbol id="i-cal" viewBox="0 0 24 24"><path d="M4 6.5h16v13H4zM4 10.5h16M8 4v4M16 4v4"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s6.500-5.600 6.500-11a6.500 6.500 0 1 0-13 0c0 5.400 6.500 11 6.500 11zM12 12.200a2.200 2.200 0 1 0 0-4.400 2.200 2.200 0 0 0 0 4.400z"/></symbol>
  <symbol id="i-key" viewBox="0 0 24 24"><path d="M14.500 9.500a4 4 0 1 0-3.700 4L4 20.500h3.500v-2.500H10v-2.500l2.300-2.300a4 4 0 0 0 2.200-3.700z"/></symbol>
  <symbol id="i-gear" viewBox="0 0 24 24"><path d="M12 15.200a3.200 3.200 0 1 0 0-6.400 3.200 3.200 0 0 0 0 6.400zM4.500 13.500v-3l2-.600.800-1.900-1-1.800 2.100-2.100 1.800 1 1.900-.800.600-2h3l.600 2 1.900.800 1.800-1 2.100 2.100-1 1.800.800 1.900 2 .600v3l-2 .600-.800 1.900 1 1.800-2.100 2.100-1.800-1-1.900.800-.600 2h-3l-.600-2-1.900-.800-1.800 1-2.100-2.100 1-1.800-.800-1.900z"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><path d="M10.500 17a6.500 6.500 0 1 0 0-13 6.500 6.500 0 0 0 0 13zM15.500 15.500 20 20"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 4 2.400 5 5.400.700-4 3.800 1 5.400L12 16.300 7.200 18.900l1-5.400-4-3.800 5.400-.700z"/></symbol>
  <symbol id="i-coin" viewBox="0 0 24 24"><path d="M12 20.500a8.500 8.500 0 1 0 0-17 8.500 8.500 0 0 0 0 17zM9 9l3 3.500L15 9M12 12.500V17M9.500 13.500h5"/></symbol>
</svg>
"""

_BK = '<svg class="bk" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>'
_CAP = '<span class="cap"><i class="cdots"></i><i class="csep"></i><i class="cring"></i></span>'


def ic(name):
    return f'<svg class="ic"><use href="#i-{name}"/></svg>'


def num(text):
    return f'<span class="num">{text}</span>'


def nav(title, back=True, switch=False):
    left = (_BK if back else "") + f"<span>{title}</span>" + ("<em>▼</em>" if switch else "")
    return f'<div class="nav"><div class="t">{left}</div>{_CAP}</div>'


TABS = {
    "worker": [("home", "首页"), ("bld", "项目"), ("user", "我的")],
    "manager": [("home", "首页"), ("grid", "工作台"), ("user", "我的")],
}


def tab(role, active):
    items = "".join(
        f'<div class="{"on" if label == active else ""}">{ic(icon)}{label}</div>'
        for icon, label in TABS[role]
    )
    return f'<div class="tab">{items}</div>'


def cta(primary=None, *others, off=False):
    inner = "".join(others)
    if primary:
        inner += f'<div class="go{" off" if off else ""}">{primary}</div>'
    return f'<div class="cta">{inner}</div>'


def b2(text, red=False, wide=False):
    return f'<span class="b2{" red" if red else ""}{" w" if wide else ""}">{text}</span>'


def b3(text, red=False, center=False):
    return f'<span class="b3{" red" if red else ""}{" c" if center else ""}">{text}</span>'


def go(text, margin=True, off=False):
    return f'<div class="go{" m" if margin else ""}{" off" if off else ""}">{text}</div>'


def bar(text, sub=""):
    return f'<div class="bar">{text}<span>{sub}</span></div>'


def h(text, link=""):
    return f'<div class="h"><span>{text}</span>{f"<a>{link}</a>" if link else ""}</div>'


def st(kind, text):
    return f'<em class="s {kind}">{text}</em>'


def row(label, right="", sub="", chev=False, haz=False, avatar="", mute=False, icon=""):
    cls = "row" + (" haz" if haz else "") + (" p" if sub or avatar else "")
    av = f'<span class="av">{avatar}</span>' if avatar else ""
    if icon:
        av = f'<span class="ri">{ic(icon)}</span>'
    left = f'<div class="l">{av}<div>{label}{f"<small>{sub}</small>" if sub else ""}</div></div>'
    r = right + ('<span class="chev">›</span>' if chev else "")
    return f'<div class="{cls}">{left}<div class="r{" mu" if mute else ""}">{r}</div></div>'


def sheet(*rows, gap=False, cls="", first=False):
    return f'<div class="sheet{" gap" if gap else ""}{" first" if first else ""}{" " + cls if cls else ""}">{"".join(rows)}</div>'


def grid(items, cols=3, gap=False):
    cells = "".join(f"<div>{ic(icon)}{label}</div>" for icon, label in items)
    return f'<div class="sheet grid{" c4" if cols == 4 else ""}{" gap" if gap else ""}">{cells}</div>'


def nums(items, wrap=False, gap=False):
    cells = "".join(
        f'<div><b class="num"{f" style=color:{c}" if c else ""}>{v}{f"<small>{u}</small>" if u else ""}</b><span>{label}</span></div>'
        for v, u, label, c in [(i + (None,) * 4)[:4] for i in items]
    )
    return f'<div class="sheet nums{" wrap4" if wrap else ""}{" gap" if gap else ""}">{cells}</div>'


def cs(head, sub="", number=""):
    n = f'<div class="num">{number}</div>' if number else ""
    return f'<div class="cs"><div><b>{head}</b>{f"<span>{sub}</span>" if sub else ""}</div>{n}</div>'


def seg(options, active):
    return '<div class="seg">' + "".join(
        f'<span class="{"on" if o == active else ""}">{o}</span>' for o in options
    ) + "</div>"


def dsw(text):
    return f'<div class="dsw"><i>‹</i><b>{text}</b><i>›</i></div>'


def search(placeholder):
    return f'<div class="srch">{ic("search")}{placeholder}</div>'


def f(label, value="", ph="", chev=False, req=False, bad=False, right=""):
    star = "<i>*</i>" if req else ""
    if right:
        v = f'<div class="v">{right}</div>'
    elif value:
        v = f'<div class="v">{value}{"<span class=chev>›</span>" if chev else ""}</div>'
    else:
        v = f'<div class="v ph">{ph}{"<span class=chev>›</span>" if chev else ""}</div>'
    return f'<div class="f{" bad" if bad else ""}"><span class="l">{label}{star}</span>{v}</div>'


def area(label, value="", ph="", req=False, extra=""):
    star = "<i>*</i>" if req else ""
    box = f'<div class="box">{value}</div>' if value else f'<div class="box ph">{ph}</div>'
    return f'<div class="f col"><span class="l">{label}{star}</span>{box}{extra}</div>'


def ferr(text):
    return f'<div class="ferr">{text}</div>'


def sw(on=False):
    return f'<span class="sw{" on" if on else ""}"></span>'


def chips(items, active=None, pad=False):
    return f'<div class="chips{" pad" if pad else ""}">' + "".join(
        f'<span class="{"on" if i == active else ""}">{i}</span>' for i in items
    ) + "</div>"


def weekdays(on):
    return '<div class="wk">' + "".join(
        f'<span class="{"on" if d in on else ""}">{d}</span>' for d in "一二三四五六日"
    ) + "</div>"


def steps(current, total, label):
    bars = "".join(f'<i class="{"on" if i < current else ""}"></i>' for i in range(total))
    return f'<div class="stp"><div>{bars}</div><p>第 {current} 步，共 {total} 步：<b>{label}</b></p></div>'


def say(head, sub=""):
    return f'<div class="say"><b>{head}</b>{f"<span>{sub}</span>" if sub else ""}</div>'


def pic(text, icon="cam", face=False, small=False):
    cls = "pic" + (" face" if face else "") + (" sm" if small else "")
    inner = "" if face else ic(icon)
    return f'<div class="{cls}">{inner}<span>{text}</span></div>'


def mapbox(label, me=(50, 50), zone=True, height=160):
    z = '<div class="zone"></div>' if zone else ""
    return f'<div class="map" style="height:{height}px">{z}<div class="me" style="left:{me[0]}%;top:{me[1]}%"></div><span class="lb">{label}</span></div>'


def card(*parts, gap=False, stamped=False):
    return f'<div class="card{" gap" if gap else ""}{" stamped" if stamped else ""}">{"".join(parts)}</div>'


def links(*items):
    return '<div class="links">' + "".join(items) + "</div>"


def stamp(text, sub="", big=False, rot=-12):
    return f'<div class="stamp{" big" if big else ""}" style="transform:rotate({rot}deg)">{text}{f"<span class=num>{sub}</span>" if sub else ""}</div>'


def nt(text):
    return f'<div class="nt">{text}</div>'


def er(head, sub=""):
    return f'<div class="er">{head}{f"<span>{sub}</span>" if sub else ""}</div>'


def empty(head, sub="", action=""):
    return f'<div class="empty"><b>{head}</b>{f"<span>{sub}</span>" if sub else ""}{b2(action) if action else ""}</div>'


def phone(name, route, why, *parts, time="7:46"):
    body = "".join(parts)
    return (
        f'<figure class="ph"><figcaption>{name}<span>{route}</span></figcaption>'
        f'<p class="why">{why}</p>'
        f'<div class="phone"><i class="isl"></i><div class="sb"><span>{time}</span><span>5G ▰</span></div>{body}</div></figure>'
    )


def ck(on=False, round_=False):
    return f'<span class="ck{" on" if on else ""}{" rd" if round_ else ""}">{"✓" if on else ""}</span>'


def code(text):
    return f'<div class="num code">{text}</div>'


def pics(*items):
    return '<div class="pics">' + "".join(items) + "</div>"


def addpic(text="添加"):
    return f'<div class="pic sm add">{ic("plus")}<span>{text}</span></div>'


def kv(label, value):
    return f'<div class="kv"><span>{label}</span><b>{value}</b></div>'


def tl(*items):
    """items: (状态 done/now/'' , 标题, 副行, 右侧)"""
    rows = "".join(
        f'<div class="{state}"><span>{title}{f"<small>{sub}</small>" if sub else ""}</span>{right}</div>'
        for state, title, sub, right in items
    )
    return f'<div class="tl">{rows}</div>'
