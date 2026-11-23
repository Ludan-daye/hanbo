import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { GLOBAL_SCOPE_ID } from "@construction/domain/roles.js";

// Super administrators (system admin plan phase 2, Q3): granted and revoked only by whoever
// runs the server, with system-admin.cli.ts; the app can neither appoint, revoke nor disable
// them. Only bound, active manager accounts qualify, and the last one cannot be revoked.

export type SystemAdminRow = {
  readonly grantedAt: string;
  readonly name: string;
  readonly phone: string;
  readonly status: string;
  readonly userId: string;
};

export type SystemAdminCandidate = {
  readonly isBound: boolean;
  readonly name: string;
  readonly status: string;
  readonly userId: string;
};

/** A refusal the command prints and exits non-zero on; no change was made. */
export class SystemAdminCommandError extends Error {
  constructor(
    readonly code:
      | "ACCOUNT_NOT_FOUND"
      | "ACCOUNT_PHONE_AMBIGUOUS"
      | "ACCOUNT_NOT_BOUND"
      | "ACCOUNT_DISABLED"
      | "ACCOUNT_NOT_MANAGER"
      | "NOT_SYSTEM_ADMIN"
      | "LAST_SYSTEM_ADMIN",
    message: string,
    readonly candidates: readonly SystemAdminCandidate[] = [],
  ) {
    super(message);
  }
}

const systemAdminRole = { role: { code: "SYSTEM_ADMIN" }, scopeId: GLOBAL_SCOPE_ID, scopeType: "GLOBAL" } as const;

const accountInclude = {
  managerProfile: true,
  roles: { where: systemAdminRole },
} satisfies Prisma.UserInclude;

type Account = Prisma.UserGetPayload<{ include: typeof accountInclude }>;

const displayName = (account: Account): string => account.managerProfile?.name ?? account.nickname ?? account.phone ?? account.id;

/** One account by mobile number (User.phone is not unique, so several matches are refused). */
const accountByPhone = async (prisma: PrismaClient | Prisma.TransactionClient, phone: string): Promise<Account> => {
  const accounts = await prisma.user.findMany({
    where: { OR: [{ phone }, { managerProfile: { phone } }] },
    include: accountInclude,
    orderBy: { createdAt: "asc" },
  });
  if (accounts.length === 0) throw new SystemAdminCommandError("ACCOUNT_NOT_FOUND", `没有手机号为 ${phone} 的账号。`);
  if (accounts.length > 1)
    throw new SystemAdminCommandError(
      "ACCOUNT_PHONE_AMBIGUOUS",
      `手机号 ${phone} 对应 ${accounts.length} 个账号，请先在数据库里核对，再用唯一的手机号操作。`,
      accounts.map((account) => ({ isBound: account.isBound, name: displayName(account), status: account.status, userId: account.id })),
    );
  return accounts[0]!;
};

export const listSystemAdmins = async (prisma: PrismaClient): Promise<readonly SystemAdminRow[]> => {
  const roles = await prisma.userRole.findMany({
    where: systemAdminRole,
    include: { user: { include: accountInclude } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return roles.map((row) => ({
    grantedAt: row.createdAt.toISOString(),
    name: displayName(row.user),
    phone: row.user.managerProfile?.phone ?? row.user.phone ?? "",
    status: row.user.status,
    userId: row.userId,
  }));
};

/** Grant SYSTEM_ADMIN on GLOBAL; returns false when the account already had it. */
export const grantSystemAdmin = async (prisma: PrismaClient, phone: string): Promise<{ readonly changed: boolean; readonly admin: SystemAdminCandidate }> => {
  const account = await accountByPhone(prisma, phone);
  const admin = { isBound: account.isBound, name: displayName(account), status: account.status, userId: account.id };
  if (!account.isBound) throw new SystemAdminCommandError("ACCOUNT_NOT_BOUND", `${admin.name} 还没有绑定，不能设为超级管理员。`);
  if (account.status !== "ACTIVE") throw new SystemAdminCommandError("ACCOUNT_DISABLED", `${admin.name} 的账号已停用。`);
  if (account.managerProfile === null)
    throw new SystemAdminCommandError("ACCOUNT_NOT_MANAGER", `${admin.name} 不是管理人员账号，工人账号不能设为超级管理员。`);
  if (account.roles.length > 0) return { admin, changed: false };
  const managerProfileId = account.managerProfile.id;
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "SYSTEM_ADMIN" } });
  await prisma.$transaction(async (transaction) => {
    await transaction.userRole.create({ data: { roleId: role.id, scopeId: GLOBAL_SCOPE_ID, scopeType: "GLOBAL", userId: account.id } });
    await transaction.auditLog.create({
      data: {
        action: "SYSTEM_ADMIN_GRANTED",
        actorUserId: null,
        entityId: account.id,
        entityType: "user",
        metadata: { managerProfileId, source: "cli", userId: account.id },
      },
    });
  });
  return { admin, changed: true };
};

/**
 * Revoke SYSTEM_ADMIN; refused for the last one. Serializable, so two revokes at the same
 * time cannot both pass the count and leave the platform without a super administrator.
 */
export const revokeSystemAdmin = async (prisma: PrismaClient, phone: string): Promise<SystemAdminCandidate> => {
  const account = await accountByPhone(prisma, phone);
  const admin = { isBound: account.isBound, name: displayName(account), status: account.status, userId: account.id };
  if (account.roles.length === 0) throw new SystemAdminCommandError("NOT_SYSTEM_ADMIN", `${admin.name} 不是超级管理员。`);
  await prisma.$transaction(
    async (transaction) => {
      await transaction.userRole.deleteMany({ where: { ...systemAdminRole, userId: account.id } });
      const remaining = await transaction.userRole.count({ where: systemAdminRole });
      if (remaining === 0)
        throw new SystemAdminCommandError("LAST_SYSTEM_ADMIN", `${admin.name} 是最后一位超级管理员，不能撤销。请先开通另一位。`);
      await transaction.auditLog.create({
        data: {
          action: "SYSTEM_ADMIN_REVOKED",
          actorUserId: null,
          entityId: account.id,
          entityType: "user",
          metadata: { managerProfileId: account.managerProfile?.id ?? null, remaining, source: "cli", userId: account.id },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return admin;
};

const USAGE = [
  "用法：",
  "  system-admin list",
  "  system-admin grant --phone 13800000000",
  "  system-admin revoke --phone 13800000000",
].join("\n");

type Output = { readonly error: (line: string) => void; readonly log: (line: string) => void };

/** The command line: returns the exit code (0 done, 1 refused, 2 wrong usage). */
export const runSystemAdminCommand = async (argv: readonly string[], prisma: PrismaClient, out: Output): Promise<number> => {
  const [command, ...rest] = argv;
  const phoneAt = rest.indexOf("--phone");
  const phone = phoneAt === -1 ? undefined : rest[phoneAt + 1]?.trim();
  try {
    if (command === "list" && rest.length === 0) {
      const admins = await listSystemAdmins(prisma);
      if (admins.length === 0) out.log("还没有超级管理员。");
      for (const admin of admins)
        out.log(`${admin.name}  ${admin.phone}  ${admin.status === "ACTIVE" ? "正常" : "已停用"}  开通于 ${admin.grantedAt}  ${admin.userId}`);
      return 0;
    }
    if ((command === "grant" || command === "revoke") && rest.length === 2 && phone !== undefined && /^1\d{10}$/.test(phone)) {
      if (command === "grant") {
        const result = await grantSystemAdmin(prisma, phone);
        out.log(result.changed ? `已把 ${result.admin.name} 设为超级管理员。` : `${result.admin.name} 已经是超级管理员，没有改动。`);
      } else {
        const admin = await revokeSystemAdmin(prisma, phone);
        out.log(`已撤销 ${admin.name} 的超级管理员身份。`);
      }
      return 0;
    }
  } catch (error: unknown) {
    if (!(error instanceof SystemAdminCommandError)) throw error;
    out.error(`${error.code}: ${error.message}`);
    for (const candidate of error.candidates)
      out.error(`  ${candidate.name}  ${candidate.isBound ? "已绑定" : "未绑定"}  ${candidate.status}  ${candidate.userId}`);
    return 1;
  }
  out.error(USAGE);
  return 2;
};
