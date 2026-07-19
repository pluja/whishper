create table media_uploads (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null unique references projects(id) on delete cascade,
  created_by text not null references auth_users(id),
  original_filename text not null,
  media_type text,
  size_bytes bigint not null check (size_bytes > 0),
  received_bytes bigint not null default 0 check (received_bytes >= 0 and received_bytes <= size_bytes),
  status text not null default 'uploading' check (status in ('uploading', 'finalizing', 'completed', 'cancelled', 'failed')),
  storage_key text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index media_uploads_workspace_created_idx on media_uploads(workspace_id, created_at);
create index media_uploads_status_idx on media_uploads(status, updated_at);
