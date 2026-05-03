type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown }

export async function httpFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const w = typeof window !== 'undefined' ? (window as TauriWindow) : null
  if (w?.__TAURI_INTERNALS__) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, init) as unknown as Response
  }
  return fetch(url, init)
}
