-- The tasks.kind check constraint only ever allowed the two original kinds
-- ('content', 'reddit_monitor'), so every specialized agent kind added since
-- (linkedin_post, seo_blog, reddit_post, facebook_post, facebook_dm,
-- email_responder) failed to insert: "Add to my agents" errored with a
-- tasks_kind_check violation. kind is set entirely from our own code, never
-- user input, and the runner treats any unknown kind as a content agent, so a
-- hard enum here only causes an outage every time we ship a new agent type.
-- Drop it and let kind be free text.
alter table public.tasks drop constraint if exists tasks_kind_check;
