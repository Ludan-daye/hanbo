import { API_BASE_URL } from "../config/env";
import { createApiClient } from "./apiClient";

export const apiClient = createApiClient(API_BASE_URL);
