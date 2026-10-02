import type { Manuscript, Stats } from "@wordsmith/shared";

export type StatusResponse = Record<string, unknown>;
export type InspectionResponse = {
  name: string;
  notionRootId: string;
  notionRootType: "page" | "database";
  totalWords: number;
  sources: Array<{
    notionPageId: string;
    title: string;
    included: boolean;
    sortOrder: number | null;
    wordCount: number;
  }>;
};

const jsonHeaders = { "Content-Type": "application/json" };

export async function getStatus(): Promise<StatusResponse> {
  return read<StatusResponse>(fetch("/api/notion/status"));
}

export async function inspectManuscript(notionUrlOrId: string): Promise<InspectionResponse> {
  return read<InspectionResponse>(
    fetch("/api/manuscripts/inspect", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ notionUrlOrId }),
    }),
  );
}

export async function createManuscript(input: {
  name: string;
  notionRootId: string;
  notionRootType: "page" | "database";
  sources: Array<{
    notionPageId: string;
    title: string;
    included: boolean;
    sortOrder: number | null;
  }>;
}): Promise<Manuscript> {
  return read<Manuscript>(
    fetch("/api/manuscripts", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }),
  );
}

export async function syncManuscript(id: string): Promise<Stats> {
  return read<Stats>(fetch(`/api/manuscripts/${id}/sync`, { method: "POST" }));
}

export async function read<T>(promise: Promise<Response>): Promise<T> {
  const response = await promise;
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Wordsmith request failed.");
  }
  return body as T;
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return read<T>(
    fetch(path, {
      method,
      headers: body === undefined ? undefined : jsonHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
