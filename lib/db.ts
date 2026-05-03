/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SavedCurl, RunRecord } from '@/types'

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown }

function isTauri() {
  return typeof window !== 'undefined' && !!(window as TauriWindow).__TAURI_INTERNALS__
}

let _db: any = null

async function getDb(): Promise<any> {
  if (!isTauri()) return null
  if (_db) return _db
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    _db = await Database.load('sqlite:console.db')
    return _db
  } catch {
    return null
  }
}

export async function initDb(): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.execute(`
    CREATE TABLE IF NOT EXISTS saved_curls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      curl_command TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      expected_outcome TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curl_name TEXT NOT NULL,
      curl_command TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      expected_outcome TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      succeeded INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      dry_run_count INTEGER NOT NULL DEFAULT 0,
      is_dry_run INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `)
}

export async function getSavedCurls(): Promise<SavedCurl[]> {
  const db = await getDb()
  if (!db) return []
  return db.select('SELECT * FROM saved_curls ORDER BY last_used_at DESC') as Promise<SavedCurl[]>
}

export async function saveCurl(
  name: string,
  curlCommand: string,
  context: string,
  expectedOutcome: string,
): Promise<void> {
  const db = await getDb()
  if (!db) return
  const now = new Date().toISOString()
  await db.execute(
    `INSERT OR REPLACE INTO saved_curls (name, curl_command, context, expected_outcome, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, curlCommand, context, expectedOutcome, now, now],
  )
}

export async function deleteSavedCurl(id: number): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.execute('DELETE FROM saved_curls WHERE id = ?', [id])
}

export async function touchCurl(id: number): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.execute('UPDATE saved_curls SET last_used_at = ? WHERE id = ?', [
    new Date().toISOString(),
    id,
  ])
}

export async function saveRun(run: Omit<RunRecord, 'id'>): Promise<void> {
  const db = await getDb()
  if (!db) return
  await db.execute(
    `INSERT INTO runs
      (curl_name, curl_command, context, expected_outcome, mode, total_rows,
       succeeded, failed, skipped, dry_run_count, is_dry_run, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.curl_name, run.curl_command, run.context, run.expected_outcome,
      run.mode, run.total_rows, run.succeeded, run.failed,
      run.skipped, run.dry_run_count, run.is_dry_run, run.created_at,
    ],
  )
}

export async function getRuns(limit = 100): Promise<RunRecord[]> {
  const db = await getDb()
  if (!db) return []
  return db.select(
    'SELECT * FROM runs ORDER BY created_at DESC LIMIT ?',
    [limit],
  ) as Promise<RunRecord[]>
}
