import { sql } from "drizzle-orm";
import { scryptSync, randomBytes } from "node:crypto";
import { db } from "./client";
import { ensureMigrated } from "./migrate";
import {
  adminTeam,
  categories,
  platformSettings,
  users,
} from "./schema";
import { categories as seedCategorySkeletons } from "@/lib/data";

// Mirror of backend.ts hashPassword so the bootstrapped superadmin is stored
// hashed from the very first boot (never plaintext at rest).
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

let bootstrapped = false;

// Idempotent boot sequence. Runs on the first server-function invocation.
export function ensureBootstrapped() {
  if (bootstrapped) return;
  ensureMigrated();
  seedCategorySkeletonsIfEmpty();
  seedPlatformSettingsIfMissing();
  seedSuperadminFromEnv();
  bootstrapped = true;
}

function seedCategorySkeletonsIfEmpty() {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .get();
  if ((row?.count ?? 0) > 0) return;

  // Seed only the *category skeletons* — empty product lists. The catalog
  // starts clean otherwise.
  for (let i = 0; i < seedCategorySkeletons.length; i++) {
    const c = seedCategorySkeletons[i];
    db.insert(categories)
      .values({
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        image: c.image,
        position: i,
      })
      .run();
  }
}

function seedPlatformSettingsIfMissing() {
  const row = db
    .select({ id: platformSettings.id })
    .from(platformSettings)
    .get();
  if (row) return;
  db.insert(platformSettings).values({ id: 1 }).run();
}

function seedSuperadminFromEnv() {
  // If any superadmin already exists, do nothing (lets the user rename or
  // delete the auto-created account later).
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'superadmin'`)
    .get();
  if (existing) return;

  const isProduction =
    typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  const envPassword =
    typeof process !== "undefined" ? process.env?.SUPERADMIN_PASSWORD : undefined;

  // In production the first superadmin must be created with an explicit strong
  // password — never the well-known dev default.
  if (isProduction && !envPassword) {
    throw new Error(
      "SUPERADMIN_PASSWORD is required in production to bootstrap the first admin account.",
    );
  }

  const email =
    (typeof process !== "undefined" && process.env?.SUPERADMIN_EMAIL) ||
    "superadmin@printzapp.in";
  const password = envPassword || "Admin@123";
  const name =
    (typeof process !== "undefined" && process.env?.SUPERADMIN_NAME) ||
    "Super Admin";

  const id = `user-${cryptoSlug()}`;
  db.insert(users)
    .values({
      id,
      name,
      email,
      password: hashPassword(password),
      role: "superadmin",
      createdAt: new Date().toISOString(),
    })
    .run();

  // Mirror the auto-bootstrapped superadmin into the admin_team table so they
  // appear in the Security & Roles page out of the box.
  const teamExists = db.select({ id: adminTeam.id }).from(adminTeam).get();
  if (!teamExists) {
    db.insert(adminTeam)
      .values({
        id: `adm-${cryptoSlug()}`,
        name,
        email,
        role: "Super Admin",
        lastSeen: "Now",
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  // Quiet log so the operator knows what credentials work on first run.
  // eslint-disable-next-line no-console
  console.log(
    `[printzapp] bootstrapped superadmin: ${email} (override with SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD).`,
  );
}

function cryptoSlug() {
  const uuid =
    (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
    Math.random().toString(36).slice(2);
  return uuid.replace(/-/g, "").slice(0, 8);
}
