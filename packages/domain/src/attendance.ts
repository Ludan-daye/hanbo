export type AttendancePointCode =
  | "SEGMENT_1_START"
  | "SEGMENT_1_END"
  | "SEGMENT_2_START"
  | "SEGMENT_2_END";

export type AttendanceRecordSource = "DEVICE" | "MAKEUP";

export type AttendanceRecordInput = {
  readonly id: string;
  readonly pointCode: AttendancePointCode;
  readonly occurredAt: Date;
  readonly isValid: boolean;
  readonly source: AttendanceRecordSource;
};

export type ShiftRule = {
  readonly segment1StartAt: Date;
  readonly segment1EndAt: Date;
  readonly segment2StartAt: Date;
  readonly segment2EndAt: Date;
  readonly lateGraceMinutes: number;
  readonly earlyLeaveGraceMinutes: number;
};

export type SelectedAttendanceRecords = {
  readonly SEGMENT_1_START: AttendanceRecordInput | undefined;
  readonly SEGMENT_1_END: AttendanceRecordInput | undefined;
  readonly SEGMENT_2_START: AttendanceRecordInput | undefined;
  readonly SEGMENT_2_END: AttendanceRecordInput | undefined;
};

export type DailyAttendanceSummary = {
  readonly selectedRecords: SelectedAttendanceRecords;
  readonly workedMinutes: number;
  readonly isLate: boolean;
  readonly isEarlyLeave: boolean;
  readonly isMissingPunch: boolean;
  readonly isAbsent: boolean;
};

type ReversedAttendanceSegmentErrorPayload = {
  readonly message: string;
  readonly startPointCode: AttendancePointCode;
  readonly endPointCode: AttendancePointCode;
  readonly startRecordId: string;
  readonly endRecordId: string;
  readonly startOccurredAt: string;
  readonly endOccurredAt: string;
};

const startPointCodes: readonly AttendancePointCode[] = ["SEGMENT_1_START", "SEGMENT_2_START"];

const endPointCodes: readonly AttendancePointCode[] = ["SEGMENT_1_END", "SEGMENT_2_END"];

const allPointCodes: readonly AttendancePointCode[] = [
  "SEGMENT_1_START",
  "SEGMENT_1_END",
  "SEGMENT_2_START",
  "SEGMENT_2_END"
];

const minutesBetween = (startAt: Date, endAt: Date): number =>
  Math.trunc((endAt.getTime() - startAt.getTime()) / 60_000);

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

const cloneAttendanceRecord = (record: AttendanceRecordInput): AttendanceRecordInput => ({
  id: record.id,
  pointCode: record.pointCode,
  occurredAt: new Date(record.occurredAt.getTime()),
  isValid: record.isValid,
  source: record.source
});

const selectRecord = (
  records: readonly AttendanceRecordInput[],
  pointCode: AttendancePointCode
): AttendanceRecordInput | undefined => {
  const pointRecords: AttendanceRecordInput[] = records.filter(
    (record: AttendanceRecordInput): boolean => record.isValid && record.pointCode === pointCode
  );

  if (pointRecords.length === 0) {
    return undefined;
  }

  return pointRecords.reduce(
    (selectedRecord: AttendanceRecordInput, record: AttendanceRecordInput): AttendanceRecordInput => {
      if (startPointCodes.includes(pointCode)) {
        return record.occurredAt.getTime() < selectedRecord.occurredAt.getTime() ? record : selectedRecord;
      }

      if (endPointCodes.includes(pointCode)) {
        return record.occurredAt.getTime() > selectedRecord.occurredAt.getTime() ? record : selectedRecord;
      }

      throw new Error(`Unsupported attendance point code: ${pointCode}`);
    }
  );
};

const createReversedAttendanceSegmentError = (
  startPointCode: AttendancePointCode,
  endPointCode: AttendancePointCode,
  startRecord: AttendanceRecordInput,
  endRecord: AttendanceRecordInput
): Error => {
  const payload: ReversedAttendanceSegmentErrorPayload = {
    message: "Attendance segment start occurred after segment end",
    startPointCode,
    endPointCode,
    startRecordId: startRecord.id,
    endRecordId: endRecord.id,
    startOccurredAt: startRecord.occurredAt.toISOString(),
    endOccurredAt: endRecord.occurredAt.toISOString()
  };

  return new Error(JSON.stringify(payload));
};

const validateSegmentOrder = (
  startPointCode: AttendancePointCode,
  endPointCode: AttendancePointCode,
  startRecord: AttendanceRecordInput | undefined,
  endRecord: AttendanceRecordInput | undefined
): void => {
  if (startRecord === undefined || endRecord === undefined) {
    return;
  }

  if (startRecord.occurredAt.getTime() > endRecord.occurredAt.getTime()) {
    throw createReversedAttendanceSegmentError(startPointCode, endPointCode, startRecord, endRecord);
  }
};

const calculateSegmentMinutes = (
  startRecord: AttendanceRecordInput | undefined,
  endRecord: AttendanceRecordInput | undefined
): number => {
  if (startRecord === undefined || endRecord === undefined) {
    return 0;
  }

  return minutesBetween(startRecord.occurredAt, endRecord.occurredAt);
};

export const summarizeDailyAttendance = (
  shiftRule: ShiftRule,
  records: readonly AttendanceRecordInput[]
): DailyAttendanceSummary => {
  const selectedSegment1Start: AttendanceRecordInput | undefined = selectRecord(records, "SEGMENT_1_START");
  const selectedSegment1End: AttendanceRecordInput | undefined = selectRecord(records, "SEGMENT_1_END");
  const selectedSegment2Start: AttendanceRecordInput | undefined = selectRecord(records, "SEGMENT_2_START");
  const selectedSegment2End: AttendanceRecordInput | undefined = selectRecord(records, "SEGMENT_2_END");

  validateSegmentOrder("SEGMENT_1_START", "SEGMENT_1_END", selectedSegment1Start, selectedSegment1End);
  validateSegmentOrder("SEGMENT_2_START", "SEGMENT_2_END", selectedSegment2Start, selectedSegment2End);

  const selectedRecords: SelectedAttendanceRecords = {
    SEGMENT_1_START: selectedSegment1Start === undefined ? undefined : cloneAttendanceRecord(selectedSegment1Start),
    SEGMENT_1_END: selectedSegment1End === undefined ? undefined : cloneAttendanceRecord(selectedSegment1End),
    SEGMENT_2_START: selectedSegment2Start === undefined ? undefined : cloneAttendanceRecord(selectedSegment2Start),
    SEGMENT_2_END: selectedSegment2End === undefined ? undefined : cloneAttendanceRecord(selectedSegment2End)
  };

  const selectedRecordValues: readonly (AttendanceRecordInput | undefined)[] = allPointCodes.map(
    (pointCode: AttendancePointCode): AttendanceRecordInput | undefined => selectedRecords[pointCode]
  );

  const workedMinutes: number =
    calculateSegmentMinutes(selectedRecords.SEGMENT_1_START, selectedRecords.SEGMENT_1_END) +
    calculateSegmentMinutes(selectedRecords.SEGMENT_2_START, selectedRecords.SEGMENT_2_END);

  const segment1StartLimit: Date = addMinutes(shiftRule.segment1StartAt, shiftRule.lateGraceMinutes);
  const segment2EndLimit: Date = addMinutes(shiftRule.segment2EndAt, -shiftRule.earlyLeaveGraceMinutes);

  return {
    selectedRecords,
    workedMinutes,
    isLate:
      selectedRecords.SEGMENT_1_START !== undefined &&
      selectedRecords.SEGMENT_1_START.occurredAt.getTime() > segment1StartLimit.getTime(),
    isEarlyLeave:
      selectedRecords.SEGMENT_2_END !== undefined &&
      selectedRecords.SEGMENT_2_END.occurredAt.getTime() < segment2EndLimit.getTime(),
    isMissingPunch: selectedRecordValues.some(
      (selectedRecord: AttendanceRecordInput | undefined): boolean => selectedRecord === undefined
    ),
    isAbsent: selectedRecordValues.every(
      (selectedRecord: AttendanceRecordInput | undefined): boolean => selectedRecord === undefined
    )
  };
};
