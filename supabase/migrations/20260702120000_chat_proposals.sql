-- Persist proposed agents shown in chat, so a proposal card survives a reload /
-- navigating away (it used to live only in session state and vanish).
alter table public.chat_messages
  add column proposals jsonb not null default '[]'::jsonb;
