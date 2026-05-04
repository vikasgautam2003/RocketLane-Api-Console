import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import type { MappingTemplate } from '@/types'

const MODEL = 'claude-haiku-4-5-20251001'
const API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM = `You are an API call template builder. Return ONLY a valid JSON object — no markdown fences, no explanation.

Given a curl command with {{PLACEHOLDER}} variables, context about the endpoint, and sample data, output exactly:
{
  "method": "GET|POST|PUT|DELETE|PATCH",
  "url": "full URL with {{PLACEHOLDER}} preserved",
  "headers": { "header-name": "value or {{PLACEHOLDER}}" },
  "body": null or { "field": "value or {{PLACEHOLDER}}" },
  "mapping": {
    "PLACEHOLDER_NAME": "session_rl_key",
    "PLACEHOLDER_NAME": "exact_column_name_from_sample_data"
  }
}

Rules:
- Any placeholder holding an auth credential (api-key, token, authorization) must map to "session_rl_key"
- All other placeholders must map to the exact key name from the sample data object
- Keep {{PLACEHOLDER}} syntax intact in url/headers/body — do not resolve them to real values
- mapping keys must NOT include the {{ }} braces`

const MappingSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.record(z.string(), z.unknown()).nullable(),
  mapping: z.record(z.string(), z.string()),
})

export async function extractMapping(
  curlCommand: string,
  context: string,
  expectedOutcome: string,
  sampleData: Record<string, string>[],
  claudeKey: string,
): Promise<MappingTemplate> {
  const userContent = [
    `Curl command:\n${curlCommand}`,
    `Context:\n${context || '(none provided)'}`,
    `Expected outcome:\n${expectedOutcome || '(none provided)'}`,
    `Sample data:\n${JSON.stringify(sampleData, null, 2)}`,
  ].join('\n\n')

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
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  const data = JSON.parse(responseText) as {
    content?: { type: string; text: string }[]
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)

  const raw = data.content?.[0]?.type === 'text' ? data.content[0].text.trim() : ''
  if (!raw) throw new Error('Empty response from Claude')

  const jsonStr = raw.startsWith('```')
    ? (raw.match(/```(?:json)?\s*([\s\S]+?)```/)?.[1]?.trim() ?? raw)
    : raw

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Claude returned non-JSON:\n${raw.slice(0, 300)}`)
  }

  const result = MappingSchema.safeParse(parsed)
  if (!result.success) throw new Error(`Invalid mapping structure: ${result.error.message}`)

  return result.data as MappingTemplate
}
