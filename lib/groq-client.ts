// ─────────────────────────────────────────────────────────────────────────────
// lib/groq-client.ts
// LangChain-powered Groq Client with Zod Structured Output & Fallback Chains.
// ─────────────────────────────────────────────────────────────────────────────

import { ChatGroq } from '@langchain/groq'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'

export const GROQ_FREE_MODELS = [
  {
    id: 'llama-3.1-8b-instant',
    description: 'Active base model',
  },
  {
    id: 'openai/gpt-oss-20b',
    description: 'Recommended fast replacement model',
  },
  {
    id: 'openai/gpt-oss-120b',
    description: 'Heavy reasoning model',
  },
  {
    id: 'qwen/qwen3.6-27b',
    description: 'High-performance alternative',
  },
] as const

export type GroqModelId = (typeof GROQ_FREE_MODELS)[number]['id']

export const PROMPT_CHAR_LIMITS = {
  visible_text: 800,
  form_fields: 2000,
  buttons: 600,
  html_snippet: 1200,
  max_response_tokens: 600,
}

export class GroqRotatingClient {
  private apiKey: string
  private primaryModel: ChatGroq
  private fallbackChain: any
  private modelIndex = 0

  constructor(apiKey: string) {
    this.apiKey = apiKey

    // Primary ChatGroq instance
    this.primaryModel = new ChatGroq({
      model: GROQ_FREE_MODELS[0].id,
      apiKey,
      temperature: 0,
    })

    // Fallback ChatGroq instances
    const fallbackModels = GROQ_FREE_MODELS.slice(1).map(m => new ChatGroq({
      model: m.id,
      apiKey,
      temperature: 0,
    }))

    // Chain primary model with fallbacks
    this.fallbackChain = this.primaryModel.withFallbacks(fallbackModels)
  }

  get currentModel(): string {
    return GROQ_FREE_MODELS[this.modelIndex].id
  }

  /**
   * LangChain Structured Output execution with Zod schema validation & model fallbacks.
   */
  async chatStructured<T>(
    messages: Array<[string, string]>,
    schema: z.ZodType<T>
  ): Promise<T> {
    const formattedMessages = messages.map(([role, content]) => ({
      role: role === 'human' ? 'user' : role,
      content,
    }))

    // Apply withStructuredOutput to primary model & all fallback models
    const primaryStructured = this.primaryModel.withStructuredOutput(schema)
    const fallbackStructured = GROQ_FREE_MODELS.slice(1).map(m =>
      new ChatGroq({
        model: m.id,
        apiKey: this.apiKey,
        temperature: 0,
      }).withStructuredOutput(schema)
    )

    const structuredChain = primaryStructured.withFallbacks(fallbackStructured)

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await structuredChain.invoke(formattedMessages)
        return result as T
      } catch (error: any) {
        const msg = String(error?.message || error)
        const isRateLimit = msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit')

        if (isRateLimit) {
          console.log(`[LangChainGroq] ⚠️ Rate limit hit. Cooling down for 60 seconds (Attempt ${attempt + 1}/3)...`)
          await new Promise(r => setTimeout(r, 60000))
          continue
        }

        if (attempt < 2) {
          console.warn(`[LangChainGroq] 🔄 Chain retrying due to trace error: ${msg.slice(0, 80)}`)
          await new Promise(r => setTimeout(r, 2000))
          continue
        }

        throw error
      }
    }

    throw new Error('[LangChainGroq] All LangChain fallback execution attempts failed.')
  }

  /**
   * Compatibility wrapper: executes JSON completion via LangChain.
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
   * Standard plain text chat via LangChain fallback chain.
   */
  async chat(prompt: string): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.fallbackChain.invoke([['user', prompt]])
        return res.content || String(res)
      } catch (error: any) {
        const msg = String(error?.message || error)
        if (msg.includes('429') || msg.includes('rate limit')) {
          console.log(`[LangChainGroq] ⚠️ Rate limit hit. Cooling down for 60 seconds...`)
          await new Promise(r => setTimeout(r, 60000))
          continue
        }
        throw error
      }
    }
    throw new Error('[LangChainGroq] Chat execution failed.')
  }
}
