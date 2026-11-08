-- ============================================================
-- Vivaha — Supabase security setup (safe to run again and again)
-- Run in: Supabase -> SQL Editor -> paste all -> Run
-- Use this after restoring the database from a backup / new project.
-- ============================================================

-- 1) Row Level Security ON for every table
alter table public.audit_logs          enable row level security;
alter table public.blocked_users       enable row level security;
alter table public.boost_history       enable row level security;
alter table public.communities         enable row level security;
alter table public.contact_requests    enable row level security;
alter table public.core_fields_config  enable row level security;
alter table public.interests           enable row level security;
alter table public.membership_plans    enable row level security;
alter table public.messages            enable row level security;
alter table public.notification_log    enable row level security;
alter table public.notifications       enable row level security;
alter table public.photo_requests      enable row level security;
alter table public.profile_views       enable row level security;
alter table public.registration_fields enable row level security;
alter table public.reports             enable row level security;
alter table public.shortlists          enable row level security;
alter table public.site_settings       enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.success_stories     enable row level security;
alter table public.typing_status       enable row level security;
alter table public.user_categories     enable row level security;
alter table public.user_photos         enable row level security;
alter table public.users               enable row level security;

-- 2) Policies (the backend uses the service key, so only these small policies are needed)
-- users: a logged-in user can read ONLY their own row. No insert / update / delete from the browser.
drop policy if exists "users read own row"        on public.users;
drop policy if exists "users_select_own_only"     on public.users;
drop policy if exists "users_insert_own"          on public.users;   -- removed on purpose (privilege escalation risk)
drop policy if exists "n8n read only"             on public.users;   -- removed on purpose (re-create a limited view when n8n is needed)
create policy "users_select_own_only" on public.users
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Users can view own blocks"   on public.blocked_users;
drop policy if exists "Users can insert own blocks" on public.blocked_users;
drop policy if exists "Users can delete own blocks" on public.blocked_users;
create policy "Users can view own blocks"   on public.blocked_users for select using (auth.uid() = blocker_id or auth.uid() = blocked_id);
create policy "Users can insert own blocks" on public.blocked_users for insert with check (auth.uid() = blocker_id);
create policy "Users can delete own blocks" on public.blocked_users for delete using (auth.uid() = blocker_id);

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications" on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "Allow read for owner" on public.profile_views;
create policy "Allow read for owner" on public.profile_views for select using (auth.uid() = viewed_id);

-- 3) Not-logged-in visitors (anon) get NO table access at all
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- 4) Photo bucket: max 5 MB, images only
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'avatars';

-- ============================================================
-- Checks (should look like this):
--   select table_name from information_schema.role_table_grants where grantee='anon' and table_schema='public';   -> 0 rows
--   select tablename, rowsecurity from pg_tables where schemaname='public';                                      -> all true
-- ============================================================
