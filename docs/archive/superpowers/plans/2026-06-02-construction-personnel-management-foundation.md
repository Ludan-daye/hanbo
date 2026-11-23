# Construction Personnel Management Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the production-ready foundation for the construction site personnel management system: workspace structure, backend skeleton, database schema, and pure domain rules for hierarchical roles and four-point attendance.

**Architecture:** Use a pnpm monorepo with `apps/api` for the NestJS backend and `packages/domain` for pure TypeScript business rules. PostgreSQL is managed through Prisma migrations, while object storage, face verification, Mini Program screens, and full API modules are implemented in follow-up plans.

**Tech Stack:** pnpm, TypeScript, NestJS, Prisma, PostgreSQL, Docker Compose, Vitest.

---

## Scope Check

The approved design covers multiple independent subsystems: WeChat login, permissions, personnel, projects, face verification, attendance capture, makeup approval, reporting, storage, and Mini Program UI. This plan covers only the foundation that the later subsystem plans depend on.

Follow-up plans should be created after this foundation passes verification:

1. WeChat login, account binding, and scoped permissions.
2. Company, project, team, worker, and manager management APIs.
3. Object storage and independent face-service connector.
4. Four-point attendance submission and evidence persistence.
5. Makeup approval and daily/weekly/monthly statistics.
6. Native WeChat Mini Program user flows.

The user instruction forbids creating git commits unless explicitly requested, so this plan does not include commit steps.

## File Structure

Create this structure:

```text
package.json
pnpm-workspace.yaml
.gitignore
.env.example
docker-compose.yml
apps/api/package.json
apps/api/nest-cli.json
apps/api/tsconfig.json
apps/api/tsconfig.build.json
apps/api/vitest.config.ts
apps/api/prisma/schema.prisma
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/config/env.ts
apps/api/src/health/health.controller.ts
apps/api/src/infrastructure/database/prisma.module.ts
apps/api/src/infrastructure/database/prisma.service.ts
apps/api/test/health.e2e.test.ts
packages/domain/package.json
packages/domain/tsconfig.json
packages/domain/vitest.config.ts
packages/domain/src/index.ts
packages/domain/src/roles.ts
packages/domain/src/attendance.ts
packages/domain/test/roles.test.ts
packages/domain/test/attendance.test.ts
```

Responsibilities:

- `packages/domain`: strict, framework-free pure functions and data types.
- `apps/api`: NestJS framework adapters, API bootstrapping, environment parsing, database connector.
- `apps/api/prisma/schema.prisma`: initial normalized schema for role/personnel tables and project/attendance tables.
- `docker-compose.yml`: local PostgreSQL runtime for integration smoke checks.

## Task 1: Workspace And Runtime Files

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create the root package manifest**

Create `package.json`:

```json
{
  "name": "construction-site-personnel-management-system",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "build": "corepack pnpm -r build",
    "test": "corepack pnpm -r test",
    "lint": "corepack pnpm -r lint",
    "typecheck": "corepack pnpm -r typecheck",
    "dev:api": "corepack pnpm --filter @construction/api start:dev",
    "db:generate": "corepack pnpm --filter @construction/api prisma:generate",
    "db:migrate": "corepack pnpm --filter @construction/api prisma:migrate",
    "db:studio": "corepack pnpm --filter @construction/api prisma:studio"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "prettier": "^3.4.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create the pnpm workspace file**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.local
.env.*
!.env.example
.DS_Store
*.log
*.tsbuildinfo
```

- [ ] **Step 4: Create environment example**

Create `.env.example`:

```dotenv
NODE_ENV=development
API_PORT=3000
DATABASE_URL=postgresql://construction:construction@localhost:5432/construction_personnel?schema=public
WECHAT_APP_ID=replace-with-wechat-app-id
WECHAT_APP_SECRET=replace-with-wechat-app-secret
OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_BUCKET=construction-personnel
OBJECT_STORAGE_ACCESS_KEY=replace-with-access-key
OBJECT_STORAGE_SECRET_KEY=replace-with-secret-key
FACE_SERVICE_BASE_URL=http://localhost:8000
FACE_SERVICE_API_KEY=replace-with-face-service-key
```

- [ ] **Step 5: Create local PostgreSQL Compose runtime**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: construction
      POSTGRES_PASSWORD: construction
      POSTGRES_DB: construction_personnel
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U construction -d construction_personnel"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  postgres_data:
```

- [ ] **Step 6: Install workspace dependencies**

Run:

```bash
corepack pnpm install
```

Expected: dependency installation completes and `pnpm-lock.yaml` is created.

## Task 2: Pure Domain Package

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/roles.ts`
- Create: `packages/domain/src/attendance.ts`
- Create: `packages/domain/test/roles.test.ts`
- Create: `packages/domain/test/attendance.test.ts`

- [ ] **Step 1: Create the domain package manifest**

Create `packages/domain/package.json`:

```json
{
  "name": "@construction/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vitest config**

Create `packages/domain/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/domain/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
```

- [ ] **Step 3: Create role hierarchy logic**

Create `packages/domain/src/roles.ts`:

```ts
export const ROLE_LEVEL = {
  SYSTEM_ADMIN: 1,
  COMPANY_ADMIN: 2,
  PROJECT_ADMIN: 3,
  TEAM_LEADER: 4,
  WORKER: 5
} as const;

export type RoleCode = keyof typeof ROLE_LEVEL;

export type RoleAssignment = {
  readonly roleCode: RoleCode;
  readonly companyId: string | null;
  readonly projectId: string | null;
  readonly teamId: string | null;
};

export const roleIncludes = (ownerRole: RoleCode, requiredRole: RoleCode): boolean => {
  return ROLE_LEVEL[ownerRole] <= ROLE_LEVEL[requiredRole];
};

export const hasRoleAtLeast = (
  assignments: readonly RoleAssignment[],
  requiredRole: RoleCode
): boolean => {
  return assignments.some((assignment: RoleAssignment) => {
    return roleIncludes(assignment.roleCode, requiredRole);
  });
};

export const canApproveMakeupRequest = (
  approverUserId: string,
  requesterUserId: string,
  approverAssignments: readonly RoleAssignment[]
): boolean => {
  if (approverUserId === requesterUserId) {
    return false;
  }

  return hasRoleAtLeast(approverAssignments, "TEAM_LEADER");
};
```

- [ ] **Step 4: Create four-point attendance calculation logic**

Create `packages/domain/src/attendance.ts`:

```ts
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

export type SelectedAttendanceRecord = {
  readonly pointCode: AttendancePointCode;
  readonly record: AttendanceRecordInput | null;
};

export type DailyAttendanceSummary = {
  readonly selectedRecords: readonly SelectedAttendanceRecord[];
  readonly workedMinutes: number;
  readonly isLate: boolean;
  readonly isEarlyLeave: boolean;
  readonly isMissingPunch: boolean;
  readonly isAbsent: boolean;
};

const requiredPointCodes: readonly AttendancePointCode[] = [
  "SEGMENT_1_START",
  "SEGMENT_1_END",
  "SEGMENT_2_START",
  "SEGMENT_2_END"
];

const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60_000);
};

const differenceInWholeMinutes = (end: Date, start: Date): number => {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
};

const selectStartRecord = (
  records: readonly AttendanceRecordInput[],
  pointCode: AttendancePointCode
): AttendanceRecordInput | null => {
  const validRecords: readonly AttendanceRecordInput[] = records
    .filter((record: AttendanceRecordInput) => record.isValid && record.pointCode === pointCode)
    .sort((left: AttendanceRecordInput, right: AttendanceRecordInput) => {
      return left.occurredAt.getTime() - right.occurredAt.getTime();
    });

  return validRecords[0] ?? null;
};

const selectEndRecord = (
  records: readonly AttendanceRecordInput[],
  pointCode: AttendancePointCode
): AttendanceRecordInput | null => {
  const validRecords: readonly AttendanceRecordInput[] = records
    .filter((record: AttendanceRecordInput) => record.isValid && record.pointCode === pointCode)
    .sort((left: AttendanceRecordInput, right: AttendanceRecordInput) => {
      return right.occurredAt.getTime() - left.occurredAt.getTime();
    });

  return validRecords[0] ?? null;
};

export const summarizeDailyAttendance = (
  shiftRule: ShiftRule,
  records: readonly AttendanceRecordInput[]
): DailyAttendanceSummary => {
  const segment1Start: AttendanceRecordInput | null = selectStartRecord(records, "SEGMENT_1_START");
  const segment1End: AttendanceRecordInput | null = selectEndRecord(records, "SEGMENT_1_END");
  const segment2Start: AttendanceRecordInput | null = selectStartRecord(records, "SEGMENT_2_START");
  const segment2End: AttendanceRecordInput | null = selectEndRecord(records, "SEGMENT_2_END");

  const selectedRecords: readonly SelectedAttendanceRecord[] = [
    { pointCode: "SEGMENT_1_START", record: segment1Start },
    { pointCode: "SEGMENT_1_END", record: segment1End },
    { pointCode: "SEGMENT_2_START", record: segment2Start },
    { pointCode: "SEGMENT_2_END", record: segment2End }
  ];

  const segment1Minutes: number =
    segment1Start !== null && segment1End !== null
      ? differenceInWholeMinutes(segment1End.occurredAt, segment1Start.occurredAt)
      : 0;

  const segment2Minutes: number =
    segment2Start !== null && segment2End !== null
      ? differenceInWholeMinutes(segment2End.occurredAt, segment2Start.occurredAt)
      : 0;

  const missingPointCount: number = selectedRecords.filter((selected: SelectedAttendanceRecord) => {
    return selected.record === null;
  }).length;

  return {
    selectedRecords,
    workedMinutes: segment1Minutes + segment2Minutes,
    isLate:
      segment1Start !== null &&
      segment1Start.occurredAt.getTime() >
        addMinutes(shiftRule.segment1StartAt, shiftRule.lateGraceMinutes).getTime(),
    isEarlyLeave:
      segment2End !== null &&
      segment2End.occurredAt.getTime() <
        addMinutes(shiftRule.segment2EndAt, -shiftRule.earlyLeaveGraceMinutes).getTime(),
    isMissingPunch: missingPointCount > 0,
    isAbsent: missingPointCount === requiredPointCodes.length
  };
};
```

- [ ] **Step 5: Export domain modules**

Create `packages/domain/src/index.ts`:

```ts
export * from "./attendance.js";
export * from "./roles.js";
```

- [ ] **Step 6: Add role tests**

Create `packages/domain/test/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canApproveMakeupRequest, hasRoleAtLeast, roleIncludes } from "../src/roles.js";

describe("role hierarchy", () => {
  it("allows higher roles to include lower roles", () => {
    expect(roleIncludes("PROJECT_ADMIN", "TEAM_LEADER")).toBe(true);
    expect(roleIncludes("TEAM_LEADER", "PROJECT_ADMIN")).toBe(false);
  });

  it("detects whether a user has at least the required role", () => {
    expect(
      hasRoleAtLeast(
        [{ roleCode: "COMPANY_ADMIN", companyId: "company-1", projectId: null, teamId: null }],
        "WORKER"
      )
    ).toBe(true);
  });

  it("blocks self-approval for makeup requests", () => {
    expect(
      canApproveMakeupRequest("user-1", "user-1", [
        { roleCode: "PROJECT_ADMIN", companyId: "company-1", projectId: "project-1", teamId: null }
      ])
    ).toBe(false);
  });
});
```

- [ ] **Step 7: Add attendance tests**

Create `packages/domain/test/attendance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { summarizeDailyAttendance, type ShiftRule } from "../src/attendance.js";

const dateAt = (time: string): Date => {
  return new Date(`2026-06-02T${time}:00.000+08:00`);
};

const shiftRule: ShiftRule = {
  segment1StartAt: dateAt("08:00"),
  segment1EndAt: dateAt("12:00"),
  segment2StartAt: dateAt("13:30"),
  segment2EndAt: dateAt("18:00"),
  lateGraceMinutes: 5,
  earlyLeaveGraceMinutes: 5
};

describe("summarizeDailyAttendance", () => {
  it("calculates total duration from two valid work segments", () => {
    const summary = summarizeDailyAttendance(shiftRule, [
      { id: "1", pointCode: "SEGMENT_1_START", occurredAt: dateAt("08:01"), isValid: true, source: "DEVICE" },
      { id: "2", pointCode: "SEGMENT_1_END", occurredAt: dateAt("12:03"), isValid: true, source: "DEVICE" },
      { id: "3", pointCode: "SEGMENT_2_START", occurredAt: dateAt("13:29"), isValid: true, source: "DEVICE" },
      { id: "4", pointCode: "SEGMENT_2_END", occurredAt: dateAt("18:02"), isValid: true, source: "DEVICE" }
    ]);

    expect(summary.workedMinutes).toBe(515);
    expect(summary.isLate).toBe(false);
    expect(summary.isEarlyLeave).toBe(false);
    expect(summary.isMissingPunch).toBe(false);
    expect(summary.isAbsent).toBe(false);
  });

  it("uses the first segment start for late status and the second segment end for early leave", () => {
    const summary = summarizeDailyAttendance(shiftRule, [
      { id: "1", pointCode: "SEGMENT_1_START", occurredAt: dateAt("08:08"), isValid: true, source: "DEVICE" },
      { id: "2", pointCode: "SEGMENT_1_END", occurredAt: dateAt("12:00"), isValid: true, source: "DEVICE" },
      { id: "3", pointCode: "SEGMENT_2_START", occurredAt: dateAt("13:50"), isValid: true, source: "DEVICE" },
      { id: "4", pointCode: "SEGMENT_2_END", occurredAt: dateAt("17:50"), isValid: true, source: "DEVICE" }
    ]);

    expect(summary.isLate).toBe(true);
    expect(summary.isEarlyLeave).toBe(true);
  });

  it("marks missing punch while still calculating complete segment duration", () => {
    const summary = summarizeDailyAttendance(shiftRule, [
      { id: "1", pointCode: "SEGMENT_1_START", occurredAt: dateAt("08:00"), isValid: true, source: "DEVICE" },
      { id: "2", pointCode: "SEGMENT_1_END", occurredAt: dateAt("12:00"), isValid: true, source: "DEVICE" }
    ]);

    expect(summary.workedMinutes).toBe(240);
    expect(summary.isMissingPunch).toBe(true);
    expect(summary.isAbsent).toBe(false);
  });
});
```

- [ ] **Step 8: Verify domain package**

Run:

```bash
corepack pnpm --filter @construction/domain test
corepack pnpm --filter @construction/domain typecheck
```

Expected: all domain tests pass and TypeScript reports no errors.

## Task 3: NestJS API Skeleton

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/test/health.e2e.test.ts`

- [ ] **Step 1: Create API package manifest**

Create `apps/api/package.json`:

```json
{
  "name": "@construction/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@construction/domain": "workspace:*",
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "@prisma/client": "^6.1.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.8",
    "@nestjs/testing": "^10.4.15",
    "prisma": "^6.1.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create API TypeScript config**

Create `apps/api/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["test/**/*.ts", "**/*.test.ts"]
}
```

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
```

- [ ] **Step 3: Create strict environment parsing**

Create `apps/api/src/config/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  API_PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1),
  WECHAT_APP_ID: z.string().min(1),
  WECHAT_APP_SECRET: z.string().min(1),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  FACE_SERVICE_BASE_URL: z.string().url(),
  FACE_SERVICE_API_KEY: z.string().min(1)
});

export type AppEnv = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv): AppEnv => {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new Error(
      JSON.stringify({
        message: "Invalid environment configuration",
        issues: result.error.issues
      })
    );
  }

  return result.data;
};
```

- [ ] **Step 4: Create health controller and application module**

Create `apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common";

type HealthResponse = {
  readonly status: "ok";
};

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
```

Create `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";

@Module({
  controllers: [HealthController]
})
export class AppModule {}
```

Create `apps/api/src/main.ts`:

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

const bootstrap = async (): Promise<void> => {
  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  await app.listen(env.API_PORT);
};

await bootstrap();
```

- [ ] **Step 5: Add health endpoint smoke test**

Create `apps/api/test/health.e2e.test.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";

describe("health endpoint", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns ok", async () => {
    await request(app.getHttpServer()).get("/health").expect(200).expect({ status: "ok" });
  });
});
```

- [ ] **Step 6: Verify API skeleton**

Run:

```bash
corepack pnpm --filter @construction/api test
corepack pnpm --filter @construction/api typecheck
```

Expected: health endpoint smoke test passes and TypeScript reports no errors.

## Task 4: Initial Prisma Schema

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/infrastructure/database/prisma.service.ts`
- Create: `apps/api/src/infrastructure/database/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the Prisma schema**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum RoleCode {
  SYSTEM_ADMIN
  COMPANY_ADMIN
  PROJECT_ADMIN
  TEAM_LEADER
  WORKER
}

enum ProfileOwnerType {
  WORKER
  MANAGER
}

enum ProjectStatus {
  PREPARING
  ACTIVE
  SUSPENDED
  COMPLETED
}

enum MemberStatus {
  ACTIVE
  EXITED
  SUSPENDED
}

enum AttendancePointCode {
  SEGMENT_1_START
  SEGMENT_1_END
  SEGMENT_2_START
  SEGMENT_2_END
}

enum AttendanceRecordSource {
  DEVICE
  MAKEUP
}

enum AttendanceRecordStatus {
  VALID
  INVALID
}

enum MakeupStatus {
  PENDING
  APPROVED
  REJECTED
}

model User {
  id               String          @id @default(uuid())
  openid           String          @unique
  phone            String?
  isBound          Boolean         @default(false)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  lastLoginAt      DateTime?
  roles            UserRole[]
  workerProfile    WorkerProfile?
  managerProfile   ManagerProfile?
  requestedMakeups MakeupRequest[] @relation("requester")
  approvedMakeups  MakeupRequest[] @relation("approver")
  auditLogs        AuditLog[]

  @@map("users")
}

model WorkerProfile {
  id                   String                @id @default(uuid())
  userId               String?               @unique
  encryptedName        String
  encryptedIdNumber    String
  idNumberHash         String                @unique
  phone                String
  workType             String
  realNameStatus       String
  faceProfileStatus    String
  employmentStatus     String
  createdAt            DateTime              @default(now())
  updatedAt            DateTime              @updatedAt
  user                 User?                 @relation(fields: [userId], references: [id])
  projectMemberships   ProjectWorkerMember[]

  @@index([phone])
  @@index([employmentStatus])
  @@map("worker_profiles")
}

model ManagerProfile {
  id                 String                 @id @default(uuid())
  userId             String?                @unique
  name               String
  phone              String
  status             String
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @updatedAt
  user               User?                  @relation(fields: [userId], references: [id])
  projectMemberships ProjectManagerMember[]

  @@index([phone])
  @@index([status])
  @@map("manager_profiles")
}

model Role {
  id          String     @id @default(uuid())
  code        RoleCode   @unique
  level       Int
  name        String
  createdAt   DateTime   @default(now())
  permissions Permission[]
  userRoles   UserRole[]

  @@map("roles")
}

model Permission {
  id        String   @id @default(uuid())
  code      String   @unique
  name      String
  roles     Role[]
  createdAt DateTime @default(now())

  @@map("permissions")
}

model UserRole {
  id        String   @id @default(uuid())
  userId    String
  roleId    String
  companyId String?
  projectId String?
  teamId    String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  role      Role     @relation(fields: [roleId], references: [id])

  @@index([userId])
  @@index([companyId, projectId, teamId])
  @@map("user_roles")
}

model Company {
  id        String    @id @default(uuid())
  name      String
  status    String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  projects  Project[]

  @@map("companies")
}

model Project {
  id               String                 @id @default(uuid())
  companyId        String
  name             String
  address          String
  centerLatitude   Decimal                @db.Decimal(10, 7)
  centerLongitude  Decimal                @db.Decimal(10, 7)
  geofenceRadiusM  Int
  status           ProjectStatus
  plannedStartDate DateTime
  plannedEndDate   DateTime?
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt
  company          Company                @relation(fields: [companyId], references: [id])
  teams            Team[]
  workerMembers    ProjectWorkerMember[]
  managerMembers   ProjectManagerMember[]
  shifts           Shift[]
  attendanceRecords AttendanceRecord[]
  attendanceResults AttendanceResult[]
  makeupRequests   MakeupRequest[]

  @@index([companyId, status])
  @@map("projects")
}

model Team {
  id        String                @id @default(uuid())
  projectId String
  name      String
  status    String
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt
  project   Project               @relation(fields: [projectId], references: [id])
  workers   ProjectWorkerMember[]

  @@index([projectId, status])
  @@map("teams")
}

model ProjectWorkerMember {
  id                 String        @id @default(uuid())
  projectId          String
  workerId           String
  teamId             String?
  requiresAttendance Boolean       @default(true)
  enteredAt          DateTime
  exitedAt           DateTime?
  projectRoleLabel   String
  status             MemberStatus
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  project            Project       @relation(fields: [projectId], references: [id])
  worker             WorkerProfile @relation(fields: [workerId], references: [id])
  team               Team?         @relation(fields: [teamId], references: [id])

  @@index([projectId, teamId, status])
  @@index([workerId, status])
  @@map("project_worker_members")
}

model ProjectManagerMember {
  id                 String         @id @default(uuid())
  projectId          String
  managerId          String
  roleCode           RoleCode
  teamScopeId        String?
  requiresAttendance Boolean        @default(true)
  status             MemberStatus
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  project            Project        @relation(fields: [projectId], references: [id])
  manager            ManagerProfile @relation(fields: [managerId], references: [id])

  @@index([projectId, roleCode, status])
  @@index([managerId, status])
  @@map("project_manager_members")
}

model Shift {
  id          String         @id @default(uuid())
  projectId   String
  name        String
  isDefault   Boolean        @default(false)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  project     Project        @relation(fields: [projectId], references: [id])
  segments    ShiftSegment[]
  schedules   Schedule[]

  @@index([projectId, isDefault])
  @@map("shifts")
}

model ShiftSegment {
  id              String   @id @default(uuid())
  shiftId         String
  sequence        Int
  startTime       String
  endTime         String
  lateGraceMins   Int      @default(0)
  earlyGraceMins  Int      @default(0)
  createdAt       DateTime @default(now())
  shift           Shift    @relation(fields: [shiftId], references: [id])

  @@unique([shiftId, sequence])
  @@map("shift_segments")
}

model Schedule {
  id        String   @id @default(uuid())
  shiftId   String
  ownerType String
  ownerId   String
  startsOn  DateTime
  endsOn    DateTime?
  createdAt DateTime @default(now())
  shift     Shift    @relation(fields: [shiftId], references: [id])

  @@index([ownerType, ownerId, startsOn])
  @@map("schedules")
}

model FaceProfile {
  id                  String           @id @default(uuid())
  ownerType           ProfileOwnerType
  ownerId             String
  baselineObjectKey   String
  baselineImageHash   String
  faceServiceId       String?
  status              String
  version             Int              @default(1)
  reviewedByUserId    String?
  reviewedAt          DateTime?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  @@index([ownerType, ownerId, status])
  @@map("face_profiles")
}

model AttendanceRecord {
  id                String                 @id @default(uuid())
  projectId         String
  participantType   ProfileOwnerType
  participantId     String
  attendanceDate    DateTime
  pointCode         AttendancePointCode
  source            AttendanceRecordSource
  status            AttendanceRecordStatus
  occurredAt        DateTime
  serverReceivedAt  DateTime               @default(now())
  latitude          Decimal                @db.Decimal(10, 7)
  longitude         Decimal                @db.Decimal(10, 7)
  locationAccuracyM Decimal?               @db.Decimal(8, 2)
  geofenceDistanceM Decimal?               @db.Decimal(8, 2)
  selfieObjectKey   String
  sitePhotoObjectKey String
  selfieHash        String
  sitePhotoHash     String
  faceScore         Decimal?               @db.Decimal(6, 4)
  facePassed        Boolean
  abnormalReason    String?
  createdAt         DateTime               @default(now())
  project           Project                @relation(fields: [projectId], references: [id])

  @@index([projectId, attendanceDate, participantType, participantId])
  @@index([projectId, attendanceDate, pointCode])
  @@map("attendance_records")
}

model AttendanceResult {
  id                  String           @id @default(uuid())
  projectId           String
  attendanceDate      DateTime
  participantType     ProfileOwnerType
  participantId       String
  workedMinutes       Int
  isLate              Boolean
  isEarlyLeave        Boolean
  isMissingPunch      Boolean
  isAbsent            Boolean
  approvedMakeupCount Int              @default(0)
  abnormalRecordCount Int              @default(0)
  calculatedAt        DateTime         @default(now())
  project             Project          @relation(fields: [projectId], references: [id])

  @@unique([projectId, attendanceDate, participantType, participantId])
  @@index([projectId, attendanceDate])
  @@map("attendance_results")
}

model MakeupRequest {
  id                 String              @id @default(uuid())
  projectId          String
  requesterUserId    String
  participantType    ProfileOwnerType
  participantId      String
  attendanceDate     DateTime
  pointCode          AttendancePointCode
  requestedOccurredAt DateTime
  reason             String
  status             MakeupStatus
  approverUserId     String?
  approvalReason     String?
  approvedAt         DateTime?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  project            Project             @relation(fields: [projectId], references: [id])
  requesterUser      User                @relation("requester", fields: [requesterUserId], references: [id])
  approverUser       User?               @relation("approver", fields: [approverUserId], references: [id])

  @@index([projectId, attendanceDate, status])
  @@index([requesterUserId, status])
  @@map("makeup_requests")
}

model AuditLog {
  id          String   @id @default(uuid())
  actorUserId String?
  action      String
  entityType  String
  entityId    String
  metadata    Json
  createdAt   DateTime @default(now())
  actorUser   User?    @relation(fields: [actorUserId], references: [id])

  @@index([actorUserId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

- [ ] **Step 2: Create Prisma service and module**

Create `apps/api/src/infrastructure/database/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

Create `apps/api/src/infrastructure/database/prisma.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
```

- [ ] **Step 3: Register PrismaModule in the API app**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [HealthController]
})
export class AppModule {}
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
corepack pnpm --filter @construction/api prisma:generate
```

Expected: Prisma Client is generated without schema validation errors.

- [ ] **Step 5: Create the first migration baseline**

Run:

```bash
docker compose up -d postgres
corepack pnpm --filter @construction/api prisma:migrate -- --name init_foundation_schema
```

Expected: PostgreSQL reports healthy and Prisma creates the initial migration successfully.

If Docker is unavailable, create the migration SQL baseline without applying it:

```bash
mkdir -p apps/api/prisma/migrations/20260602000000_init_foundation_schema
DATABASE_URL=postgresql://construction:construction@localhost:5432/construction_personnel?schema=public corepack pnpm --filter @construction/api exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > apps/api/prisma/migrations/20260602000000_init_foundation_schema/migration.sql
```

Then create `apps/api/prisma/migrations/migration_lock.toml`:

```toml
# Please do not edit this file manually
# It should be added in your version-control system
provider = "postgresql"
```

Expected when Docker is unavailable: the migration files exist and schema diff generation succeeds, but actual migration application remains blocked until PostgreSQL is available.

## Task 5: Foundation Verification

**Files:**
- Read: `package.json`
- Read: `packages/domain/src/attendance.ts`
- Read: `packages/domain/src/roles.ts`
- Read: `apps/api/prisma/schema.prisma`
- Read: `apps/api/src/app.module.ts`

- [ ] **Step 1: Run full test suite**

Run:

```bash
corepack pnpm test
```

Expected: domain tests and API health smoke test pass.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: all TypeScript projects complete with no errors.

- [ ] **Step 3: Build all packages**

Run:

```bash
corepack pnpm build
```

Expected: `packages/domain/dist` and `apps/api/dist` are created.

- [ ] **Step 4: Verify database schema can be reset in local development**

Run:

```bash
corepack pnpm --filter @construction/api prisma migrate reset --force
```

Expected when Docker/PostgreSQL is available: the local development database is reset and the initial migration reapplies successfully. If Docker is unavailable, record the daemon error and verify schema validity with Prisma `validate`, `generate`, and `migrate diff --from-empty`.

- [ ] **Step 5: Inspect git diff without staging**

Run:

```bash
git --no-pager diff --stat
git --no-pager diff
```

Expected: the diff contains only foundation files from this plan and the already approved design and plan documents. No files are staged and no commit is created.

## Self-Review

Spec coverage in this foundation plan:

- Workspace and backend foundation: covered by Tasks 1 and 3.
- Role hierarchy and self-approval block: covered by Task 2.
- Four-point attendance and two-segment worked-duration rule: covered by Task 2.
- Role/personnel and project/attendance table categories: covered by Task 4.
- Worker and manager membership separation: covered by Task 4.
- PostgreSQL indexes for attendance and project membership: covered by Task 4.
- No binary image storage in PostgreSQL: represented by object-key fields in Task 4.

Requirements intentionally assigned to follow-up plans:

- WeChat `wx.login` and `code2Session` exchange.
- Account binding invitation flow.
- Project/personnel CRUD endpoints.
- Object storage upload and signed access.
- CompreFace connector and face threshold calibration.
- Attendance submission API.
- Makeup approval API.
- Daily, weekly, and monthly report endpoints.
- Native WeChat Mini Program pages.
