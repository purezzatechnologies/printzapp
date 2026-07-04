import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as schema from "./schema";

const DB_FILE =
  (typeof process !== "undefined" ? process.env?.DATABASE_FILE : null) ||
  "printzapp.db";

// Resolve DB file path to project root (cwd)
const dbPath = path.isAbsolute(DB_FILE)
  ? DB_FILE
  : path.join(process.cwd(), DB_FILE);

const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export const rawDb = sqlite;
export { schema };
