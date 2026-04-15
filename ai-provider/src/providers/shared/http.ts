const buildUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

const toHttpErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `HTTP ${response.status} ${response.statusText}`;

  try {
    const responseText = (await response.text()).trim();

    if (!responseText) {
      return fallback;
    }

    return `${fallback}: ${responseText}`;
  } catch {
    return fallback;
  }
};

const requestJson = async <T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  init: RequestInit,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(baseUrl, path), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await toHttpErrorMessage(response));
    }

    return (await response.json()) as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getJson = async <T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<T> => {
  return requestJson<T>(baseUrl, path, timeoutMs, {
    method: 'GET',
    ...init,
  });
};

export const postJson = async <TResponse>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  body: unknown,
  init?: RequestInit,
): Promise<TResponse> =>
  requestJson<TResponse>(baseUrl, path, timeoutMs, {
    method: 'POST',
    ...init,
    body: JSON.stringify(body),
  });
