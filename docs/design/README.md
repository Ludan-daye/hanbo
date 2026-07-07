# 建筑工地人员管理系统 · 全系统设计文档

面向新加入工程师的完整设计文档集。全部内容以 `codex/foundation` 分支的真实代码为准逐文件核对生成;
尚未实现的能力在文中显式标注「规划中」,已有评审通过的实施计划但代码未落地的标注「进行中」。

| 章 | 文档 | 内容 |
| --- | --- | --- |
| 01 | [总体架构](01-overview.md) | 系统定位、五角色体系、monorepo 结构、运行时拓扑、后端模块地图、横切约定、环境变量总表、测试策略、本地优先与移植缝原则 |
| 02 | [认证与授权](02-auth-authorization.md) | 微信登录(dev 桩)、JWT 会话模型(sid/sub/sv)、AccessTokenGuard 全部 401 分支、绑定邀请机制、角色/范围/权限模型与 scopeIncludesTarget 包含规则 |
| 03 | [组织与人员管理](03-organization-people.md) | Company→Project→Team 层级、工人/管理者双轨档案、成员关系与唯一约束、management 模块 REST 全表、邀请-绑定业务闭环 |
| 04 | [考勤域](04-attendance-domain.md) | 排班模型(两段制班次/workdayMask)、打卡提交九步管线(围栏/人脸/异常判定)、summarizeDailyAttendance 结算规则、AttendanceResult 重算、补卡域、错误码表 |
| 05 | [报表与查询](05-reports-queries.md) | 按角色分组的 20 个查询端点全景表、公司级日/周/月聚合口径、AttendanceRecord 与 AttendanceResult 数据来源辨析、已知口径问题 |
| 06 | [小程序端](06-miniprogram.md) | 会话状态机与路由守卫、五角色面板 TILES 表、17 页面全表、apiClient 与服务层、UI 组件契约与设计 token、构建与 H5/真机差异 |
| 07 | [数据模型](07-data-model.md) | 22 模型/11 枚举 ER 总览、逐模型字段语义与索引理由、多态关联模式、4 个手写特殊迁移、Decimal 精度与字符串化约定、种子数据地图 |
| 08 | [部署与移植指南](08-deployment-portability.md) | 本地从零启动手册、14 个演示账号表、验证清单、移植缝(微信/人脸/存储/加密)全表、环境变量总表、生产部署建议与未决事项 |

## 配套文档

- 切片级规格:`docs/superpowers/specs/`(按日期,记录每个功能切片的设计决策)
- 实施计划:`docs/superpowers/plans/`(可交给执行者逐任务落地的代码级计划)
- 进行中切片:工人打卡流程(`specs/2026-07-07-worker-punch-flow-design.md` + `plans/2026-07-07-worker-punch-flow.md`)

## 文档状态

- 生成日期:2026-07-07;基准:branch `codex/foundation`(HEAD `b8660c0`)
- 生成方式:8 个并行审读代理逐子系统通读源码撰写,主会话汇编终审
- 更新约定:功能切片合入后,修订对应章节并更新本表
