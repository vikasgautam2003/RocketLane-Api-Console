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

export function buildRequest(
  template: MappingTemplate,
  row: Record<string, string>,
  rlKey: string,
) {
  return {
    method: template.method,
    url: fill(template.url, row, rlKey, template.mapping),
    headers: Object.fromEntries(
      Object.entries(template.headers).map(([k, v]) => [
        k,
        fill(v, row, rlKey, template.mapping),
      ]),
    ),
    body: template.body ? fillDeep(template.body, row, rlKey, template.mapping) : null,
  }
}

export function validateRow(
  template: MappingTemplate,
  row: Record<string, string>,
): string | null {
  for (const [placeholder, mapped] of Object.entries(template.mapping)) {
    if (mapped === 'session_rl_key') continue
    if (!row[mapped]?.trim()) {
      return `{{${placeholder}}} is empty — column "${mapped}" is blank or missing`
    }
  }
  return null
}

const INTERESTING_KEYS = ['id', 'taskId', 'projectId', 'name', 'title', 'message', 'email', 'status', 'code']

function summarizeBody(text: string): string {
  if (!text.trim()) return 'no body'
  try {
    const json = JSON.parse(text)
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      const pairs = INTERESTING_KEYS
        .filter((k) => json[k] !== undefined && json[k] !== null)
        .map((k) => `${k}: ${JSON.stringify(json[k])}`)
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
): Promise<LogEntry> {
  const id = `${rowIndex}-${Date.now()}`
  const timestamp = new Date().toISOString()

  const validationError = validateRow(template, row)
  if (validationError) {
    return { id, row: rowIndex, status: 'skipped', message: `SKIPPED — ${validationError}`, timestamp }
  }

  const { method, url, headers, body } = buildRequest(template, row, rlKey)

  if (dryRun) {
    const bodyNote = body ? `\n  Body: ${JSON.stringify(body).slice(0, 80)}` : ''
    return {
      id,
      row: rowIndex,
      status: 'dry_run',
      message: `DRY RUN — ${method} ${url}${bodyNote}`,
      timestamp,
    }
  }

  try {
    const res = await httpFetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })

    const text = await res.text().catch(() => '')

    if (res.status >= 200 && res.status < 300) {
      return {
        id,
        row: rowIndex,
        status: 'success',
        statusCode: res.status,
        message: `${res.status} — ${summarizeBody(text)}`,
        timestamp,
      }
    }
    return {
      id,
      row: rowIndex,
      status: 'error',
      statusCode: res.status,
      message: `${res.status} — ${summarizeBody(text)}`,
      timestamp,
    }
  } catch (e) {
    return {
      id,
      row: rowIndex,
      status: 'error',
      message: `Network error — ${String(e)}`,
      timestamp,
    }
  }
}
