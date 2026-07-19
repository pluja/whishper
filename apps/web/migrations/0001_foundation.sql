create table auth_users (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth_sessions (
  id text primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references auth_users(id) on delete cascade
);
create index auth_sessions_user_id_idx on auth_sessions(user_id);

create table auth_accounts (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references auth_users(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_accounts_user_id_idx on auth_accounts(user_id);

create table auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_verifications_identifier_idx on auth_verifications(identifier);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table memberships (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null references auth_users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_user_id_idx on memberships(user_id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  media_original_key text,
  media_filename text,
  media_duration_us bigint check (media_duration_us is null or media_duration_us >= 0),
  created_by text not null references auth_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_created_idx on projects(workspace_id, created_at);

create table transcription_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  adapter_id text not null,
  model_id text not null,
  options jsonb not null default '{}'::jsonb,
  created_by text not null references auth_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index transcription_runs_project_created_idx on transcription_runs(project_id, created_at);

create table workers (
  id uuid primary key,
  name text not null,
  version text not null,
  architecture text not null,
  protocol_version text not null,
  manifest jsonb not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_id uuid references transcription_runs(id) on delete cascade,
  kind text not null,
  state text not null default 'queued' check (state in ('queued', 'leased', 'completed', 'failed', 'cancelled')),
  priority integer not null default 0,
  payload jsonb not null,
  result jsonb,
  error jsonb,
  progress double precision not null default 0 check (progress >= 0 and progress <= 1),
  progress_message text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  leased_by uuid references workers(id) on delete set null,
  lease_token_hash text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index jobs_lease_idx on jobs(state, available_at, priority, created_at);
create index jobs_run_idx on jobs(run_id);

create table subtitle_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_run_id uuid references transcription_runs(id) on delete set null,
  name text not null,
  language text not null,
  kind text not null default 'transcription',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subtitle_tracks_project_idx on subtitle_tracks(project_id);

create table cues (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references subtitle_tracks(id) on delete cascade,
  position integer not null,
  start_us bigint not null,
  end_us bigint not null,
  text text not null,
  words jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cues_timing_check check (start_us >= 0 and end_us >= start_us),
  constraint cues_track_position_idx unique (track_id, position)
);
