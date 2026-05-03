import { GoogleGenAI } from '@google/genai'

const MODEL = 'gemini-3-flash-preview'

const SYSTEM = `You are a curl command generator for REST APIs.
Given a description of what the user wants to do, optional API documentation, and optional CSV sample data, output a single curl command.

Rules:
- Use {{PLACEHOLDER_NAME}} syntax for ALL variable parts: IDs, names, dates, any field that will differ per request
- Use {{RL_API_KEY}} specifically for the Rocketlane API key in the auth header (e.g. -H "api-key: {{RL_API_KEY}}")
- If CSV columns are provided, use the EXACT column name as the placeholder name (e.g. if column is "ProjectId", use {{ProjectId}})
- Include all required headers and body fields inferred from the API docs
- Format multi-line curls with line continuations using \\
- Output ONLY the curl command — no explanation, no markdown fences, no commentary`

export async function generateCurl(
  description: string,
  context: string,
  geminiKey: string,
  csvColumns?: string[],
  csvSample?: Record<string, string>[],
): Promise<string> {
  const parts = [
    `Description: ${description}`,
    `API context:\n${context || '(none provided)'}`,
  ]

  if (csvColumns && csvColumns.length > 0) {
    parts.push(`CSV columns: ${csvColumns.join(', ')}`)
  }
  if (csvSample && csvSample.length > 0) {
    parts.push(`Sample CSV rows:\n${JSON.stringify(csvSample.slice(0, 2), null, 2)}`)
  }

  const userContent = parts.join('\n\n')

  const ai = new GoogleGenAI({ apiKey: geminiKey })

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: userContent,
    config: {
      systemInstruction: SYSTEM,
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const raw = res.text?.trim()
  if (!raw) throw new Error('Empty response from Gemini')

  // Strip markdown fences if present
  return raw.startsWith('```')
    ? (raw.match(/```(?:bash|sh|curl)?\s*([\s\S]+?)```/)?.[1]?.trim() ?? raw)
    : raw
}
