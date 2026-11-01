# Deploying Nutbox

**Shape:** Firebase App Hosting runs the Next.js app. Neon hosts PostgreSQL. Cloudflare holds the domain's DNS, the `www` → apex redirect and HTTPS-only rules.

```
 shopper ──▶ nutbox.in (Cloudflare DNS, records DNS-only)
              │
              ▼
        Firebase App Hosting (Cloud Run + Google CDN, auto-deploys from GitHub main)
              │  DATABASE_URL (Neon pooled), AUTH_SECRET  ← Cloud Secret Manager
              ▼
        Neon PostgreSQL  ◀── GitHub Action "Database (Neon)" runs migrations / first seed
```

> **Why Cloudflare isn't proxying (orange cloud):** App Hosting checks that your domain's A record points at Google and issues the TLS certificate itself. Proxied records hide that address, so verification and certificate renewal fail; people who proxied report Firebase eventually removing the domain ([Cloudflare community](https://community.cloudflare.com/t/using-cloudflare-with-firebase-app-hosting/772296), [field guide](https://github.com/ImmuneMoon/Connecting-a-Custom-Domain-to-Firebase-App-Hosting)). Google's CDN already sits in front of App Hosting. If you later need Cloudflare's WAF in front, it has to be a Cloudflare Worker that reverse-proxies to the `*.hosted.app` URL — a separate project.

## 1. Neon (database) — 10 minutes

1. Create a project at neon.tech. Pick the region closest to the App Hosting region you'll choose in step 3 (same cloud region family keeps queries fast).
2. From **Connection details** copy two strings:
   - **Pooled** (host contains `-pooler`) → used by the app.
   - **Direct** (no `-pooler`) → used for migrations.
   Both end in `?sslmode=require`.

## 2. GitHub (migrations + first seed) — 5 minutes

In `supportzenryz/nutbox` → **Settings → Environments** → create `production`, then add these environment secrets:

| Secret | Value |
|---|---|
| `NEON_DATABASE_URL` | the **direct** Neon string |
| `SEED_ADMIN_EMAIL` | the store owner's login email |
| `SEED_ADMIN_PASSWORD` | 12+ characters, kept in a password manager |

Then **Actions → Database (Neon) → Run workflow → tick "seed"**. It creates the tables, loads the catalog, prices and coupons, and creates your admin. It loads **no stock** and **no demo accounts**. Later migrations run automatically on every push that changes `drizzle/`. The seed refuses to run on a database with real orders.

## 3. Firebase App Hosting (the app) — 15 minutes

Needs the **Blaze** (pay-as-you-go) plan; App Hosting has a monthly no-cost allowance before charges.

1. console.firebase.google.com → create project `nutbox` → upgrade to Blaze.
2. **Build → App Hosting → Get started**: connect GitHub, choose `supportzenryz/nutbox`, root directory `/`, live branch `main`, automatic rollouts **on**. Choose the region nearest India the console offers. Name the backend `nutbox`.
3. Create the two secrets from a terminal with the Firebase CLI (`npm i -g firebase-tools && firebase login`):
   ```bash
   firebase use <your-project-id>
   firebase apphosting:secrets:set nutbox-database-url   # paste the POOLED Neon string
   firebase apphosting:secrets:set nutbox-auth-secret    # paste: openssl rand -hex 32
   ```
   Say **yes** when asked to grant the `nutbox` backend access. (If you skipped it: `firebase apphosting:secrets:grantaccess nutbox-database-url --backend nutbox`, same for `nutbox-auth-secret`.)
4. Trigger a rollout (push to `main`, or **Rollouts → Create rollout**). When it's live, open the `https://nutbox--<project>.<region>.hosted.app` URL, sign in at `/login` with the admin from step 2, and go to **Admin → Settings** to enter the real GSTIN, FSSAI licence, legal name, address and bank details.
5. Receive opening stock lot by lot in **Admin → Inventory**.

`apphosting.yaml` in the repo holds the runtime size (0–4 instances, 1 vCPU, 1 GiB) and env wiring; edit and push to change them.

## 4. Cloudflare (domain) — 20 minutes + DNS propagation

1. Add `nutbox.in` to Cloudflare (or transfer it there) and switch nameservers at your registrar.
2. In Firebase **App Hosting → nutbox → Settings → Domains → Add custom domain** → `nutbox.in`. Firebase shows the records it needs.
3. In Cloudflare **DNS → Records**, add exactly what Firebase shows — **all set to DNS only (grey cloud)**:
   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | A | `@` | the IP Firebase gives | DNS only |
   | TXT | `@` | the Firebase verification value | DNS only |
   | CNAME | `_acme-challenge` | the value Firebase gives | DNS only |
   Delete any other A/AAAA/CNAME on `@`. Keep the TXT and `_acme-challenge` forever — they're used at every certificate renewal. Enter only the part before your domain in the **Name** field.
4. `www`: add **AAAA `www` → `100::`, Proxied**, then **Rules → Redirect Rules** → hostname equals `www.nutbox.in` → static redirect 301 to `https://nutbox.in${uri.path}` (preserve query string).
5. **SSL/TLS → Overview → Full (strict)**. **SSL/TLS → Edge Certificates → Always Use HTTPS: on.** Never use *Flexible* (redirect loop).
6. If you have CAA records, allow `pki.goog` and `letsencrypt.org`.
7. Wait for Firebase to show the domain as **Connected** (minutes to a few hours; "DNS changes not yet detected" can be cached for ~30 min).
8. If your domain isn't `nutbox.in`, change `SERVER_ACTIONS_ALLOWED_ORIGINS` in `apphosting.yaml` and push.

## 5. Payments (when ready)

Create the three Razorpay secrets (`nutbox-razorpay-key-id`, `nutbox-razorpay-key-secret`, `nutbox-razorpay-webhook-secret`) with `firebase apphosting:secrets:set`, uncomment the block at the bottom of `apphosting.yaml`, push, and in Razorpay → Webhooks add `https://nutbox.in/api/razorpay/webhook` for `payment.captured` and `order.paid`. Until then checkout offers cash on delivery only (demo payments are off in production).

## Checks after go-live

- `/login` shows no demo-accounts box; `/admin` redirects to login when signed out.
- Place a COD test order to a Tamil Nadu address (CGST+SGST) and one elsewhere (IGST); ship one and open its invoice.
- Response headers include `Strict-Transport-Security`.
