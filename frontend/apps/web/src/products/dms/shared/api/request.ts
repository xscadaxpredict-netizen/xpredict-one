import { ApiError, csrfHeaders, type Problem } from "@xpredict/api-client";

const REFRESH_URL = "/api/v1/auth/refresh/";
let inFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(REFRESH_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        ...csrfHeaders("POST"),
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  inFlight ??= refreshSession().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doFetch(url: string, init?: RequestInit): Promise<Response> {
  // If body is FormData, don't set Content-Type so browser can set it with boundary
  const isFormData = init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  for (const [key, value] of Object.entries(csrfHeaders(init?.method))) {
    headers.set(key, value);
  }

  return fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response = await doFetch(url, init);

  if (response.status === 401 && url !== REFRESH_URL && (await refreshOnce())) {
    response = await doFetch(url, init);
  }

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
