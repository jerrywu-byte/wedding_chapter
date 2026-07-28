import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type SiteRuntime = typeof globalThis & {
  __SITE_ENV__?: { DB?: D1Database };
};

export function getDb() {
  const binding = (globalThis as SiteRuntime).__SITE_ENV__?.DB;
  if (!binding) {
    throw new Error("The visit database is temporarily unavailable.");
  }
  return drizzle(binding, { schema });
}
