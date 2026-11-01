# Apartment Management System

A beginner-friendly Capstone 1 starter using Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase Auth, PostgreSQL, and Row Level Security.

## Included modules

- Admin dashboard
- Tenant dashboard
- Apartment unit management
- Tenant records and admin-created tenant login accounts
- Monthly rent billing and manual payment recording
- Maintenance request monitoring and status updates
- Seven main application tables plus an optional security helper function
- SQL schema and RLS policies

## Requirements

- Node.js 20.9 or newer (Node.js 22 LTS recommended)
- npm
- A Supabase project

## 1. Install packages

From the project folder:

```bash
npm install
```

## 2. Configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Copy all of `supabase/schema.sql` into the editor and run it.
4. Open **Project Settings → API** (or the API Keys page).
5. Copy the project URL and publishable/anon key into `.env.local`.
6. Copy the service-role/secret key into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` only. Never expose this key in client code or commit it.
7. Restart the dev server after changing environment variables.

Create `.env.local` by copying `.env.example`. Do not commit `.env.local`.

## 3. Create your first admin

1. In Supabase, open **Authentication → Users** and create a user with an email and password.
2. The SQL trigger creates a matching profile with role `tenant` by default.
3. In the SQL Editor, run this, replacing the email:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

Sign in through `/login`.

## 4. Create tenant accounts

Use the admin dashboard's **Create tenant** form. It creates the Supabase Auth account on the server and links it to the tenant record. Tenant accounts are created with a temporary password entered by the admin; share it securely and ask the tenant to change it after first login. For a real deployment, add a password-reset/forced-change flow.

## 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000.

## Important design notes

- Admin-created accounts use a server-only service key. Keep it private.
- RLS policies protect tenant records. The app also checks roles server-side.
- Tenants can view their own unit, bills, payments, and maintenance requests.
- Bills are generated manually by the admin. Payments are manually recorded against one bill.
- The current version assumes one active tenant per unit and one rent bill per tenant per month.
- For a real deployment, add stricter input validation, audit logs, rate limiting, receipt printing, automated tests, backups, and a forced password change flow.
- Run `npm run build` before defense and test using a separate admin account and tenant account.

## Existing project warning

If you are merging into an existing Next.js project, do not overwrite your current `package.json`, `tsconfig.json`, `next.config.ts`, or CSS setup without checking them. Copy the `app`, `components`, `lib`, `supabase`, and `proxy.ts` files, then merge dependency entries as needed.
