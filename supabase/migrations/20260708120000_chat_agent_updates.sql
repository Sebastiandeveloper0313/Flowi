-- Conversational agent editing: the chat can now propose changes to an existing
-- agent (not just create new ones). Those "update cards" persist alongside the
-- message the same way `proposals` do, so they survive a reload.
alter table public.chat_messages
  add column if not exists updates jsonb not null default '[]'::jsonb;
