export interface MappingTemplate {
  method: string
  url: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
  mapping: Record<string, string> // placeholder → "session_rl_key" | csv_column_name
}

export interface LogEntry {
  id: string
  row: number
  status: 'success' | 'error' | 'skipped' | 'dry_run'
  statusCode?: number
  message: string
  timestamp: string
}

export interface RunSummary {
  success: number
  failed: number
  skipped: number
  dryRun: number
}

export interface SavedCurl {
  id: number
  name: string
  curl_command: string
  context: string
  expected_outcome: string
  created_at: string
  last_used_at: string
}

export interface RunRecord {
  id?: number
  curl_name: string
  curl_command: string
  context: string
  expected_outcome: string
  mode: string
  total_rows: number
  succeeded: number
  failed: number
  skipped: number
  dry_run_count: number
  is_dry_run: number // 0 | 1
  created_at: string
}
