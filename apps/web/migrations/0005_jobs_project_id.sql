alter table jobs
  add column project_id uuid references projects(id) on delete cascade;

with candidate as (
  select id,
         case
           when payload->>'projectId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (payload->>'projectId')::uuid
         end as project_id
    from jobs
)
update jobs
   set project_id = candidate.project_id
  from candidate
 where jobs.id = candidate.id
   and exists (select 1 from projects where projects.id = candidate.project_id);

create index jobs_project_idx on jobs (project_id, kind, state);
