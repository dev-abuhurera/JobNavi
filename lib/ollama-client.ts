// ─────────────────────────────────────────────────────────────────────────────
// lib/ollama-client.ts
// Local Ollama AI Client for Job Agent (Zero 3rd-Party API Dependencies)
// Connects directly to local Ollama instance (http://localhost:11434)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import { logger } from './logger'

export interface OllamaClientOptions {
  host?: string
  model?: string
  temperature?: number
}

export class OllamaClient {
  private host: string
  private model: string
  private temperature: number

  constructor(options: OllamaClientOptions = {}) {
    this.host = (options.host || process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '')
    this.model = options.model || process.env.OLLAMA_MODEL || 'job-filler'
    this.temperature = options.temperature ?? 0.1
  }

  get currentModel(): string {
    return this.model
  }

  /**
   * Safely extracts clean JSON string from raw text response,
   * stripping markdown codeblock backticks and preamble text.
   */
  private extractJsonContent(rawContent: string): string {
    let clean = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    // Match JSON object block if LLM returned preamble / conversational text
    const objectMatch = clean.match(/\{[\s\S]*\}/)
    if (objectMatch) return objectMatch[0]

    const arrayMatch = clean.match(/\[[\s\S]*\]/)
    if (arrayMatch) return arrayMatch[0]

    return clean
  }

  /**
   * Auto-discovers any locally installed Ollama model if the configured model is missing (HTTP 404).
   */
  private async findAvailableLocalModel(): Promise<string | null> {
    try {
      const res = await fetch(`${this.host}/api/tags`)
      if (!res.ok) return null
      const data = await res.json()
      const models: Array<{ name: string }> = data.models || []
      if (models.length === 0) return null

      // Prefer job-filler or qwen models if present
      const preferred = models.find(m => m.name.includes('job-filler') || m.name.includes('qwen'))
      return preferred ? preferred.name : models[0].name
    } catch {
      return null
    }
  }

  /**
   * Structured JSON completion validated with Zod schema against local Ollama.
   */
  async chatStructured<T>(
    messages: Array<[string, string]>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const formattedMessages = messages.map(([role, content]) => ({
      role: role === 'human' ? 'user' : role,
      content,
    }))

    // Append JSON enforcement directive to system message if needed
    const systemIndex = formattedMessages.findIndex(m => m.role === 'system')
    const jsonInstruction = `\n\nCRITICAL: You MUST respond ONLY with a valid JSON object matching the requested output structure. Do NOT include markdown codeblock backticks (\`\`\`json), explanations, or preamble.`

    if (systemIndex >= 0) {
      formattedMessages[systemIndex].content += jsonInstruction
    } else {
      formattedMessages.unshift({
        role: 'system',
        content: `You are a helpful AI assistant.${jsonInstruction}`,
      })
    }

    let activeModel = this.model
    let lastError: Error | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const payload = {
          model: activeModel,
          messages: formattedMessages,
          format: 'json',
          stream: false,
          options: {
            temperature: this.temperature,
            top_p: 0.95,
          },
        }

        const response = await fetch(`${this.host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errText = await response.text()
          // If configured model is missing (404), check if another local model is installed
          if (response.status === 404 && activeModel === this.model) {
            const fallbackModel = await this.findAvailableLocalModel()
            if (fallbackModel && fallbackModel !== activeModel) {
              logger.warn('[OllamaClient]', `Local model '${activeModel}' not found. Switching to installed local model '${fallbackModel}'...`)
              activeModel = fallbackModel
              continue
            }
          }
          throw new Error(`Ollama HTTP error ${response.status}: ${errText}`)
        }

        const data = await response.json()
        const rawContent = data.message?.content || ''
        const cleanContent = this.extractJsonContent(rawContent)

        let parsedJson = JSON.parse(cleanContent)

        // Normalize common LLM key variations for schema compatibility
        if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
          const normalized: Record<string, any> = { ...parsedJson }
          if (normalized.fitScore !== undefined && normalized.fit_score === undefined) normalized.fit_score = normalized.fitScore
          if (normalized.score !== undefined && normalized.fit_score === undefined) normalized.fit_score = normalized.score
          if (normalized.match_score !== undefined && normalized.fit_score === undefined) normalized.fit_score = normalized.match_score

          if (normalized.explanation !== undefined && normalized.reason === undefined) normalized.reason = normalized.explanation
          if (normalized.summary !== undefined && normalized.reason === undefined) normalized.reason = normalized.summary

          if (normalized.skills !== undefined && normalized.tech_stack === undefined) normalized.tech_stack = normalized.skills
          if (normalized.technologies !== undefined && normalized.tech_stack === undefined) normalized.tech_stack = normalized.technologies

          if (normalized.match !== undefined && normalized.is_match === undefined) normalized.is_match = normalized.match
          if (normalized.isMatch !== undefined && normalized.is_match === undefined) normalized.is_match = normalized.isMatch

          parsedJson = normalized
        }

        const validated = schema.parse(parsedJson)
        return validated
      } catch (err: any) {
        lastError = err
        logger.warn('[OllamaClient]', `Local Ollama attempt ${attempt + 1}/3 failed for model '${activeModel}': ${err.message}`)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }

    throw new Error(`[OllamaClient] Failed structured output generation after 3 attempts: ${lastError?.message}`)
  }

  /**
   * Plain JSON completion helper.
   */
  async chatJSON<T = Record<string, any>>(prompt: string): Promise<T> {
    const GenericJsonSchema = z.record(z.string(), z.any())
    return await this.chatStructured<T>(
      [
        ['system', 'You are a precise JSON assistant. Respond strictly in valid JSON matching the user prompt requirements.'],
        ['human', prompt],
      ],
      GenericJsonSchema as unknown as z.ZodType<T>
    )
  }

  /**
   * Standard plain text chat via local Ollama.
   */
  async chat(prompt: string): Promise<string> {
    let activeModel = this.model

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const payload = {
          model: activeModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: {
            temperature: this.temperature,
          },
        }

        const response = await fetch(`${this.host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errText = await response.text()
          if (response.status === 404 && activeModel === this.model) {
            const fallbackModel = await this.findAvailableLocalModel()
            if (fallbackModel && fallbackModel !== activeModel) {
              activeModel = fallbackModel
              continue
            }
          }
          throw new Error(`Ollama HTTP error ${response.status}: ${errText}`)
        }

        const data = await response.json()
        return data.message?.content || ''
      } catch (err: any) {
        if (attempt === 1) throw err
        await new Promise(r => setTimeout(r, 500))
      }
    }

    return ''
  }
}


