import { ApiError, type Problem } from "@xpredict/api-client";

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // If body is FormData, don't set Content-Type so browser can set it with boundary
  const isFormData = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    let problem: Problem | null = null;
    if (response.status !== 204) {
      problem = (await response.json().catch(() => null)) as Problem | null;
    }
    
    throw new ApiError(
      problem ?? {
        type: "about:blank",
        title: "Error",
        status: response.status,
        detail: "An unexpected error occurred.",
        code: "internal_error",
        trace_id: "",
      },
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}
