import { apiClient } from "./client";
import type { AttendanceRecord, Makeup, MyProjectMembership, SubmitMakeupBody } from "./me.types";

export const fetchMyAttendanceRecords = async (from: string, to: string): Promise<ReadonlyArray<AttendanceRecord>> =>
  apiClient.request<ReadonlyArray<AttendanceRecord>>(`/me/attendance-records?from=${from}&to=${to}`, { method: "GET" });

export const fetchMyMakeups = async (): Promise<ReadonlyArray<Makeup>> =>
  apiClient.request<ReadonlyArray<Makeup>>(`/me/makeups`, { method: "GET" });

export const fetchMyProjects = async (): Promise<ReadonlyArray<MyProjectMembership>> =>
  apiClient.request<ReadonlyArray<MyProjectMembership>>(`/me/projects`, { method: "GET" });

export const submitMakeup = async (projectId: string, body: SubmitMakeupBody): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/projects/${projectId}/requests`, { data: body, method: "POST" });
