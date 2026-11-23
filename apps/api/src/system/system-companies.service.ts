import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { BindingInvitation, Company, CompanyManagerMember, ManagerProfile } from "@prisma/client";

import { issueInvitationCode } from "../bindings/invitation-code.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { companyAdminGrant, synchronizeMembershipGrants } from "../management/membership-roles.js";

import type {
  CompanyAdminAppointed,
  CompanyAdminAppointment,
  CompanyAdminCandidate,
  CompanyAdminRevoked,
  CompanyAdminSummary,
  CompanyAdminView,
  IssuedCompanyInvitation,
  SystemCompanyDetail,
  SystemCompanyPage,
  SystemCompanyQuery,
  SystemCompanyRow,
  SystemCompanyStatusChange,
  SystemCompanyUpdate,
  SystemCompanyWrite,
} from "./system.types.js";

const PAGE = 30;
const CANDIDATES = 20;
const COMPANY_FIELDS = ["address", "contactName", "contactPhone", "creditCode", "name", "shortName"] as const;

type Appointment = CompanyManagerMember & {
  readonly invitation: BindingInvitation | null;
  readonly managerProfile: ManagerProfile;
};

type ProjectCounts = { readonly active: number; readonly total: number };

const summary = (member: Appointment): CompanyAdminSummary => ({
  isBound: member.managerProfile.userId !== null,
  memberId: member.id,
  name: member.managerProfile.name,
  phone: member.managerProfile.phone,
});

const adminView = (member: Appointment, now: Date): CompanyAdminView => {
  const bound = member.managerProfile.userId !== null;
  const invitation = bound ? null : member.invitation;
  return {
    ...summary(member),
    appointedAt: member.appointedAt.toISOString(),
    invitation:
      invitation === null
        ? null
        : {
            expiresAt: invitation.expiresAt.toISOString(),
            status:
              invitation.status === "PENDING" && invitation.expiresAt.getTime() <= now.getTime()
                ? "EXPIRED"
                : invitation.status,
          },
    managerProfileId: member.managerProfileId,
  };
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const assertOne = (count: number, status: "conflict" | "missing", message: string, context: Record<string, unknown>): void => {
  if (count === 1) return;
  throw status === "missing" ? new NotFoundException({ ...context, message }) : new ConflictException({ ...context, message });
};

/**
 * Companies and their administrators, for the platform (system admin plan phase 1, Q1, Q2, Q7).
 * Appointments live in CompanyManagerMember; the COMPANY_ADMIN UserRole follows them: granted
 * at once for a bound account, or when the appointee binds with the code issued here.
 */
@Injectable()
export class SystemCompaniesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: SystemCompanyQuery): Promise<SystemCompanyPage> {
    const search = query.search;
    const rows = await this.prisma.company.findMany({
      where: {
        ...(query.status === null ? {} : { status: query.status }),
        ...(search.length === 0
          ? {}
          : {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { shortName: { contains: search, mode: "insensitive" } },
                { creditCode: { contains: search.toUpperCase() } },
              ],
            }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(query.cursor === null ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    });
    const page = rows.slice(0, PAGE);
    const ids = page.map((company) => company.id);
    const [counts, admins] = await Promise.all([this.projectCounts(ids), this.activeAdmins(ids)]);
    return {
      items: page.map(
        (company): SystemCompanyRow => ({
          ...this.row(company, counts.get(company.id)),
          admins: admins.filter((member) => member.companyId === company.id).map(summary),
        }),
      ),
      nextCursor: rows.length > PAGE ? page[PAGE - 1]!.id : null,
    };
  }

  async detail(companyId: string): Promise<SystemCompanyDetail> {
    const company = await this.company(companyId);
    const [counts, admins] = await Promise.all([this.projectCounts([companyId]), this.activeAdmins([companyId])]);
    const now = new Date();
    return {
      ...this.row(company, counts.get(companyId)),
      address: company.address,
      admins: admins.map((member) => adminView(member, now)),
      contactName: company.contactName,
      contactPhone: company.contactPhone,
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  /** Q7: name required and unique, credit code unique when given; always starts ACTIVE. */
  async create(actorUserId: string, body: SystemCompanyWrite): Promise<SystemCompanyDetail> {
    await this.assertUnique(body, null);
    const company = await this.prisma
      .$transaction(async (transaction): Promise<Company> => {
        const created = await transaction.company.create({
          data: {
            address: body.address,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            creditCode: body.creditCode,
            name: body.name,
            shortName: body.shortName,
            status: "ACTIVE",
          },
        });
        await transaction.auditLog.create({
          data: {
            action: "COMPANY_CREATED",
            actorUserId,
            companyId: created.id,
            entityId: created.id,
            entityType: "company",
            metadata: { companyId: created.id, name: created.name },
          },
        });
        return created;
      })
      .catch((error: unknown): never => this.rethrowCreditCode(error, body.creditCode));
    return this.detail(company.id);
  }

  /** Every field, name and credit code included; optimistic on updatedAt. */
  async update(actorUserId: string, companyId: string, body: SystemCompanyUpdate): Promise<SystemCompanyDetail> {
    const previous = await this.company(companyId);
    await this.assertUnique(body, companyId);
    const changed = COMPANY_FIELDS.filter((key) => previous[key] !== body[key]);
    await this.prisma
      .$transaction(async (transaction): Promise<void> => {
        const result = await transaction.company.updateMany({
          where: { id: companyId, updatedAt: new Date(body.expectedUpdatedAt) },
          data: {
            address: body.address,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            creditCode: body.creditCode,
            name: body.name,
            shortName: body.shortName,
            updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
          },
        });
        assertOne(result.count, "conflict", "COMPANY_CHANGED_RELOAD_BEFORE_SAVING", { companyId });
        await transaction.auditLog.create({
          data: {
            action: "COMPANY_UPDATED",
            actorUserId,
            companyId,
            entityId: companyId,
            entityType: "company",
            metadata: { changed, companyId, name: body.name },
          },
        });
      })
      .catch((error: unknown): never => this.rethrowCreditCode(error, body.creditCode));
    return this.detail(companyId);
  }

  /**
   * Suspend or resume (phase 3, Q5). Only the status changes: projects, people, records and
   * administrators stay as they are, and resuming brings everything back. Optimistic on
   * updatedAt and on the status the page showed, so a double tap does not flip it back.
   */
  async setStatus(actorUserId: string, companyId: string, body: SystemCompanyStatusChange): Promise<SystemCompanyDetail> {
    const previous = await this.company(companyId);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      const result = await transaction.company.updateMany({
        where: {
          id: companyId,
          status: body.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
          updatedAt: new Date(body.expectedUpdatedAt),
        },
        data: {
          status: body.status,
          updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
        },
      });
      assertOne(result.count, "conflict", "COMPANY_CHANGED_RELOAD_BEFORE_SAVING", { companyId });
      await transaction.auditLog.create({
        data: {
          action: body.status === "SUSPENDED" ? "COMPANY_SUSPENDED" : "COMPANY_RESUMED",
          actorUserId,
          companyId,
          entityId: companyId,
          entityType: "company",
          metadata: { companyId, name: previous.name },
        },
      });
    });
    return this.detail(companyId);
  }

  /** Q1: bound, active manager accounts, by name or phone, not already admin here. */
  async candidates(companyId: string, search: string): Promise<readonly CompanyAdminCandidate[]> {
    await this.company(companyId);
    const profiles = await this.prisma.managerProfile.findMany({
      where: {
        companyAppointments: { none: { companyId, status: "ACTIVE" } },
        user: { isBound: true, status: "ACTIVE" },
        ...(search.length === 0
          ? {}
          : { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] }),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: CANDIDATES,
    });
    return profiles.map((profile) => ({ managerProfileId: profile.id, name: profile.name, phone: profile.phone }));
  }

  async appoint(actorUserId: string, companyId: string, body: CompanyAdminAppointment): Promise<CompanyAdminAppointed> {
    await this.company(companyId);
    const now = new Date();
    if ("name" in body) await this.assertNewManagerPhone(body.phone);
    else await this.appointableProfile(body.managerProfileId);
    const { invitation, memberId } = await this.prisma
      .$transaction(async (transaction) => {
        const profile =
          "name" in body
            ? await transaction.managerProfile.create({ data: { name: body.name, phone: body.phone, status: "ACTIVE" } })
            : await transaction.managerProfile.findUniqueOrThrow({ where: { id: body.managerProfileId } });
        const member = await transaction.companyManagerMember.create({
          data: { appointedAt: now, appointedByUserId: actorUserId, companyId, managerProfileId: profile.id, status: "ACTIVE" },
        });
        let issued: IssuedCompanyInvitation | null = null;
        if (profile.userId !== null) await synchronizeMembershipGrants(transaction, profile.userId, [], [companyAdminGrant(companyId)]);
        else issued = await this.issueInvitation(transaction, actorUserId, member.id, null, profile.id, now);
        await transaction.auditLog.create({
          data: {
            action: "COMPANY_ADMIN_APPOINTED",
            actorUserId,
            companyId,
            entityId: member.id,
            entityType: "company_manager_member",
            metadata: { companyId, invited: issued !== null, managerProfileId: profile.id, newProfile: "name" in body },
          },
        });
        return { invitation: issued, memberId: member.id };
      })
      .catch((error: unknown): never => {
        if (isUniqueViolation(error)) throw new ConflictException({ companyId, message: "COMPANY_ADMIN_ALREADY_APPOINTED" });
        throw error;
      });
    return { invitation, member: adminView(await this.appointment(companyId, memberId), now) };
  }

  /** A fresh code for an appointee who has not bound yet; the previous pending one stops working. */
  async reissueInvitation(actorUserId: string, companyId: string, memberId: string): Promise<IssuedCompanyInvitation> {
    const member = await this.appointment(companyId, memberId);
    if (member.managerProfile.userId !== null)
      throw new ConflictException({ memberId, message: "BINDING_TARGET_PROFILE_ALREADY_BOUND", profileId: member.managerProfileId });
    const now = new Date();
    return this.prisma.$transaction(async (transaction): Promise<IssuedCompanyInvitation> => {
      if (member.invitationId !== null)
        await transaction.bindingInvitation.updateMany({
          where: { id: member.invitationId, status: "PENDING" },
          data: { status: "REVOKED" },
        });
      const issued = await this.issueInvitation(transaction, actorUserId, member.id, member.invitationId, member.managerProfileId, now);
      await transaction.auditLog.create({
        data: {
          action: "COMPANY_ADMIN_INVITATION_ISSUED",
          actorUserId,
          companyId,
          entityId: member.id,
          entityType: "company_manager_member",
          metadata: { companyId, managerProfileId: member.managerProfileId },
        },
      });
      return issued;
    });
  }

  /**
   * Q2: always allowed, also for the last administrator (the response says how many remain).
   * Only the company-level role goes; project memberships of the same person stay.
   */
  async revoke(actorUserId: string, companyId: string, memberId: string): Promise<CompanyAdminRevoked> {
    const member = await this.appointment(companyId, memberId);
    return this.prisma.$transaction(async (transaction): Promise<CompanyAdminRevoked> => {
      const result = await transaction.companyManagerMember.updateMany({
        where: { companyId, id: memberId, status: "ACTIVE" },
        data: { revokedAt: new Date(), revokedByUserId: actorUserId, status: "REVOKED" },
      });
      assertOne(result.count, "missing", "COMPANY_ADMIN_NOT_FOUND", { companyId, memberId });
      if (member.managerProfile.userId !== null)
        await synchronizeMembershipGrants(transaction, member.managerProfile.userId, [companyAdminGrant(companyId)], []);
      if (member.invitationId !== null)
        await transaction.bindingInvitation.updateMany({
          where: { id: member.invitationId, status: "PENDING" },
          data: { status: "REVOKED" },
        });
      const remainingAdmins = await transaction.companyManagerMember.count({ where: { companyId, status: "ACTIVE" } });
      await transaction.auditLog.create({
        data: {
          action: "COMPANY_ADMIN_REVOKED",
          actorUserId,
          companyId,
          entityId: memberId,
          entityType: "company_manager_member",
          metadata: { companyId, managerProfileId: member.managerProfileId, remainingAdmins },
        },
      });
      return { remainingAdmins };
    });
  }

  private row(company: Company, counts: ProjectCounts | undefined): Omit<SystemCompanyRow, "admins"> {
    return {
      activeProjectCount: counts?.active ?? 0,
      createdAt: company.createdAt.toISOString(),
      creditCode: company.creditCode,
      id: company.id,
      name: company.name,
      projectCount: counts?.total ?? 0,
      shortName: company.shortName,
      status: company.status,
    };
  }

  private async projectCounts(companyIds: readonly string[]): Promise<Map<string, ProjectCounts>> {
    const counts = new Map<string, ProjectCounts>();
    if (companyIds.length === 0) return counts;
    const groups = await this.prisma.project.groupBy({
      by: ["companyId", "status"],
      where: { companyId: { in: [...companyIds] } },
      _count: { _all: true },
    });
    for (const group of groups) {
      const previous = counts.get(group.companyId) ?? { active: 0, total: 0 };
      counts.set(group.companyId, {
        active: previous.active + (group.status === "ACTIVE" ? group._count._all : 0),
        total: previous.total + group._count._all,
      });
    }
    return counts;
  }

  private async activeAdmins(companyIds: readonly string[]): Promise<readonly Appointment[]> {
    if (companyIds.length === 0) return [];
    return this.prisma.companyManagerMember.findMany({
      where: { companyId: { in: [...companyIds] }, status: "ACTIVE" },
      include: { invitation: true, managerProfile: true },
      orderBy: [{ appointedAt: "asc" }, { id: "asc" }],
    });
  }

  private async appointment(companyId: string, memberId: string): Promise<Appointment> {
    const member = await this.prisma.companyManagerMember.findFirst({
      where: { companyId, id: memberId, status: "ACTIVE" },
      include: { invitation: true, managerProfile: true },
    });
    if (member === null) throw new NotFoundException({ companyId, memberId, message: "COMPANY_ADMIN_NOT_FOUND" });
    return member;
  }

  private async company(companyId: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) throw new NotFoundException({ companyId, message: "COMPANY_NOT_FOUND" });
    return company;
  }

  private async assertUnique(body: SystemCompanyWrite, companyId: string | null): Promise<void> {
    const others = companyId === null ? {} : { id: { not: companyId } };
    const sameName = await this.prisma.company.findFirst({
      where: { ...others, name: { equals: body.name, mode: "insensitive" } },
    });
    if (sameName !== null) throw new ConflictException({ companyId: sameName.id, message: "COMPANY_NAME_EXISTS" });
    if (body.creditCode === null) return;
    const sameCode = await this.prisma.company.findFirst({ where: { ...others, creditCode: body.creditCode } });
    if (sameCode !== null) throw new ConflictException({ companyId: sameCode.id, message: "COMPANY_CREDIT_CODE_EXISTS" });
  }

  /** Two saves racing past assertUnique: the unique index on creditCode decides. */
  private rethrowCreditCode(error: unknown, creditCode: string | null): never {
    if (isUniqueViolation(error) && creditCode !== null) throw new ConflictException({ message: "COMPANY_CREDIT_CODE_EXISTS" });
    throw error;
  }

  /**
   * A new person must not already have a manager profile (pick that one instead) and must not
   * be a bound worker (only manager accounts can be company administrators, Q1).
   */
  private async assertNewManagerPhone(phone: string): Promise<void> {
    const existing = await this.prisma.managerProfile.findFirst({ where: { phone }, orderBy: { createdAt: "asc" } });
    if (existing !== null)
      throw new ConflictException({ message: "MANAGER_PHONE_EXISTS", name: existing.name, profileId: existing.id });
    const worker = await this.prisma.user.findFirst({ where: { isBound: true, phone, workerProfile: { isNot: null } } });
    if (worker !== null) throw new ConflictException({ message: "COMPANY_ADMIN_PHONE_IS_WORKER" });
  }

  private async appointableProfile(managerProfileId: string): Promise<void> {
    const profile = await this.prisma.managerProfile.findUnique({ where: { id: managerProfileId }, include: { user: true } });
    if (profile === null)
      throw new NotFoundException({ managerProfileId, message: "COMPANY_ADMIN_CANDIDATE_NOT_FOUND" });
    if (profile.user !== null && profile.user.status !== "ACTIVE")
      throw new BadRequestException({ managerProfileId, message: "COMPANY_ADMIN_CANDIDATE_NOT_ACTIVE" });
  }

  /** A manager binding invitation for the appointee, remembered on the appointment. */
  private async issueInvitation(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
    memberId: string,
    previousInvitationId: string | null,
    managerProfileId: string,
    now: Date,
  ): Promise<IssuedCompanyInvitation> {
    const { code, codeHash, expiresAt } = issueInvitationCode(now);
    const invitation = await transaction.bindingInvitation.create({
      data: {
        acceptedByUserId: null,
        codeHash,
        createdByUserId: actorUserId,
        expiresAt,
        managerProfileId,
        status: "PENDING",
        targetType: "MANAGER",
        usedAt: null,
        workerProfileId: null,
      },
    });
    const linked = await transaction.companyManagerMember.updateMany({
      where: { id: memberId, invitationId: previousInvitationId, status: "ACTIVE" },
      data: { invitationId: invitation.id },
    });
    assertOne(linked.count, "conflict", "COMPANY_ADMIN_CHANGED_RELOAD", { memberId });
    return { code, expiresAt: expiresAt.toISOString() };
  }
}
