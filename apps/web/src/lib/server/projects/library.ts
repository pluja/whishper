import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import {
  cues,
  jobs,
  mediaDerivatives,
  mediaUploads,
  memberships,
  projects,
  subtitleTracks,
  transcriptionRuns,
  workspaces,
} from "$lib/server/db/schema";
import type {
  LibrarySearch,
  ProjectSummary,
  WorkspaceSummary,
} from "$lib/shared/library-data";
import {
  PROJECT_SEARCH_MAX_LENGTH,
  PROJECT_TITLE_MAX_LENGTH,
} from "$lib/shared/limits";

export function parseProjectLibrarySearch(
  searchParams: URLSearchParams,
): LibrarySearch {
  return {
    query: (searchParams.get("q") ?? "")
      .trim()
      .slice(0, PROJECT_SEARCH_MAX_LENGTH),
    includeSubtitles: searchParams.get("scope") === "subtitles",
  };
}

export function normalizeProjectTitle(
  value: FormDataEntryValue | null,
): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROJECT_TITLE_MAX_LENGTH);
}

export function primaryWorkspaceForUser(
  executor: Executor,
  userId: string,
): WorkspaceSummary | null {
  const workspace = executor
    .select({
      id: workspaces.id,
      name: workspaces.name,
      projectCount: sql<number>`count(distinct ${projects.id})`,
      readySourceCount: sql<number>`count(distinct case when ${mediaUploads.status} = 'completed' then ${projects.id} end)`,
    })
    .from(workspaces)
    .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
    .leftJoin(projects, eq(projects.workspaceId, workspaces.id))
    .leftJoin(mediaUploads, eq(mediaUploads.projectId, projects.id))
    .where(eq(memberships.userId, userId))
    .groupBy(workspaces.id)
    .orderBy(asc(workspaces.createdAt))
    .limit(1)
    .get();
  return workspace ?? null;
}

type SubtitleSummary = {
  trackCount: number;
  cueCount: number;
  languages: string[];
  updatedAt: Date | null;
  subtitleMatch: boolean;
};

const NO_SUBTITLES: SubtitleSummary = {
  trackCount: 0,
  cueCount: 0,
  languages: [],
  updatedAt: null,
  subtitleMatch: false,
};

function containsFolded(text: string, query: string): boolean {
  return query !== "" && text.toLowerCase().includes(query.toLowerCase());
}

function subtitleSummaries(
  executor: Executor,
  workspaceId: string,
  query: string,
): Map<string, SubtitleSummary> {
  const matches =
    query === ""
      ? sql<number>`0`
      : sql<number>`max(instr(unicode_lower(${cues.text}), unicode_lower(${query})) > 0)`;
  const rows = executor
    .select({
      projectId: subtitleTracks.projectId,
      trackCount: sql<number>`count(distinct ${subtitleTracks.id})`,
      cueCount: sql<number>`count(${cues.id})`,
      languages: sql<
        string | null
      >`group_concat(distinct nullif(${subtitleTracks.language}, ''))`,
      updatedAt: sql<number | null>`max(${subtitleTracks.updatedAt})`,
      subtitleMatch: matches,
    })
    .from(subtitleTracks)
    .innerJoin(projects, eq(projects.id, subtitleTracks.projectId))
    .leftJoin(cues, eq(cues.trackId, subtitleTracks.id))
    .where(eq(projects.workspaceId, workspaceId))
    .groupBy(subtitleTracks.projectId)
    .all();
  return new Map(
    rows.map((row) => [
      row.projectId,
      {
        trackCount: row.trackCount,
        cueCount: row.cueCount,
        languages: (row.languages?.split(",") ?? []).toSorted(),
        updatedAt: row.updatedAt === null ? null : new Date(row.updatedAt),
        subtitleMatch: Boolean(row.subtitleMatch),
      },
    ]),
  );
}

type RunProgress = Pick<
  ProjectSummary,
  "runStatus" | "jobState" | "progress" | "progressMessage"
>;

function latestRunProgress(
  executor: Executor,
  projectIds: string[],
): Map<string, RunProgress> {
  const latestRuns = new Map<string, { id: string; status: string }>();
  for (const run of executor
    .select({
      id: transcriptionRuns.id,
      projectId: transcriptionRuns.projectId,
      status: transcriptionRuns.status,
    })
    .from(transcriptionRuns)
    .where(inArray(transcriptionRuns.projectId, projectIds))
    .orderBy(desc(transcriptionRuns.createdAt), desc(sql`rowid`))
    .all()) {
    if (!latestRuns.has(run.projectId)) latestRuns.set(run.projectId, run);
  }

  const latestJobs = new Map<string, RunProgress>();
  const runIds = [...latestRuns.values()].map((run) => run.id);
  for (const job of executor
    .select({
      runId: jobs.runId,
      state: jobs.state,
      progress: jobs.progress,
      progressMessage: jobs.progressMessage,
    })
    .from(jobs)
    .where(inArray(jobs.runId, runIds))
    .orderBy(desc(jobs.createdAt), desc(sql`rowid`))
    .all()) {
    if (job.runId && !latestJobs.has(job.runId)) {
      latestJobs.set(job.runId, {
        runStatus: null,
        jobState: job.state,
        progress: job.progress,
        progressMessage: job.progressMessage,
      });
    }
  }

  const progress = new Map<string, RunProgress>();
  for (const [projectId, run] of latestRuns) {
    const job = latestJobs.get(run.id);
    progress.set(projectId, {
      runStatus: run.status,
      jobState: job?.jobState ?? null,
      progress: job?.progress ?? null,
      progressMessage: job?.progressMessage ?? null,
    });
  }
  return progress;
}

function thumbnailProjects(executor: Executor, projectIds: string[]) {
  return new Set(
    executor
      .select({ projectId: mediaDerivatives.projectId })
      .from(mediaDerivatives)
      .where(
        and(
          inArray(mediaDerivatives.projectId, projectIds),
          eq(mediaDerivatives.kind, "thumbnail"),
          eq(mediaDerivatives.status, "ready"),
        ),
      )
      .all()
      .map((row) => row.projectId),
  );
}

type ProbeStream = {
  type?: unknown;
  video?: { width?: unknown; height?: unknown; attachedPicture?: unknown };
};

function videoDimensions(probe: Record<string, unknown> | null) {
  const streams = Array.isArray(probe?.streams)
    ? (probe.streams as ProbeStream[])
    : [];
  const video = streams.find(
    (stream) =>
      stream.type === "video" && stream.video?.attachedPicture !== true,
  )?.video;
  return {
    videoWidth: video?.width == null ? null : String(video.width),
    videoHeight: video?.height == null ? null : String(video.height),
  };
}

const NO_RUN: RunProgress = {
  runStatus: null,
  jobState: null,
  progress: null,
  progressMessage: null,
};

export function listLibraryProjects(
  executor: Executor,
  workspaceId: string,
  search: LibrarySearch,
): ProjectSummary[] {
  const rows = executor
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      mediaDurationUs: projects.mediaDurationUs,
      mediaPreparationStatus: projects.mediaPreparationStatus,
      mediaProbe: projects.mediaProbe,
      uploadStatus: mediaUploads.status,
      originalFilename: mediaUploads.originalFilename,
      mediaType: mediaUploads.mediaType,
      sizeBytes: mediaUploads.sizeBytes,
      receivedBytes: mediaUploads.receivedBytes,
    })
    .from(projects)
    .leftJoin(mediaUploads, eq(mediaUploads.projectId, projects.id))
    .where(eq(projects.workspaceId, workspaceId))
    .all();
  const projectIds = rows.map((row) => row.id);
  const subtitles = subtitleSummaries(executor, workspaceId, search.query);
  const runs = latestRunProgress(executor, projectIds);
  const thumbnails = thumbnailProjects(executor, projectIds);

  return rows
    .map(({ mediaProbe, updatedAt, ...row }) => {
      const summary = subtitles.get(row.id) ?? NO_SUBTITLES;
      const activityAt =
        summary.updatedAt && summary.updatedAt > updatedAt
          ? summary.updatedAt
          : updatedAt;
      return {
        ...row,
        ...(runs.get(row.id) ?? NO_RUN),
        ...videoDimensions(mediaProbe),
        activityAt,
        hasThumbnail: thumbnails.has(row.id),
        trackCount: summary.trackCount,
        cueCount: summary.cueCount,
        languages: summary.languages,
        subtitleMatch: summary.subtitleMatch,
      };
    })
    .filter(
      (project) =>
        search.query === "" ||
        containsFolded(project.name, search.query) ||
        (search.includeSubtitles && project.subtitleMatch),
    )
    .toSorted(
      (a, b) =>
        b.activityAt.getTime() - a.activityAt.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
}

export function renameProjectForUser(
  executor: Executor,
  projectId: string,
  userId: string,
  name: string,
): boolean {
  const member = executor
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .innerJoin(projects, eq(projects.workspaceId, memberships.workspaceId))
    .where(and(eq(projects.id, projectId), eq(memberships.userId, userId)))
    .get();
  if (!member) return false;
  executor
    .update(projects)
    .set({ name })
    .where(eq(projects.id, projectId))
    .run();
  return true;
}
