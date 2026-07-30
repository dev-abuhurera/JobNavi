import { Groq } from 'groq-sdk/client.js'

// ─────────────────────────────────────────────────────────────────────────────
// Free-tier Groq models (as of 2025)
// Ordered by preference: fastest/best first, fallbacks after.
// Rate limits per model: https://console.groq.com/docs/rate-limits
// ─────────────────────────────────────────────────────────────────────────────
export const GROQ_FREE_MODELS = [
  {
    id: 'llama-3.3-70b-versatile',
    description: 'Flagship 70B model, best quality reasoning',
    req_per_min: 30,
    tokens_per_min: 6_000,
    tokens_per_day: 100_000,
  },
  {
    id: 'llama-3.1-8b-instant',
    description: 'Ultra-fast 8B model',
    req_per_min: 30,
    tokens_per_min: 20_000,
    tokens_per_day: 500_000,
  },
  {
    id: 'mixtral-8x7b-32768',
    description: 'Mixture of Experts fallback',
    req_per_min: 30,
    tokens_per_min: 5_000,
    tokens_per_day: 500_000,
  },
] as const

export type GroqModelId = (typeof GROQ_FREE_MODELS)[number]['id']

// ─────────────────────────────────────────────────────────────────────────────
// Balanced prompt character limits
// ~4 chars per token on average. We target 1200–1500 tokens of prompt input,
// leaving 500–800 tokens for the model's JSON output response.
// Total context budget per call: ~2000 tokens = ~8000 characters of prompt.
// ─────────────────────────────────────────────────────────────────────────────
export const PROMPT_CHAR_LIMITS = {
  visible_text: 800,    // ~200 tokens
  form_fields:  2000,   // ~500 tokens — most important
  buttons:      600,    // ~150 tokens
  html_snippet: 1200,   // ~300 tokens (fallback raw HTML if structured empty)
  max_response_tokens: 600,
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotating Groq Client
// Automatically cycles through free models when quota/rate limits are hit.
// ─────────────────────────────────────────────────────────────────────────────
export class GroqRotatingClient {
  private groq: Groq
  private modelIndex = 0
  private exhaustedModels = new Set<string>()

  constructor(apiKey: string) {
    this.groq = new Groq({ apiKey })
  }

  get currentModel(): string {
    return GROQ_FREE_MODELS[this.modelIndex].id
  }

  private _advance(): boolean {
    this.exhaustedModels.add(this.currentModel)
    // Find next non-exhausted model
    for (let i = 0; i < GROQ_FREE_MODELS.length; i++) {
      const next = (this.modelIndex + 1 + i) % GROQ_FREE_MODELS.length
      if (!this.exhaustedModels.has(GROQ_FREE_MODELS[next].id)) {
        this.modelIndex = next
        console.log(`[GroqClient] 🔄 Switched to model: ${this.currentModel}`)
        return true
      }
    }
    // All models exhausted — reset and start over after a pause
    console.warn(`[GroqClient] ⚠️ All models quota-exhausted. Resetting rotation.`)
    this.exhaustedModels.clear()
    this.modelIndex = 0
    return false
  }

  /**
   * Send a chat completion with automatic model rotation on quota errors.
   * Retries up to `maxRetries` times across different models.
   */
  async chat(
    prompt: string,
    options: {
      max_tokens?: number
      temperature?: number
      json?: boolean
      maxRetries?: number
    } = {}
  ): Promise<string> {
    const {
      max_tokens = PROMPT_CHAR_LIMITS.max_response_tokens,
      temperature = 0,
      json = true,
      maxRetries = GROQ_FREE_MODELS.length,
    } = options

    let attempts = 0
    let finalPrompt = prompt
    if (json && !finalPrompt.toLowerCase().includes('json')) {
      finalPrompt = `${prompt}\n\nPlease respond strictly in JSON format.`
    }

    while (attempts < maxRetries) {
      try {
        const response = await this.groq.chat.completions.create({
          model: this.currentModel,
          temperature,
          max_tokens,
          messages: [{ role: 'user', content: finalPrompt }],
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        })

        const content = response.choices[0]?.message?.content || ''
        return content

      } catch (error: any) {
        const msg: string = error?.message || ''
        // Groq SDK throws errors like "429 {\"error\":{...}}" where status is in the message
        const statusFromMsg = parseInt(msg.split(' ')[0], 10)
        const status: number = error?.status ?? error?.response?.status ?? (isNaN(statusFromMsg) ? 0 : statusFromMsg)

        const isQuota = status === 429 ||
          msg.includes('rate_limit_exceeded') ||
          msg.includes('rate limit') ||
          msg.includes('tokens per day') ||
          msg.includes('tokens per minute')

        const isTokenError = msg.includes('json_validate_failed') ||
                             msg.includes('max completion tokens')

        if (isQuota) {
          console.warn(`[GroqClient] 429 quota hit on ${this.currentModel}. Rotating...`)
          const switched = this._advance()
          if (!switched) {
            console.warn(`[GroqClient] All models rate-limited. Waiting 60s...`)
            await new Promise(r => setTimeout(r, 60_000))
          }
          attempts++
          continue
        }

        if (isTokenError) {
          console.warn(`[GroqClient] Token/JSON error on ${this.currentModel}. Rotating...`)
          this._advance()
          attempts++
          continue
        }

        // Non-quota error — rethrow immediately
        throw error
      }
    }

    throw new Error(`[GroqClient] All ${maxRetries} model rotation attempts failed.`)
  }

  /**
   * Convenience: parse JSON from the model response.
   */
  async chatJSON<T = Record<string, any>>(
    prompt: string,
    options: Parameters<typeof this.chat>[1] = {}
  ): Promise<T> {
    const raw = await this.chat(prompt, { ...options, json: true })
    try {
      return JSON.parse(raw) as T
    } catch {
      // Strip markdown fences if present
      const cleaned = raw.replace(/```json\n?|```/g, '').trim()
      return JSON.parse(cleaned) as T
    }
  }
}
