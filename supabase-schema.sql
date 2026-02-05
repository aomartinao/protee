-- Protee Database Schema for Supabase (v2 - with proper sync support)
-- Run this in the Supabase SQL Editor to set up your database
--
-- IMPORTANT: If upgrading from v1, run the migration section at the bottom

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Drop existing tables if starting fresh (comment out if upgrading)
-- drop table if exists food_entries cascade;
-- drop table if exists user_settings cascade;

-- Food entries table with sync support
create table if not exists food_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  sync_id uuid not null,                    -- Unique ID for sync across devices
  date text not null,
  source text not null,
  food_name text not null,
  protein integer not null,
  calories integer,
  confidence text not null,
  image_data text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,       -- Soft delete (null = not deleted)

  -- Unique constraint: one sync_id per user
  unique(user_id, sync_id)
);

-- User settings table
create table if not exists user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users unique not null,
  default_goal integer not null default 150,
  calorie_goal integer,
  calorie_tracking_enabled boolean not null default false,
  theme text not null default 'system',
  claude_api_key text,
  updated_at timestamp with time zone not null default now()
);

-- Daily goals table for syncing goals across devices
create table if not exists daily_goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  sync_id uuid not null,
  date text not null,
  goal integer not null,
  calorie_goal integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  unique(user_id, sync_id)
);

-- Chat messages table for syncing chat history across devices
create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  sync_id uuid not null,                    -- Unique ID for sync across devices
  type text not null,                       -- 'user', 'assistant', or 'system'
  content text not null,
  food_entry_sync_id uuid,                  -- Link to confirmed food entry (optional)
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,      -- Soft delete (null = not deleted)

  -- Unique constraint: one sync_id per user
  unique(user_id, sync_id)
);

-- Indexes for efficient sync queries
create index if not exists food_entries_user_id_idx on food_entries(user_id);
create index if not exists food_entries_sync_id_idx on food_entries(sync_id);
create index if not exists food_entries_user_updated_idx on food_entries(user_id, updated_at);
create index if not exists food_entries_date_idx on food_entries(date);

create index if not exists daily_goals_user_id_idx on daily_goals(user_id);
create index if not exists daily_goals_sync_id_idx on daily_goals(sync_id);
create index if not exists daily_goals_user_updated_idx on daily_goals(user_id, updated_at);
create index if not exists daily_goals_date_idx on daily_goals(date);

create index if not exists chat_messages_user_id_idx on chat_messages(user_id);
create index if not exists chat_messages_sync_id_idx on chat_messages(sync_id);
create index if not exists chat_messages_user_updated_idx on chat_messages(user_id, updated_at);
create index if not exists chat_messages_created_at_idx on chat_messages(created_at);

-- Row Level Security (RLS) policies
alter table food_entries enable row level security;
alter table user_settings enable row level security;
alter table daily_goals enable row level security;
alter table chat_messages enable row level security;

-- Drop existing policies if they exist (for clean upgrade)
drop policy if exists "Users can view own entries" on food_entries;
drop policy if exists "Users can insert own entries" on food_entries;
drop policy if exists "Users can update own entries" on food_entries;
drop policy if exists "Users can delete own entries" on food_entries;
drop policy if exists "Users can view own settings" on user_settings;
drop policy if exists "Users can insert own settings" on user_settings;
drop policy if exists "Users can update own settings" on user_settings;

-- Food entries policies
create policy "Users can view own entries" on food_entries
  for select using (auth.uid() = user_id);

create policy "Users can insert own entries" on food_entries
  for insert with check (auth.uid() = user_id);

create policy "Users can update own entries" on food_entries
  for update using (auth.uid() = user_id);

create policy "Users can delete own entries" on food_entries
  for delete using (auth.uid() = user_id);

-- User settings policies
create policy "Users can view own settings" on user_settings
  for select using (auth.uid() = user_id);

create policy "Users can insert own settings" on user_settings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own settings" on user_settings
  for update using (auth.uid() = user_id);

-- Daily goals policies
drop policy if exists "Users can view own goals" on daily_goals;
drop policy if exists "Users can insert own goals" on daily_goals;
drop policy if exists "Users can update own goals" on daily_goals;
drop policy if exists "Users can delete own goals" on daily_goals;

create policy "Users can view own goals" on daily_goals
  for select using (auth.uid() = user_id);

create policy "Users can insert own goals" on daily_goals
  for insert with check (auth.uid() = user_id);

create policy "Users can update own goals" on daily_goals
  for update using (auth.uid() = user_id);

create policy "Users can delete own goals" on daily_goals
  for delete using (auth.uid() = user_id);

-- Chat messages policies
drop policy if exists "Users can view own messages" on chat_messages;
drop policy if exists "Users can insert own messages" on chat_messages;
drop policy if exists "Users can update own messages" on chat_messages;
drop policy if exists "Users can delete own messages" on chat_messages;

create policy "Users can view own messages" on chat_messages
  for select using (auth.uid() = user_id);

create policy "Users can insert own messages" on chat_messages
  for insert with check (auth.uid() = user_id);

create policy "Users can update own messages" on chat_messages
  for update using (auth.uid() = user_id);

create policy "Users can delete own messages" on chat_messages
  for delete using (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers to auto-update updated_at
drop trigger if exists update_food_entries_updated_at on food_entries;
create trigger update_food_entries_updated_at
  before update on food_entries
  for each row execute function update_updated_at_column();

drop trigger if exists update_user_settings_updated_at on user_settings;
create trigger update_user_settings_updated_at
  before update on user_settings
  for each row execute function update_updated_at_column();

drop trigger if exists update_daily_goals_updated_at on daily_goals;
create trigger update_daily_goals_updated_at
  before update on daily_goals
  for each row execute function update_updated_at_column();

drop trigger if exists update_chat_messages_updated_at on chat_messages;
create trigger update_chat_messages_updated_at
  before update on chat_messages
  for each row execute function update_updated_at_column();


-- ============================================
-- MIGRATION FROM V1 (if upgrading)
-- Run this section if you have existing data
-- ============================================

-- Add sync_id column if it doesn't exist
-- alter table food_entries add column if not exists sync_id uuid;
-- alter table food_entries add column if not exists deleted_at timestamp with time zone;

-- Generate sync_ids for existing entries that don't have one
-- update food_entries set sync_id = uuid_generate_v4() where sync_id is null;

-- Make sync_id not null after populating
-- alter table food_entries alter column sync_id set not null;

-- Add unique constraint
-- alter table food_entries add constraint food_entries_user_sync_unique unique(user_id, sync_id);


-- ============================================
-- MIGRATION FROM V2 TO V3 (adding chat_messages)
-- Run this section if you already have v2 schema
-- ============================================

-- Create chat_messages table (run this if upgrading from v2)
/*
create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  sync_id uuid not null,
  type text not null,
  content text not null,
  food_entry_sync_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  unique(user_id, sync_id)
);

create index if not exists chat_messages_user_id_idx on chat_messages(user_id);
create index if not exists chat_messages_sync_id_idx on chat_messages(sync_id);
create index if not exists chat_messages_user_updated_idx on chat_messages(user_id, updated_at);
create index if not exists chat_messages_created_at_idx on chat_messages(created_at);

alter table chat_messages enable row level security;

create policy "Users can view own messages" on chat_messages
  for select using (auth.uid() = user_id);

create policy "Users can insert own messages" on chat_messages
  for insert with check (auth.uid() = user_id);

create policy "Users can update own messages" on chat_messages
  for update using (auth.uid() = user_id);

create policy "Users can delete own messages" on chat_messages
  for delete using (auth.uid() = user_id);

create trigger update_chat_messages_updated_at
  before update on chat_messages
  for each row execute function update_updated_at_column();
*/


-- ============================================
-- ADMIN DASHBOARD & API KEY MANAGEMENT (V4)
-- ============================================

-- Enable vault extension for secure API key storage
create extension if not exists "supabase_vault" with schema vault;

-- Admin users table (users who can access the admin dashboard)
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(user_id)
);

-- Admin-provided API keys (actual key stored in vault.secrets)
-- This table links users to their admin-provided API key in the vault
create table if not exists admin_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vault_secret_id uuid not null,  -- Reference to vault.secrets
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid references auth.users(id),  -- Which admin added it
  unique(user_id)
);

-- Usage tracking for admin dashboard
create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null,  -- 'food_analysis', 'advisor', 'menu_analysis'
  tokens_in integer,
  tokens_out integer,
  model text,
  created_at timestamp with time zone default now()
);

-- Indexes for admin tables
create index if not exists admin_users_user_id_idx on admin_users(user_id);
create index if not exists admin_api_keys_user_id_idx on admin_api_keys(user_id);
create index if not exists admin_api_keys_vault_secret_id_idx on admin_api_keys(vault_secret_id);
create index if not exists api_usage_user_id_idx on api_usage(user_id);
create index if not exists api_usage_created_at_idx on api_usage(created_at);
create index if not exists api_usage_request_type_idx on api_usage(request_type);

-- Enable RLS on admin tables
alter table admin_users enable row level security;
alter table admin_api_keys enable row level security;
alter table api_usage enable row level security;

-- Drop existing admin policies if they exist
drop policy if exists "Admins can view admin_users" on admin_users;
drop policy if exists "Admins can insert admin_users" on admin_users;
drop policy if exists "Admins can delete admin_users" on admin_users;
drop policy if exists "Admins can view admin_api_keys" on admin_api_keys;
drop policy if exists "Admins can insert admin_api_keys" on admin_api_keys;
drop policy if exists "Admins can update admin_api_keys" on admin_api_keys;
drop policy if exists "Admins can delete admin_api_keys" on admin_api_keys;
drop policy if exists "Admins can view all api_usage" on api_usage;
drop policy if exists "Service role can insert api_usage" on api_usage;
drop policy if exists "Users can view own api_usage" on api_usage;

-- Admin users policies: only admins can read/write
create policy "Admins can view admin_users" on admin_users
  for select using (
    auth.uid() in (select user_id from admin_users)
  );

create policy "Admins can insert admin_users" on admin_users
  for insert with check (
    auth.uid() in (select user_id from admin_users)
  );

create policy "Admins can delete admin_users" on admin_users
  for delete using (
    auth.uid() in (select user_id from admin_users)
  );

-- Admin API keys policies: only admins can manage
create policy "Admins can view admin_api_keys" on admin_api_keys
  for select using (
    auth.uid() in (select user_id from admin_users)
  );

create policy "Admins can insert admin_api_keys" on admin_api_keys
  for insert with check (
    auth.uid() in (select user_id from admin_users)
  );

create policy "Admins can update admin_api_keys" on admin_api_keys
  for update using (
    auth.uid() in (select user_id from admin_users)
  );

create policy "Admins can delete admin_api_keys" on admin_api_keys
  for delete using (
    auth.uid() in (select user_id from admin_users)
  );

-- API usage policies: admins can view all, users can view own
create policy "Admins can view all api_usage" on api_usage
  for select using (
    auth.uid() in (select user_id from admin_users)
  );

create policy "Users can view own api_usage" on api_usage
  for select using (
    auth.uid() = user_id
  );

-- Service role can insert usage (from Edge Function)
-- Note: Edge Functions use service role key which bypasses RLS
-- But we add this policy for completeness
create policy "Service role can insert api_usage" on api_usage
  for insert with check (true);

-- Trigger for admin_api_keys updated_at
drop trigger if exists update_admin_api_keys_updated_at on admin_api_keys;
create trigger update_admin_api_keys_updated_at
  before update on admin_api_keys
  for each row execute function update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS FOR ADMIN OPERATIONS
-- ============================================

-- Function to check if a user has an active admin API key
-- This is safe to call from client as it doesn't expose the key
create or replace function has_admin_api_key(target_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from admin_api_keys
    where user_id = target_user_id
    and is_active = true
  );
end;
$$ language plpgsql security definer;

-- Function for admins to add an API key for a user
-- The key is stored in vault.secrets and only the reference is kept
create or replace function admin_add_api_key(
  target_user_id uuid,
  api_key text
)
returns uuid as $$
declare
  secret_id uuid;
  key_id uuid;
begin
  -- Verify caller is admin
  if not exists (select 1 from admin_users where user_id = auth.uid()) then
    raise exception 'Unauthorized: Only admins can add API keys';
  end if;

  -- Delete existing key if any
  delete from admin_api_keys where user_id = target_user_id;

  -- Store key in vault
  insert into vault.secrets (secret, name, description)
  values (
    api_key,
    'anthropic_key_' || target_user_id::text,
    'Anthropic API key for user ' || target_user_id::text
  )
  returning id into secret_id;

  -- Create link record
  insert into admin_api_keys (user_id, vault_secret_id, created_by)
  values (target_user_id, secret_id, auth.uid())
  returning id into key_id;

  return key_id;
end;
$$ language plpgsql security definer;

-- Function for admins to revoke an API key
create or replace function admin_revoke_api_key(target_user_id uuid)
returns boolean as $$
declare
  secret_id uuid;
begin
  -- Verify caller is admin
  if not exists (select 1 from admin_users where user_id = auth.uid()) then
    raise exception 'Unauthorized: Only admins can revoke API keys';
  end if;

  -- Get the vault secret id
  select vault_secret_id into secret_id
  from admin_api_keys
  where user_id = target_user_id;

  if secret_id is null then
    return false;
  end if;

  -- Delete from admin_api_keys
  delete from admin_api_keys where user_id = target_user_id;

  -- Delete from vault
  delete from vault.secrets where id = secret_id;

  return true;
end;
$$ language plpgsql security definer;

-- Function to get decrypted API key (only callable by service role in Edge Function)
-- This uses the decrypted_secrets view which requires service role
create or replace function get_admin_api_key_for_user(target_user_id uuid)
returns text as $$
declare
  api_key text;
begin
  select ds.decrypted_secret into api_key
  from admin_api_keys aak
  join vault.decrypted_secrets ds on ds.id = aak.vault_secret_id
  where aak.user_id = target_user_id
  and aak.is_active = true;

  return api_key;
end;
$$ language plpgsql security definer;

-- ============================================
-- VIEWS FOR ADMIN DASHBOARD
-- ============================================

-- View for user stats (only accessible by admins via RLS on underlying tables)
create or replace view user_stats as
select
  u.id as user_id,
  u.email,
  u.created_at as signed_up_at,
  u.last_sign_in_at,
  (select count(*) from food_entries fe where fe.user_id = u.id and fe.deleted_at is null) as food_entries_count,
  (select count(*) from chat_messages cm where cm.user_id = u.id and cm.deleted_at is null) as chat_messages_count,
  (select count(*) from api_usage au where au.user_id = u.id) as api_requests_count,
  (select max(created_at) from api_usage au where au.user_id = u.id) as last_api_request,
  exists(select 1 from admin_api_keys aak where aak.user_id = u.id and aak.is_active = true) as has_admin_key
from auth.users u;

-- Grant access to the view for authenticated users (RLS will filter)
grant select on user_stats to authenticated;

-- ============================================
-- INITIAL ADMIN SETUP
-- Run this once to set up the first admin
-- ============================================

-- Insert the initial admin (martin.holecko@gmail.com)
-- This needs to be run after the user has signed up
/*
insert into admin_users (user_id)
select id from auth.users where email = 'martin.holecko@gmail.com'
on conflict (user_id) do nothing;
*/

-- ============================================
-- SCHEDULED CLEANUP
-- Cleans up old chat messages to prevent bloat
-- ============================================

-- Enable pg_cron extension for scheduled jobs
create extension if not exists pg_cron;
grant usage on schema cron to postgres;

-- Function to clean up old chat messages (older than 30 days)
create or replace function cleanup_old_chat_messages()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  with deleted as (
    delete from chat_messages
    where created_at < now() - interval '30 days'
    returning id
  )
  select count(*) into deleted_count from deleted;

  if deleted_count > 0 then
    raise notice 'Chat messages cleanup: deleted % messages older than 30 days', deleted_count;
  end if;

  return deleted_count;
end;
$$;

comment on function cleanup_old_chat_messages() is
  'Deletes chat messages older than 30 days. Runs daily via pg_cron at 3:00 AM UTC.';

-- Schedule cleanup to run daily at 3:00 AM UTC
select cron.schedule(
  'cleanup-old-chat-messages',
  '0 3 * * *',
  $$select cleanup_old_chat_messages()$$
);
