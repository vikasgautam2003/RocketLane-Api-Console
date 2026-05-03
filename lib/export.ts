export function downloadCSV(filename: string, data: Array<Record<string, unknown>>) {
  if (data.length === 0) return
  const cols = Object.keys(data[0])
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.join(','), ...data.map((row) => cols.map((c) => esc(row[c])).join(','))].join(
    '\r\n',
  )
  const a = document.createElement('a')
  a.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv))
  a.setAttribute('download', filename)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
