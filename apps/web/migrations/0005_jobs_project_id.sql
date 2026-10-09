alter table jobs
  add column project_id uuid references projects(id) on delete cascade;

update jobs
   set project_id = (payload->>'projectId')::uuid
 where payload->>'projectId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (
     select 1 from projects where projects.id = (jobs.payload->>'projectId')::uuid
   );

create index jobs_project_idx on jobs (project_id, kind, state);
