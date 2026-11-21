/**
 * A worker's 用工登记 state as the company views show it. NOT_SUBMITTED (还没填) is kept
 * apart from PENDING (填了、待核实) so lists and counts do not ask an admin to verify
 * something nobody has filled in. A legacy VERIFIED without a submission stays VERIFIED.
 */
export type RegistrationState = "NEEDS_UPDATE" | "NOT_SUBMITTED" | "PENDING" | "VERIFIED";

export const registrationState = (
  realNameStatus: string,
  registrationCompletedAt: Date | null,
): RegistrationState => {
  if (realNameStatus === "VERIFIED") return "VERIFIED";
  if (registrationCompletedAt === null) return "NOT_SUBMITTED";
  return realNameStatus === "NEEDS_UPDATE" ? "NEEDS_UPDATE" : "PENDING";
};
