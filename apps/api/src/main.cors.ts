export const parseAllowedOrigins = (raw: string): string[] =>
  raw
    .split(",")
    .map((origin: string): string => origin.trim())
    .filter((origin: string): boolean => origin.length > 0);
