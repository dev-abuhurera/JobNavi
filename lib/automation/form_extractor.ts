import { Page } from 'playwright'

export interface ExtractedFormField {
  selector: string | null
  type: string
  label: string
  currentValue: string
  isEmpty: boolean
  required: boolean
  options?: string[]
}

export class FormExtractor {
  static MODAL_SELECTOR = '.jobs-easy-apply-modal, .jobs-easy-apply-content, [role="dialog"], .artdeco-modal, [data-test-modal], [aria-modal="true"], form'

  /**
   * Extracts all interactive form fields (inputs, textareas, selects, radio groups)
   * from the active modal step on the Playwright page.
   */
  static async extractFormJSON(page: Page): Promise<ExtractedFormField[]> {
    if (page.isClosed()) return []

    try {
      const script = `
        var modalSel = arguments[0];
        var modal = document.querySelector(modalSel) || document.querySelector('form') || document.body;
        if (!modal) return [];

        var result = [];
        // 1. Extract Radio Groups cleanly from parent containers or radio names
        var allRadios = Array.from(modal.querySelectorAll('input[type="radio"]'));
        var processedRadioContainers = [];

        for (var rIdx = 0; rIdx < allRadios.length; rIdx++) {
          var rInput = allRadios[rIdx];
          
          var container = rInput.closest('fieldset, [role="radiogroup"], .fb-dash-form-element, .jobs-easy-apply-form-section__element') || rInput.parentElement;
          if (!container || processedRadioContainers.indexOf(container) !== -1) continue;
          processedRadioContainers.push(container);

          var groupRadios = Array.from(container.querySelectorAll('input[type="radio"]'));
          if (groupRadios.length === 0) continue;

          var legend = container.querySelector('legend, .fb-dash-form-element__label, [class*="legend" i], [class*="title" i], [class*="label" i], p, h3, h4');
          var questionText = legend ? (legend.textContent || '').trim() : '';

          var isChecked = false;
          var isRequired = false;
          var options = [];
          var firstRadioSelector = '';

          for (var gIdx = 0; gIdx < groupRadios.length; gIdx++) {
            var gr = groupRadios[gIdx];
            if (gr.checked) isChecked = true;
            if (gr.required || gr.getAttribute('aria-required') === 'true') isRequired = true;

            var rLabel = '';
            if (gr.id) {
              var lEl = document.querySelector('label[for="' + gr.id + '"]') || document.getElementById(gr.id);
              if (lEl) rLabel = lEl.textContent || '';
            }
            if (!rLabel && gr.closest) {
              var parentLabel = gr.closest('label') || gr.parentElement;
              if (parentLabel) rLabel = parentLabel.textContent || '';
            }
            if (!rLabel) rLabel = gr.value || ('Option ' + (gIdx + 1));

            options.push(rLabel.replace(/\\s+/g, ' ').trim());
            if (gIdx === 0 && gr.id) {
              firstRadioSelector = '[id="' + gr.id + '"]';
            } else if (gIdx === 0 && gr.name) {
              firstRadioSelector = 'input[type="radio"][name="' + gr.name + '"]';
            }
          }

          if (!firstRadioSelector && groupRadios[0] && groupRadios[0].id) {
            firstRadioSelector = '[id="' + groupRadios[0].id + '"]';
          }

          result.push({
            selector: firstRadioSelector,
            type: 'radio',
            label: (questionText || groupRadios[0].getAttribute('aria-label') || 'Radio Question').substring(0, 150).replace(/\\s+/g, ' '),
            currentValue: isChecked ? 'filled' : '',
            isEmpty: !isChecked,
            required: isRequired,
            options: options
          });
        }

        // 2. Standard Inputs (text, textarea, select, checkbox, custom typeaheads/comboboxes)
        var standardInputs = Array.from(modal.querySelectorAll(
          'input:not([type="hidden"]):not([type="file"]):not([type="radio"]), textarea, select, div[role="combobox"] input, input[aria-autocomplete="list"], button[aria-haspopup="listbox"]'
        ));

        for (var j = 0; j < standardInputs.length; j++) {
          var el = standardInputs[j];
          var tag = el.tagName.toLowerCase();
          
          if (tag !== 'select') {
            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
          }

          var input = el;
          var placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
          var nameAttr = (input.getAttribute('name') || '').toLowerCase();
          var ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
          var inputType = (input.type || '').toLowerCase();
          var idAttr = (input.id || '').toLowerCase();

          // Exclude auxiliary search bars, global search inputs, and filter boxes
          if (
            inputType === 'search' ||
            placeholder === 'search' || placeholder.startsWith('search ') ||
            nameAttr === 'search' || idAttr.includes('search-input') ||
            ariaLabel === 'search' || ariaLabel.startsWith('search ')
          ) {
            continue;
          }

          var selector = input.id ? ('[id="' + input.id + '"]') : (input.name ? ('[name="' + input.name + '"]') : null);
          if (!selector) {
            var tag = el.tagName.toLowerCase();
            var allSameTag = Array.from(modal.querySelectorAll(tag));
            var idx = allSameTag.indexOf(el);
            selector = tag + ':nth-of-type(' + (idx + 1) + ')';
          }

          var rawLabel = '';
          if (input.id) {
            var labelEl = document.querySelector('label[for="' + input.id + '"]');
            if (labelEl) rawLabel = labelEl.textContent || '';
          }
          if (!rawLabel && el.closest) {
            var container = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__element, fieldset');
            if (container) {
              var questionEl = container.querySelector('.fb-dash-form-element__label, label, legend, span[class*="title" i], p');
              if (questionEl) rawLabel = questionEl.textContent || '';
            }
          }
          if (!rawLabel && input.getAttribute('aria-describedby')) {
            var descEl = document.getElementById(input.getAttribute('aria-describedby'));
            if (descEl && !(descEl.textContent || '').includes('character')) {
              rawLabel = descEl.textContent || '';
            }
          }
          if (!rawLabel && el.previousElementSibling) {
            rawLabel = el.previousElementSibling.textContent || '';
          }
          if (!rawLabel) {
            rawLabel = input.getAttribute('placeholder') || input.getAttribute('aria-label') || '';
          }

          // Strip character count metadata (e.g. "0/200 of 20 characters") from label
          var label = (rawLabel || '')
            .replace(/\\d+\\/\\d+(\\s+of\\s+\\d+\\s+characters)?/gi, '')
            .replace(/of\\s+\\d+\\s+characters/gi, '')
            .replace(/character\\s+count/gi, '')
            .replace(/\\s+/g, ' ')
            .trim();

          var currentValue = '';
          if (el.tagName.toLowerCase() === 'select') {
            var sel = el;
            if (sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
              var selectedOpt = sel.options[sel.selectedIndex];
              currentValue = (selectedOpt.text || selectedOpt.value || '').trim();
              if (currentValue.toLowerCase().indexOf('select') === 0 || currentValue.toLowerCase().indexOf('choose') === 0) {
                currentValue = '';
              }
            }
          } else {
            currentValue = (input.value || '').trim();
            var isRawUrn = currentValue.toLowerCase().indexOf('urn:li') >= 0 || currentValue.toLowerCase().indexOf('geo:') >= 0 || /^\d+$/.test(currentValue);
            
            if (isRawUrn) {
              currentValue = '';
            } else if (!currentValue && el.closest) {
              var parentContainer = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__element, .artdeco-typeahead, [class*="typeahead" i], fieldset, div');
              if (parentContainer) {
                var selectedPill = parentContainer.querySelector('.artdeco-typeahead__result, [class*="pill" i], [class*="selected" i], [class*="badge" i], button[aria-label*="Remove" i], button[aria-label*="Dismiss" i]');
                if (selectedPill) {
                  var pillText = (selectedPill.textContent || '').replace(/\s+/g, ' ').trim();
                  if (pillText.toLowerCase().indexOf('urn:li') < 0 && pillText.toLowerCase().indexOf('geo:') < 0 && !/^\d+$/.test(pillText)) {
                    currentValue = pillText;
                  }
                }
              }
            }
          }

          var isEmpty = !currentValue || currentValue === '';
          if (input.type === 'checkbox') {
            isEmpty = !input.checked;
          }

          var opts = undefined;
          if (el.tagName.toLowerCase() === 'select') {
            opts = [];
            for (var oIdx = 0; oIdx < el.options.length; oIdx++) {
              var optText = el.options[oIdx].text ? el.options[oIdx].text.trim() : '';
              if (optText) opts.push(optText);
            }
          }

          result.push({
            selector: selector,
            type: input.type || el.tagName.toLowerCase(),
            label: (label || ('Field ' + (j + 1))).substring(0, 150).replace(/\\s+/g, ' '),
            currentValue: currentValue,
            isEmpty: isEmpty,
            required: input.required || input.getAttribute('aria-required') === 'true',
            options: opts
          });
        }

        var finalResult = [];
        for (var k = 0; k < result.length; k++) {
          if (result[k].selector) finalResult.push(result[k]);
        }
        return finalResult;
      `

      const domFields: ExtractedFormField[] = await page.evaluate(new Function(script) as any, this.MODAL_SELECTOR)
      return await this.enrichWithAccessibility(page, domFields)
    } catch (e: any) {
      if (!page.isClosed()) {
        console.warn('[FormExtractor] Failed to read modal fields:', e.message)
      }
      return []
    }
  }

  /**
   * Enriches ExtractedFormFields with Accessibility Tree snapshot data.
   * Fills in clean human labels and pre-filled values for any fields that had
   * ambiguous or missing DOM labels.
   */
  private static async enrichWithAccessibility(
    page: Page,
    fields: ExtractedFormField[]
  ): Promise<ExtractedFormField[]> {
    if (fields.length === 0 || page.isClosed()) return fields

    try {
      const modalEl = await page.$(this.MODAL_SELECTOR).catch(() => null)
      const accessibility = (page as any).accessibility
      const snapshot = accessibility ? await accessibility.snapshot({
        root: modalEl || undefined,
      }).catch(() => null) : null

      if (!snapshot) return fields

      const a11yNodes: Array<{ role: string; name: string; value: string; checked?: boolean }> = []

      function walk(node: any) {
        if (!node) return
        const role = String(node.role || '').toLowerCase()
        const interactiveRoles = ['textbox', 'combobox', 'radio', 'checkbox', 'listbox', 'spinbutton']
        const nodeName = (node.name || '').trim().toLowerCase()

        if (interactiveRoles.includes(role) && node.name && role !== 'searchbox' && nodeName !== 'search') {
          a11yNodes.push({
            role,
            name: (node.name || '').trim(),
            value: String(node.value || '').trim(),
            checked: node.checked,
          })
        }

        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            walk(child)
          }
        }
      }

      walk(snapshot)

      if (a11yNodes.length === 0) return fields

      return fields.map((field, idx) => {
        const isGenericLabel = !field.label || field.label.startsWith('Field ') || field.label.startsWith('radio-group-')
        const matched = a11yNodes[idx] || a11yNodes.find(n => n.name && field.label && n.name.toLowerCase().includes(field.label.toLowerCase()))

        let updatedLabel = field.label
        let updatedVal = field.currentValue
        let updatedIsEmpty = field.isEmpty

        if (matched) {
          if (isGenericLabel && matched.name) {
            updatedLabel = matched.name.substring(0, 150)
          }
          if (!updatedVal && matched.value) {
            updatedVal = matched.value
            updatedIsEmpty = false
          }
        }

        return {
          ...field,
          label: updatedLabel,
          currentValue: updatedVal,
          isEmpty: updatedIsEmpty,
        }
      })
    } catch {
      return fields
    }
  }
}
