alter table subtitle_tracks
  add column revision bigint not null default 0,
  add constraint subtitle_tracks_revision_check check (revision >= 0);

