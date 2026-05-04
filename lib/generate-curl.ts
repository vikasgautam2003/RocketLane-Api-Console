import { invoke } from '@tauri-apps/api/core'

const MODEL = 'claude-haiku-4-5-20251001'
const API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM = `You are a curl command generator for REST APIs.
Given a description of what the user wants to do, optional API documentation, and optional CSV sample data, output a single curl command.

Rules:
- Use {{PLACEHOLDER_NAME}} syntax for variable parts
- Use {{RL_API_KEY}} specifically for the Rocketlane API key in the auth header (e.g. -H "api-key: {{RL_API_KEY}}")
- If CSV columns are provided, use the EXACT column name as the placeholder name (e.g. if column is "ProjectId", use {{ProjectId}})
- If API documentation is provided, use it to determine the correct URL and required headers/body fields
- ONLY include parameters that are REQUIRED by the API, or that the user explicitly mentions in their description
- Do NOT include optional filter/query parameters just because they exist in the docs — leave them out unless asked
- For GET list endpoints, only include pageSize and pageToken as query params (for pagination), nothing else unless the user asks for filters
- For POST/PUT endpoints, only include fields that are marked required in the docs, plus any the user mentions
- Format multi-line curls with line continuations using \\
- Output ONLY the curl command — no explanation, no markdown fences, no commentary`

export async function generateCurl(
  description: string,
  context: string,
  claudeKey: string,
  csvColumns?: string[],
  csvSample?: Record<string, string>[],
  apiDocs?: string,
): Promise<string> {
  const parts = [
    `Description: ${description}`,
    `API context:\n${context || '(none provided)'}`,
  ]

  if (apiDocs) parts.push(`Available API documentation:\n${apiDocs}`)
  if (csvColumns && csvColumns.length > 0) parts.push(`CSV columns: ${csvColumns.join(', ')}`)
  if (csvSample && csvSample.length > 0) parts.push(`Sample CSV rows:\n${JSON.stringify(csvSample.slice(0, 2), null, 2)}`)

  const responseText = await invoke<string>('native_http_post', {
    url: API_URL,
    headers: {
      'content-type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: parts.join('\n\n') }],
    }),
  })

  const data = JSON.parse(responseText) as {
    content?: { type: string; text: string }[]
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)

  const raw = data.content?.[0]?.type === 'text' ? data.content[0].text.trim() : ''
  if (!raw) throw new Error('Empty response from Claude')

  return raw.startsWith('```')
    ? (raw.match(/```(?:bash|sh|curl)?\s*([\s\S]+?)```/)?.[1]?.trim() ?? raw)
    : raw
}
