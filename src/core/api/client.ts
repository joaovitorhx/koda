import { env } from '@/core/config/env';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
let token: string | null = null;
let onUnauthorized: (() => void) | undefined;
let onRefresh: (() => Promise<string>) | undefined;
let epoch = 0;
let refreshJob: { epoch: number; promise: Promise<string> } | undefined;
export function configureSession(
  accessToken: string | null,
  onExpire?: () => void,
  refresh?: () => Promise<string>,
) {
  epoch++;
  token = accessToken;
  onUnauthorized = onExpire;
  onRefresh = refresh;
  refreshJob = undefined;
}
export async function refreshSession(): Promise<string> {
  const current = epoch;
  if (refreshJob?.epoch === current) return refreshJob.promise;
  if (!onRefresh) throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
  const promise = onRefresh()
    .then((next) => {
      if (epoch !== current) throw new ApiError('Sessão alterada. Entre novamente.', 401);
      token = next;
      return next;
    })
    .catch((error) => {
      if (epoch === current && error instanceof ApiError && [401, 403].includes(error.status))
        onUnauthorized?.();
      throw error;
    })
    .finally(() => {
      if (refreshJob?.epoch === current) refreshJob = undefined;
    });
  refreshJob = { epoch: current, promise };
  return promise;
}
export async function request(
  path: string,
  options: RequestInit = {},
  authenticated = true,
  retry = true,
): Promise<unknown> {
  if (!env.apiUrl)
    throw new ApiError('Configure EXPO_PUBLIC_API_URL no .env.local para acessar a central.');
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new ApiError('Caminho da API inválido.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(cancel, 15000);
  const originalToken = token,
    current = epoch;
  try {
    const response = await fetch(`${env.apiUrl}${path}`, {
      ...options,
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authenticated && originalToken ? { Authorization: `Bearer ${originalToken}` } : {}),
        ...options.headers,
      },
    });
    if (response.status === 401 && authenticated && retry && current === epoch && onRefresh) {
      clearTimeout(timeout);
      if (token === originalToken) await refreshSession();
      if (current !== epoch || options.signal?.aborted)
        throw new ApiError('A requisição foi cancelada.');
      return request(path, options, true, false);
    }
    if (response.status === 401 && authenticated && current === epoch) onUnauthorized?.();
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: authenticated
          ? 'Sua sessão expirou. Entre novamente.'
          : 'Verifique suas credenciais e tente novamente.',
        403: 'Você não tem permissão para esta operação.',
        409: 'O estado da viagem mudou. Atualize a lista e tente novamente.',
        429: 'Muitas tentativas. Aguarde um momento e tente novamente.',
      };
      let message = messages[response.status] ?? 'Não foi possível concluir. Tente novamente.';
      if (response.status !== 401) {
        try {
          const data = await response.json();
          if (typeof data.error === 'string' && data.error.length < 300) message = data.error;
        } catch {}
      }
      throw new ApiError(message, response.status);
    }
    if (authenticated && current !== epoch)
      throw new ApiError('Sessão alterada. A resposta foi descartada.');
    return response.status === 204 ? null : await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? 'O servidor demorou a responder. Tente novamente.'
        : 'Não foi possível conectar. Verifique sua internet.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
