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
