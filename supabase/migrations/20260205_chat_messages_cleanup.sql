-- Migration: Chat Messages Cleanup
-- Description: Adds a scheduled job to clean up old chat messages (older than 30 days)
-- This prevents the chat_messages table from growing indefinitely

-- Enable pg_cron extension (if not already enabled)
-- Note: This requires superuser privileges, which Supabase provides
create extension if not exists pg_cron;

-- Grant usage to postgres user (required for Supabase)
grant usage on schema cron to postgres;

-- Function to clean up old chat messages
-- Hard deletes messages older than 30 days (soft-deleted or not)
create or replace function cleanup_old_chat_messages()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  -- Delete messages older than 30 days
  with deleted as (
    delete from chat_messages
    where created_at < now() - interval '30 days'
    returning id
  )
  select count(*) into deleted_count from deleted;

  -- Log the cleanup (optional, helpful for debugging)
  if deleted_count > 0 then
    raise notice 'Chat messages cleanup: deleted % messages older than 30 days', deleted_count;
  end if;

  return deleted_count;
end;
$$;

-- Schedule the cleanup to run daily at 3:00 AM UTC
-- Using pg_cron's cron.schedule function
select cron.schedule(
  'cleanup-old-chat-messages',           -- Job name
  '0 3 * * *',                           -- Cron expression: daily at 3:00 AM UTC
  $$select cleanup_old_chat_messages()$$ -- SQL to execute
);

-- Add a comment for documentation
comment on function cleanup_old_chat_messages() is
  'Deletes chat messages older than 30 days. Runs daily via pg_cron at 3:00 AM UTC.';

-- Note: chat_messages_created_at_idx already exists in the main schema
-- It speeds up the cleanup query by efficiently finding old messages
