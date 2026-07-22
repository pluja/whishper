alter table projects
  add column media_preparation_status text not null default 'not_started',
  add column media_probe jsonb,
  add column media_frame_rate_num integer,
  add column media_frame_rate_den integer,
  add column media_seekable boolean,
  add column media_proxy_recommended boolean,
  add constraint projects_media_preparation_status_check
    check (media_preparation_status in ('not_started', 'queued', 'running', 'completed', 'failed')),
  add constraint projects_media_frame_rate_check
    check (
      (media_frame_rate_num is null and media_frame_rate_den is null)
      or (media_frame_rate_num > 0 and media_frame_rate_den > 0)
    );

create table media_derivatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  kind text not null,
  status text not null default 'ready',
  storage_key text not null,
  source_storage_key text not null,
  media_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  schema_version text not null,
  generator_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_derivatives_kind_check
    check (kind in ('waveform', 'thumbnail', 'proxy')),
  constraint media_derivatives_status_check
    check (status in ('ready', 'failed', 'deleting')),
  constraint media_derivatives_project_kind_unique unique (project_id, kind)
);

create index media_derivatives_project_created_idx
  on media_derivatives(project_id, created_at desc);
