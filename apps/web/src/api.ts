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

export async function getStatus(): Promise<StatusResponse> {
  return api<StatusResponse>("/api/notion/status");
}

export async function inspectManuscript(notionUrlOrId: string): Promise<InspectionResponse> {
  return api<InspectionResponse>("/api/manuscripts/inspect", "POST", { notionUrlOrId });
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
  return api<Manuscript>("/api/manuscripts", "POST", input);
}

export async function syncManuscript(id: string): Promise<Stats> {
  return api<Stats>(`/api/manuscripts/${id}/sync`, "POST");
}

export async function read<T>(promise: Promise<Response>): Promise<T> {
  const response = await promise;
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("wordsmith-sign-in-required"));
    throw new Error(
      body.error?.message ??
        (typeof body.error === "string" ? body.error : "Wordsmith request failed."),
    );
  }
  return body as T;
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return read<T>(
    fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(["GET", "HEAD"].includes(method) ? {} : { "X-Wordsmith-Request": "1" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
