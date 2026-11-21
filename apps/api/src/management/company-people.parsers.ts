import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { ParticipantTypeValue } from "./management.types.js";
import type { OffboardRequest } from "./company-people.types.js";

const isValidDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const parseParticipantTypeParam = (value: string): ParticipantTypeValue => {
  if (value === "WORKER" || value === "MANAGER") return value;
  throw new BadRequestException({ message: "INVALID_PARTICIPANT_TYPE", participantType: value });
};

export const parseOffboard = (body: unknown): OffboardRequest => {
  const result = z
    .object({
      effectiveDate: z.string().refine(isValidDateOnly),
      mode: z.enum(["EXIT_ALL", "REVOKE_ADMIN"]).default("REVOKE_ADMIN"),
    })
    .strict()
    .safeParse(body ?? {});
  if (!result.success)
    throw new BadRequestException({ issues: result.error.issues, message: "INVALID_OFFBOARD_REQUEST" });
  return result.data;
};
