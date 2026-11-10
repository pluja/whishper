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
import { projectForUser } from "$lib/server/projects/access";
import { IDLE_BEFORE_RETRY_MS } from "$lib/server/uploads/maintenance";
import type {
  LibrarySearch,
  ProjectSummary,
  WorkspaceSummary,
} from "$lib/shared/library-data";
import {
  PROJECT_SEARCH_MAX_LENGTH,
  PROJECT_TITLE_MAX_LENGTH,
} from "$lib/shared/limits";
import type {
  LibraryUploadStatus,
  RunStatus,
  UploadStatus,
} from "$lib/shared/project-status";
import { matchesSearch, normalizeSearchText } from "$lib/shared/search";

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

function latestSubtitleEdits(
  executor: Executor,
  workspaceId: string,
): Map<string, Date> {
  const rows = executor
    .select({
      projectId: subtitleTracks.projectId,
      updatedAt: sql<number>`max(${subtitleTracks.updatedAt})`,
    })
    .from(subtitleTracks)
    .innerJoin(projects, eq(projects.id, subtitleTracks.projectId))
    .where(eq(projects.workspaceId, workspaceId))
    .groupBy(subtitleTracks.projectId)
    .all();
  return new Map(rows.map((row) => [row.projectId, new Date(row.updatedAt)]));
}

function projectsWithSubtitleText(
  executor: Executor,
  workspaceId: string,
  query: string,
): Set<string> {
  const rows = executor
    .selectDistinct({ projectId: subtitleTracks.projectId })
    .from(cues)
    .innerJoin(subtitleTracks, eq(subtitleTracks.id, cues.trackId))
    .innerJoin(projects, eq(projects.id, subtitleTracks.projectId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        sql`instr(search_text(${cues.text}), ${normalizeSearchText(query)}) > 0`,
      ),
    )
    .all();
  return new Set(rows.map((row) => row.projectId));
}

type RunProgress = Pick<
  ProjectSummary,
  "runStatus" | "jobState" | "progress" | "progressMessage"
>;

function latestRunProgress(
  executor: Executor,
  projectIds: string[],
): Map<string, RunProgress> {
  const latestRuns = new Map<string, { id: string; status: RunStatus }>();
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

// The sweep treats an upload this idle as abandoned by its client too.
function libraryUploadStatus(
  status: UploadStatus | null,
  updatedAt: Date | null,
  now: Date,
): LibraryUploadStatus | null {
  const idle =
    updatedAt !== null &&
    now.getTime() - updatedAt.getTime() >= IDLE_BEFORE_RETRY_MS;
  return status === "uploading" && idle ? "paused" : status;
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
  now = new Date(),
): ProjectSummary[] {
  const rows = executor
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      mediaDurationUs: projects.mediaDurationUs,
      mediaPreparationStatus: projects.mediaPreparationStatus,
      uploadStatus: mediaUploads.status,
      uploadUpdatedAt: mediaUploads.updatedAt,
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
  const subtitleEdits = latestSubtitleEdits(executor, workspaceId);
  const subtitleMatches =
    search.includeSubtitles && search.query !== ""
      ? projectsWithSubtitleText(executor, workspaceId, search.query)
      : new Set<string>();
  const runs = latestRunProgress(executor, projectIds);
  const thumbnails = thumbnailProjects(executor, projectIds);

  return rows
    .map(({ updatedAt, uploadUpdatedAt, ...row }) => {
      const subtitleEdit = subtitleEdits.get(row.id);
      const activityAt =
        subtitleEdit && subtitleEdit > updatedAt ? subtitleEdit : updatedAt;
      return {
        ...row,
        ...(runs.get(row.id) ?? NO_RUN),
        uploadStatus: libraryUploadStatus(
          row.uploadStatus,
          uploadUpdatedAt,
          now,
        ),
        activityAt,
        hasThumbnail: thumbnails.has(row.id),
        subtitleMatch: subtitleMatches.has(row.id),
      };
    })
    .filter(
      (project) =>
        project.subtitleMatch || matchesSearch(search.query, [project.name]),
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
  if (!projectForUser(executor, projectId, userId)) return false;
  executor
    .update(projects)
    .set({ name })
    .where(eq(projects.id, projectId))
    .run();
  return true;
}
