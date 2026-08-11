import { Stagehand, localBrowser } from '@browserbasehq/stagehand'
import { Page } from 'playwright'
import { z } from 'zod'

export interface ExtractedFormFieldStagehand {
  selector: string | null
  type: string
  label: string
  currentValue: string
  isEmpty: boolean
  required: boolean
  options?: string[]
}

export class StagehandService {
  private static stagehandInstance: Stagehand | null = null

  static async getStagehand(): Promise<Stagehand | null> {
    try {
      if (!this.stagehandInstance) {
        this.stagehandInstance = await Stagehand.create({
          browser: localBrowser as any,
          cache: true,
          model: {
            modelName: 'groq/llama-3.3-70b-versatile' as any,
            apiKey: process.env.GROQ_API_KEY,
          },
        })
      }
      return this.stagehandInstance
    } catch (e: any) {
      console.warn('[StagehandService] Stagehand init fallback:', e.message)
      return null
    }
  }

  /**
   * Extracts form schema and field values dynamically using AI vision & ARIA representation.
   */
  static async extractFormFields(_page: Page): Promise<ExtractedFormFieldStagehand[]> {
    try {
      const stagehand = await this.getStagehand()
      if (!stagehand) return []

      const FieldSchema = z.object({
        label: z.string(),
        type: z.string(),
        currentValue: z.string().optional().default(''),
        isEmpty: z.boolean(),
        required: z.boolean().optional().default(false),
        options: z.array(z.string()).optional(),
      })

      const Schema = z.object({
        fields: z.array(FieldSchema),
      })

      const extracted = await stagehand.extract(
        'Extract all interactive form fields on the active application modal (inputs, textareas, selects, radio groups, checkboxes), including their label, input type, options if any, and whether they are currently filled or empty on screen',
        Schema
      )

      const rawFields = extracted?.data?.fields || []

      return rawFields.map((f: any, idx: number) => ({
        selector: `[data-jobnavi-field-idx="${idx}"]`,
        type: f.type || 'text',
        label: f.label || `Field ${idx + 1}`,
        currentValue: f.currentValue || (f.isEmpty ? '' : 'filled'),
        isEmpty: Boolean(f.isEmpty),
        required: Boolean(f.required),
        options: f.options,
      }))
    } catch (e: any) {
      console.warn('[StagehandService] Error during AI extraction:', e.message)
      return []
    }
  }

  /**
   * Executes AI action on active page using Stagehand page.act()
   */
  static async act(actionDescription: string): Promise<boolean> {
    try {
      const stagehand = await this.getStagehand()
      if (!stagehand) return false

      const result = await stagehand.act(actionDescription)
      if ((result as any)?.cacheStatus === 'HIT') {
        console.log(`[StagehandService] ⚡ Cache HIT for action: "${actionDescription}" (0 tokens used)`)
      }
      return true
    } catch (e: any) {
      console.warn('[StagehandService] Error executing act:', e.message)
      return false
    }
  }
}
