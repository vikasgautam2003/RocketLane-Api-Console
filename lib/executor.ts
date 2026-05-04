import { httpFetch } from './tauri-fetch'
import type { MappingTemplate, LogEntry } from '@/types'

function fill(
  value: string,
  row: Record<string, string>,
  rlKey: string,
  mapping: Record<string, string>,
): string {
  return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const mapped = mapping[key]
    if (!mapped) return match
    if (mapped === 'session_rl_key') return rlKey
    return row[mapped] ?? match
  })
}

function fillDeep(
  val: unknown,
  row: Record<string, string>,
  rlKey: string,
  mapping: Record<string, string>,
): unknown {
  if (typeof val === 'string') return fill(val, row, rlKey, mapping)
  if (Array.isArray(val)) return val.map((v) => fillDeep(v, row, rlKey, mapping))
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [
        k,
        fillDeep(v, row, rlKey, mapping),
      ]),
    )
  }
  return val
}

function cleanUrl(url: string): string {
  try {
    const obj = new URL(url)
    const toDelete: string[] = []
    obj.searchParams.forEach((value, key) => {
      if (!value || /^\{\{.+\}\}$/.test(value)) toDelete.push(key)
    })
    toDelete.forEach((key) => obj.searchParams.delete(key))
    return obj.toString()
  } catch {
    return url
  }
}

function isEmpty(v: unknown): boolean {
  return v === '' || v === null || v === undefined || (typeof v === 'string' && /^\{\{.+\}\}$/.test(v))
}

function stripEmptyFields(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(stripEmptyFields)
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>)
        .filter(([, v]) => !isEmpty(v))
        .map(([k, v]) => [k, stripEmptyFields(v)])
    )
  }
  return val
}

export function buildRequest(
  template: MappingTemplate,
  row: Record<string, string>,
  rlKey: string,
) {
  const rawUrl = fill(template.url, row, rlKey, template.mapping)
  const rawBody = template.body ? fillDeep(template.body, row, rlKey, template.mapping) : null
  return {
    method: template.method,
    url: template.method === 'GET' ? cleanUrl(rawUrl) : rawUrl,
    headers: Object.fromEntries(
      Object.entries(template.headers).map(([k, v]) => [
        k,
        fill(v, row, rlKey, template.mapping),
      ]),
    ),
    body: rawBody ? stripEmptyFields(rawBody) : null,
  }
}

export function validateRow(
  template: MappingTemplate,
  row: Record<string, string>,
): string | null {
  // Only require non-empty values for URL path params (before the ?).
  // Body fields and query params are optional — the API will validate them.
  const urlPath = template.url.split('?')[0]
  for (const [placeholder, mapped] of Object.entries(template.mapping)) {
    if (mapped === 'session_rl_key') continue
    if (!urlPath.includes(`{{${placeholder}}}`)) continue
    if (!row[mapped]?.trim()) {
      return `{{${placeholder}}} is empty — column "${mapped}" is blank or missing`
    }
  }
  return null
}

const INTERESTING_KEYS = ['id', 'taskId', 'projectId', 'phaseId', 'name', 'projectName', 'title', 'message', 'email', 'status', 'code']

function summarizeItem(item: unknown): string {
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>
    const pairs = INTERESTING_KEYS
      .filter((k) => obj[k] != null)
      .map((k) => `${k}: ${JSON.stringify(obj[k])}`)
    if (pairs.length > 0) return pairs.slice(0, 4).join('  ·  ')
  }
  return JSON.stringify(item).slice(0, 120)
}

function summarizeBody(text: string): string {
  if (!text.trim()) return 'no body'
  try {
    const json = JSON.parse(text)
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      const pairs = INTERESTING_KEYS
        .filter((k) => (json as Record<string, unknown>)[k] != null)
        .map((k) => `${k}: ${JSON.stringify((json as Record<string, unknown>)[k])}`)
      if (pairs.length > 0) return pairs.slice(0, 4).join('  ·  ')
    }
    return JSON.stringify(json).slice(0, 160)
  } catch {
    return text.slice(0, 160)
  }
}

export async function executeRow(
  template: MappingTemplate,
  row: Record<string, string>,
  rlKey: string,
  dryRun: boolean,
  rowIndex: number,
  onPageFetched?: (pages: number, itemsSoFar: number, total: number | null) => void,
  abortRef?: { current: boolean },
): Promise<LogEntry[]> {
  const id = `${rowIndex}-${Date.now()}`
  const timestamp = new Date().toISOString()
  const one = (e: LogEntry): LogEntry[] => [e]

  const validationError = template.method === 'GET' ? null : validateRow(template, row)
  if (validationError) {
    return one({ id, row: rowIndex, status: 'skipped', message: `SKIPPED — ${validationError}`, timestamp })
  }

  const { method, url, headers, body } = buildRequest(template, row, rlKey)

  if (dryRun) {
    const bodyNote = body ? `\n  Body: ${JSON.stringify(body).slice(0, 80)}` : ''
    return one({ id, row: rowIndex, status: 'dry_run', message: `DRY RUN — ${method} ${url}${bodyNote}`, timestamp })
  }

  try {
    // GET: auto-paginate and expand each item into its own log entry
    if (method === 'GET') {
      const allItems: unknown[] = []
      let currentUrl = (() => {
        try {
          const u = new URL(url)
          if (!u.searchParams.get('pageSize')) u.searchParams.set('pageSize', '100')
          return u.toString()
        } catch { return url }
      })()
      let pages = 0
      let totalRecordCount: number | null = null
      const MAX_PAGES = 200

      let aborted = false
      while (currentUrl && pages < MAX_PAGES) {
        if (abortRef?.current) { aborted = true; break }
        const res = await httpFetch(currentUrl, { method: 'GET', headers })
        const text = await res.text().catch(() => '')
        if (res.status < 200 || res.status >= 300) {
          return one({ id, row: rowIndex, status: 'error', statusCode: res.status, message: `${res.status} — ${summarizeBody(text)}`, timestamp })
        }
        pages++
        try {
          const json = JSON.parse(text)
          if (Array.isArray(json.data)) {
            allItems.push(...json.data)
            const pg = json.pagination ?? {}
            if (pg.totalRecordCount != null) totalRecordCount = pg.totalRecordCount
            onPageFetched?.(pages, allItems.length, totalRecordCount)
            const hasMore = pg.hasMore !== false
            const nextToken = hasMore ? (pg.nextPageToken ?? null) : null
            if (nextToken) {
              const u = new URL(currentUrl)
              u.searchParams.set('pageToken', nextToken)
              currentUrl = u.toString()
              continue
            }
          } else {
            return one({ id, row: rowIndex, status: 'success', statusCode: res.status, message: `${res.status} — ${summarizeBody(text)}`, timestamp })
          }
        } catch {
          return one({ id, row: rowIndex, status: 'success', statusCode: res.status, message: `${res.status} — ${text.slice(0, 160)}`, timestamp })
        }
        break
      }

      if (allItems.length === 0) {
        return one({ id, row: rowIndex, status: aborted ? 'skipped' : 'success', statusCode: 200, message: aborted ? 'ABORTED — 0 items fetched' : '200 — no items returned', timestamp })
      }

      const totalNote = totalRecordCount != null ? ` of ${totalRecordCount} total` : ''
      const abortNote = aborted ? '  ·  stopped early' : ''
      const sample = summarizeItem(allItems[0])

      const EXPAND_LIMIT = 200
      if (allItems.length > EXPAND_LIMIT) {
        return one({
          id, row: rowIndex,
          status: aborted ? 'skipped' : 'success',
          statusCode: 200,
          message: `${aborted ? 'ABORTED' : '200'} — ${allItems.length}${totalNote} items${abortNote}  ·  e.g. ${sample}`,
          timestamp,
          items: allItems,
        })
      }

      // One log entry per item
      return allItems.map((item, i) => ({
        id: `${rowIndex}-${i}-${Date.now()}`,
        row: rowIndex + i,
        status: 'success' as const,
        statusCode: 200,
        message: `200 — ${summarizeItem(item)}`,
        timestamp,
      }))
    }

    const res = await httpFetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })

    const text = await res.text().catch(() => '')

    if (res.status >= 200 && res.status < 300) {
      return one({ id, row: rowIndex, status: 'success', statusCode: res.status, message: `${res.status} — ${summarizeBody(text)}`, timestamp })
    }
    return one({ id, row: rowIndex, status: 'error', statusCode: res.status, message: `${res.status} — ${summarizeBody(text)}`, timestamp })
  } catch (e) {
    return one({ id, row: rowIndex, status: 'error', message: `Network error — ${String(e)}`, timestamp })
  }
}
