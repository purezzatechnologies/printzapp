# PRINTZAPP — Go-Live Checklist

## Required environment variables (production)

The app **refuses to boot in production** without these (fails loudly rather than
shipping insecure defaults):

| Variable | Purpose | Notes |
|---|---|---|
| `NODE_ENV=production` | Enables prod hardening | secure cookies, env checks |
| `SESSION_SECRET` | Encrypts the session cookie | 32+ random chars. Generate: `openssl rand -base64 48` |
| `SUPERADMIN_PASSWORD` | First admin account password | Strong, unique. Set before first boot |
| `SUPERADMIN_EMAIL` | First admin email | optional, defaults to `superadmin@printzapp.in` |
| `SUPERADMIN_NAME` | First admin display name | optional |
| `REMOVE_BG_API_KEY` | (optional) remove.bg API for background removal | falls back to the in-process RMBG-1.4 model if unset |

> The first super-admin is created once, on first boot, from these env vars and
> stored **hashed**. Change `SUPERADMIN_PASSWORD` only affects the *initial*
> creation — rotate later from the admin UI.

## Access paths

- **Customers & vendors** sign in at `/login` (two tabs only).
- **Staff / super admin** sign in at `/control` — a separate, unlinked page
  (`noindex`). It is not referenced from the public nav, footer, or `/login`.
- Direct navigation to `/superadmin` while signed out redirects to `/control`.

## Security posture (implemented)

- **Passwords**: hashed with scrypt + per-user salt (`scrypt$salt$hash`).
  Legacy plaintext rows upgrade to a hash automatically on next login.
- **Authorization**: every admin/vendor server function enforces `requireRole(...)`
  server-side, so the API cannot be called cross-role even if the UI is bypassed.
  Public endpoints are limited to catalog reads, auth, newsletter, pincode check,
  coupon validation, and background removal.
- **Login**: brute-force rate limiting (8 attempts / 15 min per email), generic
  error messages (no user/role enumeration), portal separation (admins can't use
  the public login and vice-versa).
- **Sessions**: httpOnly, `sameSite=lax`, `secure` in production.
- **File access** (`getArtworkFn`, `getComplaintEvidenceFn`): restricted to
  vendor/superadmin to prevent IDOR access to uploaded files.
- **No social login**: the Google/Apple buttons (which previously logged in with
  hardcoded demo credentials — a privilege-escalation hole) have been removed.

## Pre-launch steps

1. Set the env vars above.
2. Remove the dev SQLite (`printzapp.db*`) so production starts clean, or migrate
   real data. The schema is created/migrated automatically on boot.
3. `npm run build` → deploy the `dist/` output (Cloudflare/Node per your host).
4. Sign in once at `/control` with the bootstrap admin, then create products,
   vendors, and coupons.
5. Confirm at least one **active** vendor with pincode coverage exists, or orders
   can't be auto-assigned.

## Post-launch smoke test

- Customer: sign up → add to cart → apply coupon → checkout → order placed.
- Order auto-assigns to a covering vendor; appears in `/superadmin/orders`.
- Vendor finance shows earnings **net of commission**; payout request is capped
  at the available balance.
- Background removal on the passport-photo product returns a clean cutout.
