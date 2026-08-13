// ─────────────────────────────────────────────────────────────────────────────
// lib/ollama-client.ts
// Local Ollama AI Client powered by LangChain (@langchain/ollama & @langchain/core)
// Connects directly to local Ollama instance (http://localhost:11434)
// ─────────────────────────────────────────────────────────────────────────────

import { ChatOllama } from '@langchain/ollama'
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
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
   * Instantiates a standard LangChain ChatOllama model instance.
   */
  private createChatModel(modelName: string): ChatOllama {
    return new ChatOllama({
      baseUrl: this.host,
      model: modelName,
      temperature: this.temperature,
    })
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

      const preferred = models.find(m => m.name.includes('job-filler') || m.name.includes('qwen'))
      return preferred ? preferred.name : models[0].name
    } catch {
      return null
    }
  }

  /**
   * Auto-starts local Ollama server in background if not already running.
   */
  private async ensureOllamaServer(): Promise<void> {
    try {
      const res = await fetch(`${this.host}/api/tags`, { method: 'GET' })
      if (res.ok) return
    } catch {
      logger.info('[OllamaClient]', `Ollama server not responding at ${this.host}. Auto-starting 'ollama serve' in background...`)
      try {
        const { exec } = await import('child_process')
        exec('ollama serve >/dev/null 2>&1 &')

        // Active readiness polling (up to 10s)
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500))
          try {
            const check = await fetch(`${this.host}/api/tags`, { method: 'GET' })
            if (check.ok) {
              logger.info('[OllamaClient]', `Ollama server successfully started and responding at ${this.host}`)
              return
            }
          } catch {}
        }
      } catch {}
    }
  }

  /**
   * Structured JSON completion validated with Zod schema using LangChain ChatOllama & Core Messages.
   */
  async chatStructured<T>(
    messages: Array<[string, string]>,
    schema: z.ZodType<T>
  ): Promise<T> {
    await this.ensureOllamaServer()

    let activeModel = this.model
    let lastError: Error | null = null

    // Convert raw [role, content] tuples to literal LangChain BaseMessage objects (prevents template variable parsing on JSON strings)
    const langChainMessages: BaseMessage[] = messages.map(([role, content]) => {
      const r = role.toLowerCase()
      if (r === 'system') return new SystemMessage(content)
      if (r === 'human' || r === 'user') return new HumanMessage(content)
      return new AIMessage(content)
    })

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const llm = this.createChatModel(activeModel)

        // Try LangChain native .withStructuredOutput first
        try {
          const structuredLlm = llm.withStructuredOutput(schema as any)
          const res = (await structuredLlm.invoke(langChainMessages)) as T
          if (res) return res
        } catch {
          // Fallback to LangChain model invocation with manual Zod parsing if native structured output varies by Ollama version
        }

        // Direct LangChain ChatOllama invocation fallback
        const promptMessages = [
          ...langChainMessages,
          new HumanMessage('\nCRITICAL: Respond ONLY in valid JSON matching the requested structure without preamble or markdown.')
        ]
        const response = await llm.invoke(promptMessages)
        const rawContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
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
        if (err.message?.includes('404') && activeModel === this.model) {
          const fallbackModel = await this.findAvailableLocalModel()
          if (fallbackModel && fallbackModel !== activeModel) {
            logger.warn('[OllamaClient]', `LangChain: Local model '${activeModel}' not found. Switching to '${fallbackModel}'...`)
            activeModel = fallbackModel
            continue
          }
        }
        logger.warn('[OllamaClient]', `LangChain Ollama attempt ${attempt + 1}/3 failed for model '${activeModel}': ${err.message}`)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }

    throw new Error(`[OllamaClient] Failed LangChain structured output generation after 3 attempts: ${lastError?.message}`)
  }

  /**
   * Plain JSON completion helper powered by LangChain.
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
   * Standard plain text chat via LangChain ChatOllama.
   */
  async chat(prompt: string): Promise<string> {
    await this.ensureOllamaServer()
    let activeModel = this.model

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const llm = this.createChatModel(activeModel)
        const response = await llm.invoke([new HumanMessage(prompt)])
        return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
      } catch (err: any) {
        if (attempt === 1) throw err
        await new Promise(r => setTimeout(r, 500))
      }
    }

    return ''
  }
}
