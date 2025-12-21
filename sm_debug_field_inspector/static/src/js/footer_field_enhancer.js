/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { FormRenderer } from "@web/views/form/form_renderer";
import { onMounted, onPatched } from "@odoo/owl";

/**
 * SM Debug Field Inspector - Footer Field Enhancer
 * 
 * Patches Odoo's form renderer to add field info tooltips to ALL elements
 * Including monetary footer fields that normally don't have debug indicators
 * 
 * Problem: Di invoice, field seperti amount_untaxed, amount_tax, amount_total
 * di-render via QWeb bukan <field> widget, jadi tidak ada tanda "?" dari Odoo debug.
 * 
 * Solution: Scan DOM untuk text label yang match dengan field name, lalu inject indicator.
 */

// Field name mapping untuk footer/computed fields
const FIELD_TEXT_MAPPINGS = {
    // ===== Invoice/Bill totals (account.move) =====
    'untaxed amount': { field: 'amount_untaxed', type: 'monetary', model: 'account.move' },
    'untaxed': { field: 'amount_untaxed', type: 'monetary', model: 'account.move' },
    'taxes': { field: 'amount_tax', type: 'monetary', model: 'account.move' },
    'tax': { field: 'amount_tax', type: 'monetary', model: 'account.move' },
    'total': { field: 'amount_total', type: 'monetary', model: 'account.move' },
    'amount due': { field: 'amount_residual', type: 'monetary', model: 'account.move' },
    'payment difference': { field: 'payment_difference', type: 'monetary', model: 'account.move' },
    'amount in words': { field: 'amount_total_words', type: 'char', model: 'account.move' },
    'outstanding credits': { field: 'invoice_outstanding_credits_debits_widget', type: 'widget', model: 'account.move' },
    'outstanding debits': { field: 'invoice_outstanding_credits_debits_widget', type: 'widget', model: 'account.move' },
    'payments': { field: 'invoice_payments_widget', type: 'widget', model: 'account.move' },
    
    // Indonesia - Bahasa
    'jumlah yang belum dikenakan pajak': { field: 'amount_untaxed', type: 'monetary', model: 'account.move' },
    'pajak': { field: 'amount_tax', type: 'monetary', model: 'account.move' },
    'jumlah total': { field: 'amount_total', type: 'monetary', model: 'account.move' },
    'saldo tersisa': { field: 'amount_residual', type: 'monetary', model: 'account.move' },
    
    // ===== Sale Order totals (sale.order) =====
    'delivery': { field: 'delivery_price', type: 'monetary', model: 'sale.order' },
    'margin': { field: 'margin', type: 'monetary', model: 'sale.order' },
    'margin (%)': { field: 'margin_percent', type: 'float', model: 'sale.order' },
    
    // ===== Purchase Order totals (purchase.order) =====
    'total amount': { field: 'amount_total', type: 'monetary', model: 'purchase.order' },
    
    // ===== Stock Picking / MRP =====
    'scheduled date': { field: 'scheduled_date', type: 'datetime' },
    'deadline': { field: 'date_deadline', type: 'datetime' },
    
    // ===== Common fields =====
    'subtotal': { field: 'price_subtotal', type: 'monetary' },
    'discount': { field: 'discount', type: 'float' },
    'discount (%)': { field: 'discount', type: 'float' },
    'quantity': { field: 'quantity', type: 'float' },
    'qty': { field: 'quantity', type: 'float' },
    'unit price': { field: 'price_unit', type: 'monetary' },
    'price': { field: 'price_unit', type: 'monetary' },
    'currency': { field: 'currency_id', type: 'many2one' },
    'company': { field: 'company_id', type: 'many2one' },
};

// Check if debug mode is active - use odoo.debug like native Odoo
function isDebugMode() {
    // odoo.debug is "" when off, "1" or "assets" when on
    return Boolean(odoo.debug);
}

// Get current model from hash or form view
function getCurrentModel() {
    const hash = window.location.hash;
    const match = hash.match(/model=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

// Create debug indicator element
function createIndicator(fieldInfo) {
    const indicator = document.createElement('sup');
    indicator.className = 'sm-field-indicator';
    indicator.textContent = '?';
    
    // Build tooltip text like native Odoo
    let tooltip = `Field: ${fieldInfo.field}`;
    if (fieldInfo.type) tooltip += `\nType: ${fieldInfo.type}`;
    if (fieldInfo.model) tooltip += `\nModel: ${fieldInfo.model}`;
    if (fieldInfo.label) tooltip += `\nLabel: ${fieldInfo.label}`;
    
    indicator.title = tooltip;
    indicator.setAttribute('data-field', fieldInfo.field);
    indicator.setAttribute('data-type', fieldInfo.type || '');
    indicator.setAttribute('data-model', fieldInfo.model || '');
    
    return indicator;
}

// Add debug indicator to an element
function addDebugIndicator(element, fieldInfo) {
    if (!element || element.hasAttribute('data-sm-enhanced')) return false;
    
    // Skip if already has indicator
    if (element.querySelector('.sm-field-indicator')) return false;
    
    // Mark as enhanced
    element.setAttribute('data-sm-enhanced', '1');
    element.setAttribute('data-sm-field', fieldInfo.field);
    
    // Create and append indicator
    const indicator = createIndicator(fieldInfo);
    
    // Try to find best place to insert
    const targetElement = element.querySelector('.text-muted, .o_form_label') || element;
    
    // Check if it's a text node only
    if (targetElement.childNodes.length === 1 && targetElement.childNodes[0].nodeType === Node.TEXT_NODE) {
        targetElement.appendChild(indicator);
    } else {
        // Find last text-containing element
        const children = Array.from(targetElement.childNodes);
        let inserted = false;
        
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                // Wrap text and add indicator
                const span = document.createElement('span');
                span.textContent = child.textContent;
                span.appendChild(indicator);
                child.replaceWith(span);
                inserted = true;
                break;
            } else if (child.nodeType === Node.ELEMENT_NODE && 
                       !child.classList.contains('o_field_widget') &&
                       child.textContent.trim() &&
                       child.tagName !== 'BUTTON') {
                child.appendChild(indicator);
                inserted = true;
                break;
            }
        }
        
        if (!inserted) {
            targetElement.appendChild(indicator);
        }
    }
    
    return true;
}

// Main scan function
function scanAndEnhanceFooterFields(rootElement = document) {
    if (!isDebugMode()) return;
    
    const currentModel = getCurrentModel();
    let enhancedCount = 0;
    
    // ===== Strategy 1: Scan oe_subtotal_footer (Invoice/SO/PO totals) =====
    rootElement.querySelectorAll('.oe_subtotal_footer tr, .oe_subtotal_footer_separator').forEach(row => {
        // Get label element - bisa di <td>, <th>, atau langsung di <tr>
        const labelElements = row.querySelectorAll('td:first-child, td.text-muted, th:first-child, .text-muted, span');
        
        labelElements.forEach(labelEl => {
            if (!labelEl || labelEl.hasAttribute('data-sm-enhanced')) return;
            
            const labelText = labelEl.textContent?.toLowerCase().trim();
            if (!labelText) return;
            
            // Match with known field mappings
            for (const [text, info] of Object.entries(FIELD_TEXT_MAPPINGS)) {
                if (labelText.includes(text) || text.includes(labelText)) {
                    const fieldInfo = {
                        ...info,
                        model: info.model || currentModel,
                        label: labelEl.textContent.trim()
                    };
                    if (addDebugIndicator(labelEl, fieldInfo)) {
                        enhancedCount++;
                    }
                    break;
                }
            }
        });
    });
    
    // ===== Strategy 2: Scan table cells with text-muted class =====
    rootElement.querySelectorAll('table .text-muted, .o_invoice_total .text-muted').forEach(el => {
        if (el.hasAttribute('data-sm-enhanced')) return;
        
        const text = el.textContent?.toLowerCase().trim();
        if (!text) return;
        
        for (const [labelText, info] of Object.entries(FIELD_TEXT_MAPPINGS)) {
            if (text.includes(labelText)) {
                const fieldInfo = { ...info, model: info.model || currentModel, label: el.textContent.trim() };
                if (addDebugIndicator(el, fieldInfo)) {
                    enhancedCount++;
                }
                break;
            }
        }
    });
    
    // ===== Strategy 3: Scan separator classes (Total row) =====
    rootElement.querySelectorAll('.oe_subtotal_footer_separator, .o_cell_separator').forEach(el => {
        if (el.hasAttribute('data-sm-enhanced')) return;
        
        const firstChild = el.querySelector('td:first-child, .text-muted, span') || el;
        const text = firstChild.textContent?.toLowerCase().trim();
        
        for (const [labelText, info] of Object.entries(FIELD_TEXT_MAPPINGS)) {
            if (text && text.includes(labelText)) {
                const fieldInfo = { ...info, model: info.model || currentModel, label: firstChild.textContent?.trim() };
                if (addDebugIndicator(firstChild, fieldInfo)) {
                    enhancedCount++;
                }
                break;
            }
        }
    });
    
    if (enhancedCount > 0) {
        console.log(`[SM Debug Field Inspector] Enhanced ${enhancedCount} footer fields with debug indicators`);
    }
}

// Remove all debug indicators (when debug mode is turned off)
function removeAllIndicators() {
    // Remove indicator elements
    document.querySelectorAll('.sm-field-indicator').forEach(el => el.remove());
    
    // Remove data attributes
    document.querySelectorAll('[data-sm-enhanced]').forEach(el => {
        el.removeAttribute('data-sm-enhanced');
        el.removeAttribute('data-sm-field');
    });
    
    // Remove CSS
    const style = document.getElementById('sm-footer-field-enhancer-css');
    if (style) style.remove();
    
    console.log('[SM Debug Field Inspector] Removed all debug indicators (debug mode disabled)');
}

// Inject CSS styles
function injectStyles() {
    if (document.getElementById('sm-footer-field-enhancer-css')) return;
    
    const style = document.createElement('style');
    style.id = 'sm-footer-field-enhancer-css';
    style.textContent = `
        /* Debug indicator styling - match Odoo's native style */
        .sm-field-indicator {
            cursor: help !important;
            color: #714B67 !important;
            font-weight: bold;
            font-size: 10px;
            margin-left: 3px;
            vertical-align: super;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        
        .sm-field-indicator:hover {
            opacity: 1;
            color: #017e84 !important;
        }
        
        /* Highlight row on indicator hover */
        tr:has(.sm-field-indicator:hover) {
            background-color: rgba(113, 75, 103, 0.05);
        }
        
        [data-sm-enhanced]:hover {
            background-color: rgba(113, 75, 103, 0.03);
        }
    `;
    document.head.appendChild(style);
}

// Patch FormRenderer
patch(FormRenderer.prototype, {
    setup() {
        super.setup(...arguments);
        
        // Enhancement after initial render - check debug mode dynamically
        onMounted(() => {
            if (isDebugMode()) {
                injectStyles();
                setTimeout(() => scanAndEnhanceFooterFields(this.rootRef?.el || document), 200);
            } else {
                removeAllIndicators();
            }
        });
        
        // Re-enhance after updates
        onPatched(() => {
            if (isDebugMode()) {
                injectStyles();
                setTimeout(() => scanAndEnhanceFooterFields(this.rootRef?.el || document), 200);
            } else {
                removeAllIndicators();
            }
        });
    }
});

// Also handle SPA navigation - always setup listeners
if (typeof window !== 'undefined') {
    
    // Track last known debug state
    let lastDebugState = Boolean(odoo.debug);
    
    // Function to handle debug mode changes
    function handleDebugModeChange() {
        const currentDebugState = isDebugMode();
        
        if (currentDebugState) {
            injectStyles();
            setTimeout(scanAndEnhanceFooterFields, 300);
        } else {
            removeAllIndicators();
        }
        
        lastDebugState = currentDebugState;
    }
    
    // Poll for odoo.debug changes (since Odoo may change it without URL change)
    function startDebugWatcher() {
        setInterval(() => {
            const currentDebugState = Boolean(odoo.debug);
            if (currentDebugState !== lastDebugState) {
                console.log(`[SM Debug Field Inspector] Debug mode changed: ${lastDebugState} -> ${currentDebugState}`);
                handleDebugModeChange();
            }
        }, 500); // Check every 500ms
    }
    
    // Initial check after page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            handleDebugModeChange();
            setupMutationObserver();
            startDebugWatcher();
        });
    } else {
        handleDebugModeChange();
        setupMutationObserver();
        startDebugWatcher();
    }
    
    // Re-check on navigation (including debug mode toggle)
    window.addEventListener('hashchange', handleDebugModeChange);
    
    // Also listen for URL changes (popstate for back/forward)
    window.addEventListener('popstate', handleDebugModeChange);
}

// Setup MutationObserver for dynamic content
function setupMutationObserver() {
    if (!document.body) {
        // Retry after DOM is ready
        setTimeout(setupMutationObserver, 100);
        return;
    }
    
    const observer = new MutationObserver((mutations) => {
        // Skip if not in debug mode
        if (!isDebugMode()) {
            removeAllIndicators();
            return;
        }
        
        let shouldScan = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList?.contains('oe_subtotal_footer') ||
                            node.querySelector?.('.oe_subtotal_footer') ||
                            node.classList?.contains('o_form_sheet')) {
                            shouldScan = true;
                            break;
                        }
                    }
                }
            }
            if (shouldScan) break;
        }
        if (shouldScan) {
            setTimeout(scanAndEnhanceFooterFields, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

console.log('[SM Debug Field Inspector] Footer field enhancer loaded.');
