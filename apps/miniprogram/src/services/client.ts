import { API_BASE_URL, FRONTEND_DEMO } from "../config/env";
import { createApiClient } from "./apiClient";
import { createDemoClient } from "./demo/client";

export const apiClient = FRONTEND_DEMO ? createDemoClient() : createApiClient(API_BASE_URL);
