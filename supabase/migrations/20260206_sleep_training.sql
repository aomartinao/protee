-- Migration: Add sleep_entries and training_entries tables for GRRROMODE
-- Also extends user_settings with sleep/training fields

-- ============================================================
-- sleep_entries table
-- ============================================================
create table if not exists sleep_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  sync_id uuid not null,
  date text not null,                       -- YYYY-MM-DD
  duration integer not null,                -- minutes
  bedtime text,                             -- HH:mm
  wake_time text,                           -- HH:mm
  quality text,                             -- 'poor' | 'fair' | 'good' | 'great'
  source text not null default 'manual',    -- 'manual' | 'import'
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  unique(user_id, sync_id)
);

-- Indexes
create index if not exists sleep_entries_user_id_idx on sleep_entries(user_id);
create index if not exists sleep_entries_date_idx on sleep_entries(date);
create index if not exists sleep_entries_user_updated_idx on sleep_entries(user_id, updated_at);

-- RLS
alter table sleep_entries enable row level security;

create policy "Users can view own sleep entries" on sleep_entries
  for select using (auth.uid() = user_id);

create policy "Users can insert own sleep entries" on sleep_entries
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sleep entries" on sleep_entries
  for update using (auth.uid() = user_id);

create policy "Users can delete own sleep entries" on sleep_entries
  for delete using (auth.uid() = user_id);

-- Auto-update timestamp trigger
drop trigger if exists update_sleep_entries_updated_at on sleep_entries;
create trigger update_sleep_entries_updated_at
  before update on sleep_entries
  for each row execute function update_updated_at_column();

-- ============================================================
-- training_entries table
-- ============================================================
create table if not exists training_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  sync_id uuid not null,
  date text not null,                       -- YYYY-MM-DD
  muscle_group text not null,               -- 'push' | 'pull' | 'legs' | 'full_body' | 'cardio' | 'rest' | 'other'
  duration integer,                         -- minutes (optional)
  notes text,
  source text not null default 'manual',    -- 'manual' | 'import'
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  unique(user_id, sync_id)
);

-- Indexes
create index if not exists training_entries_user_id_idx on training_entries(user_id);
create index if not exists training_entries_date_idx on training_entries(date);
create index if not exists training_entries_user_updated_idx on training_entries(user_id, updated_at);

-- RLS
alter table training_entries enable row level security;

create policy "Users can view own training entries" on training_entries
  for select using (auth.uid() = user_id);

create policy "Users can insert own training entries" on training_entries
  for insert with check (auth.uid() = user_id);

create policy "Users can update own training entries" on training_entries
  for update using (auth.uid() = user_id);

create policy "Users can delete own training entries" on training_entries
  for delete using (auth.uid() = user_id);

-- Auto-update timestamp trigger
drop trigger if exists update_training_entries_updated_at on training_entries;
create trigger update_training_entries_updated_at
  before update on training_entries
  for each row execute function update_updated_at_column();

-- ============================================================
-- Extend user_settings with GRRROMODE fields
-- ============================================================
alter table user_settings add column if not exists sleep_goal_minutes integer;
alter table user_settings add column if not exists sleep_tracking_enabled boolean not null default false;
alter table user_settings add column if not exists training_goal_per_week integer;
alter table user_settings add column if not exists training_tracking_enabled boolean not null default false;
alter table user_settings add column if not exists onboarding_completed boolean not null default false;
