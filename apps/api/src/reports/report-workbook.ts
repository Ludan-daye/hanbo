import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { ReportExport } from "@prisma/client";
import type { RangeAttendanceReportParticipant } from "./reports.types.js";
import type { ReportsService, ReportDay } from "./reports.service.js";

export const REPORT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const REPORT_CALCULATION_VERSION = "attendance-v3-project-evaluation";
export type MonthlySnapshot = Awaited<
  ReturnType<ReportsService["monthlySnapshot"]>
>;
type Cell = string | number | ExcelJS.CellFormulaValue;
const chinaTime = (date: Date): string =>
  new Date(date.getTime() + 8 * 3600_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
const dayFlags = (day: ReportDay): string =>
  [
    day.dayValues.isAbsent ? "缺勤" : "",
    day.dayValues.isLate ? "迟到" : "",
    day.dayValues.isEarlyLeave ? "早退" : "",
    day.dayValues.isMissingPunch ? "缺卡" : "",
    day.dayValues.abnormalRecordCount > 0
      ? `核验未通过 ${day.dayValues.abnormalRecordCount} 次`
      : "",
  ]
    .filter(Boolean)
    .join("、");
const roleLabel = (role: string): string =>
  role === "TEAM_LEADER"
    ? "班组长"
    : role === "PROJECT_ADMIN"
      ? "项目管理员"
      : role;
const sheet = (
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  name: string,
  headers: readonly string[],
  widths: readonly number[],
): ExcelJS.Worksheet => {
  const result = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  result.columns = headers.map((header, index) => ({
    header,
    width: widths[index] ?? 18,
  }));
  result.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  const heading = result.getRow(1);
  heading.height = 28;
  heading.eachCell((cell) => {
    cell.font = {
      name: "Microsoft YaHei",
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF163D63" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  heading.commit();
  return result;
};
const append = (
  worksheet: ExcelJS.Worksheet,
  values: readonly Cell[],
): ExcelJS.Row => {
  const row = worksheet.addRow([...values]);
  row.font = { name: "Microsoft YaHei", size: 10 };
  row.alignment = { vertical: "top", wrapText: true };
  return row;
};

const projectPeople = (
  participants: readonly RangeAttendanceReportParticipant[],
): readonly RangeAttendanceReportParticipant[] => {
  const groups = new Map<string, readonly RangeAttendanceReportParticipant[]>();
  for (const person of participants) {
    const key = JSON.stringify([person.projectId, person.memberId]);
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }
  return [...groups.values()]
    .map((rows) => {
      const person = rows[0]!;
      return {
        ...person,
        teamId: rows.length === 1 ? person.teamId : null,
        teamName: [
          ...new Set(rows.map((row) => row.teamName ?? "项目直属")),
        ].join("、"),
        scheduledDays: rows.reduce((sum, row) => sum + row.scheduledDays, 0),
        actualAttendedDays: rows.reduce(
          (sum, row) => sum + row.actualAttendedDays,
          0,
        ),
        workedMinutes: rows.reduce((sum, row) => sum + row.workedMinutes, 0),
        absenceCount: rows.reduce((sum, row) => sum + row.absenceCount, 0),
        missingPunchCount: rows.reduce(
          (sum, row) => sum + row.missingPunchCount,
          0,
        ),
        lateCount: rows.reduce((sum, row) => sum + row.lateCount, 0),
        earlyLeaveCount: rows.reduce(
          (sum, row) => sum + row.earlyLeaveCount,
          0,
        ),
        approvedMakeupCount: rows.reduce(
          (sum, row) => sum + row.approvedMakeupCount,
          0,
        ),
        abnormalRecordCount: rows.reduce(
          (sum, row) => sum + row.abnormalRecordCount,
          0,
        ),
      };
    })
    .sort(
      (a, b) =>
        a.projectId.localeCompare(b.projectId) ||
        a.memberId.localeCompare(b.memberId),
    );
};

/** Write explicit string cells so user-provided names and reasons cannot become formulas. */
export const createMonthlyWorkbook = async (
  job: ReportExport,
  scopeName: string,
  snapshot: MonthlySnapshot,
): Promise<Buffer> => {
  const directory = await mkdtemp(join(tmpdir(), "hanbo-report-"));
  const filename = join(directory, "report.xlsx");
  try {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename,
      useStyles: true,
      useSharedStrings: false,
    });
    workbook.creator = "瀚渤智慧工地";
    workbook.created = snapshot.cutoff;
    const summary = sheet(
      workbook,
      "月度汇总",
      [
        "项目",
        "班组",
        "姓名",
        "手机号（脱敏）",
        "工种",
        "项目岗位",
        "应勤天数",
        "实勤天数",
        "出勤率",
        "工时（分钟）",
        "工时（小时）",
        "缺勤天数",
        "缺卡天数",
        "迟到天数",
        "早退天数",
        "批准补卡次数",
        "核验未通过次数",
        "当前项目评分（0–100）",
        "评价说明",
        "评分人",
        "评分时间（北京时间）",
      ],
      [
        26, 20, 18, 20, 16, 18, 14, 14, 14, 16, 16, 14, 14, 14, 14, 18, 20, 22,
        45, 20, 24,
      ],
    );
    for (const [position, person] of projectPeople(
      snapshot.report.participants,
    ).entries()) {
      const index = position + 2;
      const row = append(summary, [
        snapshot.projectNames.get(person.projectId) ?? person.projectId,
        person.teamName ?? "项目直属",
        person.displayName ?? "姓名待完善",
        person.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
        person.workType ?? "未填写",
        roleLabel(person.projectRoleLabel),
        person.scheduledDays,
        person.actualAttendedDays,
        {
          formula: `IF(G${index}=0,"不适用",H${index}/G${index})`,
          result:
            person.scheduledDays === 0
              ? "不适用"
              : person.actualAttendedDays / person.scheduledDays,
        },
        person.workedMinutes,
        { formula: `J${index}/60`, result: person.workedMinutes / 60 },
        person.absenceCount,
        person.missingPunchCount,
        person.lateCount,
        person.earlyLeaveCount,
        person.approvedMakeupCount,
        person.abnormalRecordCount,
        person.evaluation?.score ?? "未评分",
        person.evaluation?.comment ?? "",
        person.evaluation?.reviewerName ?? "",
        person.evaluation === null
          ? ""
          : chinaTime(new Date(person.evaluation.reviewedAt)),
      ]);
      row.getCell(9).numFmt = "0.0%";
      row.getCell(11).numFmt = "0.00";
      row.commit();
    }
    summary.commit();
    const daily = sheet(
      workbook,
      "每日明细",
      [
        "项目",
        "班组",
        "姓名",
        "日期",
        "是否应勤",
        "是否实勤",
        "排班",
        "排班快照",
        "当天打卡要求",
        "打卡与补卡明细",
        "工时（分钟）",
        "工时（小时）",
        "异常",
        "批准补卡次数",
      ],
      [26, 20, 18, 14, 12, 12, 22, 18, 44, 55, 16, 16, 26, 18],
    );
    const exceptions = sheet(
      workbook,
      "补卡与异常",
      [
        "项目",
        "班组",
        "姓名",
        "日期",
        "类别",
        "打卡时点",
        "实际／申请时间",
        "状态",
        "原因",
        "审批人",
        "审批意见",
        "处理时间",
      ],
      [26, 20, 18, 14, 16, 20, 23, 16, 45, 20, 45, 23],
    );
    const statusLabels = {
      PENDING: "待审批",
      APPROVED: "已通过",
      REJECTED: "已驳回",
    } as const;
    for (const day of [...snapshot.rows].sort(
      (a, b) =>
        a.participant.projectId.localeCompare(b.participant.projectId) ||
        a.participant.memberId.localeCompare(b.participant.memberId) ||
        a.date.localeCompare(b.date),
    )) {
      const prefix = [
        snapshot.projectNames.get(day.participant.projectId) ??
          day.participant.projectId,
        day.participant.teamName ?? "项目直属",
        day.participant.displayName ?? "姓名待完善",
        day.date,
      ];
      const flags = dayFlags(day);
      const requirements = day.points
        .map((p) => `${p.label} ${p.time}（宽限 ${p.graceMins} 分钟）`)
        .join("\n");
      const evidence = [...day.evidence]
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .map(
          (record) =>
            `${day.points.find((p) => p.code === record.pointCode)?.label ?? record.pointCode} ${chinaTime(record.occurredAt).slice(11)} · ${record.source === "MAKEUP" ? "批准补卡" : record.isValid ? "核验通过" : "核验未通过"}`,
        )
        .join("\n");
      const row = append(daily, [
        ...prefix,
        day.dayValues.isScheduled ? "是" : "否",
        day.dayValues.isScheduled &&
        day.dayValues.hasResult &&
        !day.dayValues.isAbsent
          ? "是"
          : "否",
        day.planName,
        day.planVersion,
        requirements,
        evidence || "无原始记录",
        day.dayValues.workedMinutes,
        day.dayValues.workedMinutes / 60,
        flags ||
          (day.date === chinaTime(snapshot.cutoff).slice(0, 10)
            ? "当日进行中"
            : "无异常"),
        day.dayValues.approvedMakeupCount,
      ]);
      row.getCell(12).numFmt = "0.00";
      row.height = Math.max(
        32,
        Math.max(day.points.length, day.evidence.length) * 16,
      );
      row.commit();
      if (flags.length > 0)
        append(exceptions, [
          ...prefix,
          "考勤异常",
          "",
          "",
          flags,
          "按有效排班和考勤证据计算",
          "",
          "",
          "",
        ]).commit();
      for (const makeup of day.makeups)
        append(exceptions, [
          ...prefix,
          "补卡申请",
          makeup.pointLabel ??
            day.points.find((p) => p.code === makeup.pointCode)?.label ??
            makeup.pointCode,
          chinaTime(makeup.requestedOccurredAt),
          statusLabels[makeup.status],
          makeup.reason,
          makeup.approverUserId === null
            ? ""
            : (snapshot.approverNames.get(makeup.approverUserId) ??
              "未填写实名"),
          makeup.approvalReason ?? "",
          makeup.approvedAt === null ? "" : chinaTime(makeup.approvedAt),
        ]).commit();
    }
    daily.commit();
    exceptions.commit();
    const notes = sheet(workbook, "统计说明", ["项目", "说明"], [26, 110]);
    const totals = snapshot.report.totals;
    const entries: readonly (readonly Cell[])[] = [
      ["统计范围", scopeName],
      ["月份", job.month.toISOString().slice(0, 7)],
      ["导出版本", job.version],
      ["计算版本", job.calculationVersion],
      ["导出任务", job.id],
      ["申请人账号", job.requestedByUserId],
      ["数据快照时间（北京时间）", chinaTime(snapshot.cutoff)],
      [
        "统计区间",
        `${snapshot.report.startDate} 至 ${snapshot.report.endDate}`,
      ],
      ["成员数（项目内去重）", totals.participantCount],
      ["应勤人天", totals.scheduledDays],
      ["实勤人天", totals.actualAttendedDays],
      ["合计工时（分钟）", totals.workedMinutes],
      [
        "排班",
        "个人 > 班组 > 项目；每日明细记录当天要求与排班内容指纹，历史调整不改写已导出文件。",
      ],
      [
        "历史归属",
        "月度汇总按项目、人员各列一行，列出月内所属班组；每日明细保留当天班组。同人在多个项目分别统计。",
      ],
      [
        "应勤与实勤",
        "未来日期、休息日、暂停及入场前／退场后不计应勤。实勤为应勤日中存在有效考勤证据的天数，应勤为零时出勤率不适用。",
      ],
      [
        "工时",
        "北京时间，同日上下班成对累计；不自动扣午休，中途签到不增加工时。历史导入工时可能没有原始打卡明细。",
      ],
      [
        "项目评分",
        "显示导出快照时该人员在此项目的当前评价，并附评分人、评语及时间；不是该月单独评分。未评分不按零分计算。修改不影响旧版文件。",
      ],
      ["补卡", "仅已批准补卡计入工时；待审批与已驳回申请只在明细中展示。"],
      [
        "未结束月份",
        "当前月仅包含快照时间前的日期；当日尚未结束，不作为封账月报。",
      ],
      [
        "文件与隐私",
        "手机号脱敏；不包含人脸照片、证件号码、视频、位置坐标。后续补卡或资料调整需重新生成版本。",
      ],
    ];
    for (const values of entries) append(notes, values).commit();
    notes.commit();
    await workbook.commit();
    return await readFile(filename);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
