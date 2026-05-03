import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import type { MappingTemplate } from '@/types'

const MODEL = 'gemini-3-flash-preview'

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
  geminiKey: string,
): Promise<MappingTemplate> {
  const userContent = [
    `Curl command:\n${curlCommand}`,
    `Context:\n${context || '(none provided)'}`,
    `Expected outcome:\n${expectedOutcome || '(none provided)'}`,
    `Sample data:\n${JSON.stringify(sampleData, null, 2)}`,
  ].join('\n\n')

  const ai = new GoogleGenAI({ apiKey: geminiKey })

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: userContent,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const raw = res.text
  if (!raw) throw new Error('Empty response from Gemini')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Gemini returned non-JSON:\n${raw.slice(0, 300)}`)
  }

  const result = MappingSchema.safeParse(parsed)
  if (!result.success) throw new Error(`Invalid mapping structure: ${result.error.message}`)

  return result.data as MappingTemplate
}
