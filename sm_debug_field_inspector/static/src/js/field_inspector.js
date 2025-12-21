/** @odoo-module **/

import { Component, useState, useRef, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";

/**
 * SM Debug Field Inspector
 * Enhanced debug mode that shows field names on hover for ALL elements
 */

class FieldInspectorService {
    constructor(env, services) {
        this.env = env;
        this.notification = services.notification;
        this.isActive = false;
        this.tooltip = null;
        this.highlightedElement = null;
        this.fieldMappings = new Map();
        
        // Only initialize in debug mode
        if (this.isDebugMode()) {
            this.init();
        }
    }
    
    isDebugMode() {
        const url = new URL(window.location.href);
        return url.searchParams.has('debug') || session.debug;
    }
    
    init() {
        this.createTooltip();
        this.setupKeyboardShortcut();
        this.injectStyles();
        console.log('[SM Debug] Field Inspector initialized. Press Alt+F to toggle.');
    }
    
    createTooltip() {
        if (this.tooltip) return;
        
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'sm-field-inspector-tooltip';
        this.tooltip.className = 'sm-field-tooltip';
        this.tooltip.style.display = 'none';
        document.body.appendChild(this.tooltip);
    }
    
    injectStyles() {
        if (document.getElementById('sm-field-inspector-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'sm-field-inspector-styles';
        style.textContent = `
            .sm-field-inspector-active .o_field_widget,
            .sm-field-inspector-active [name],
            .sm-field-inspector-active .oe_form_field,
            .sm-field-inspector-active .o_stat_info,
            .sm-field-inspector-active .oe_stat_button,
            .sm-field-inspector-active .o_form_label,
            .sm-field-inspector-active .o_cell,
            .sm-field-inspector-active .text-muted,
            .sm-field-inspector-active .oe_subtotal_footer_separator,
            .sm-field-inspector-active .oe_subtotal_footer {
                cursor: crosshair !important;
            }
            
            .sm-field-inspector-active .sm-field-highlight {
                outline: 2px solid #714B67 !important;
                outline-offset: 2px;
                background-color: rgba(113, 75, 103, 0.1) !important;
            }
            
            .sm-field-tooltip {
                position: fixed;
                z-index: 99999;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: #e8e8e8;
                padding: 10px 14px;
                border-radius: 8px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 12px;
                line-height: 1.5;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(113, 75, 103, 0.5);
                max-width: 400px;
                pointer-events: none;
            }
            
            .sm-field-tooltip .sm-tooltip-row {
                display: flex;
                gap: 8px;
                margin-bottom: 4px;
            }
            
            .sm-field-tooltip .sm-tooltip-row:last-child {
                margin-bottom: 0;
            }
            
            .sm-field-tooltip .sm-label {
                color: #714B67;
                font-weight: 600;
                min-width: 50px;
            }
            
            .sm-field-tooltip .sm-value {
                color: #4FC3F7;
                font-family: 'Consolas', 'Monaco', monospace;
                word-break: break-all;
            }
            
            .sm-field-tooltip .sm-hint {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                color: #888;
                font-size: 10px;
            }
            
            .sm-field-inspector-indicator {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 99998;
                background: linear-gradient(135deg, #714B67 0%, #875A7B 100%);
                color: white;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                display: none;
            }
            
            .sm-field-inspector-indicator.active {
                display: block;
            }
        `;
        document.head.appendChild(style);
    }
    
    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Alt + F to toggle
            if (e.altKey && e.key === 'f') {
                e.preventDefault();
                this.toggle();
            }
            // Escape to close
            if (e.key === 'Escape' && this.isActive) {
                this.deactivate();
            }
        });
    }
    
    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
    }
    
    activate() {
        this.isActive = true;
        document.body.classList.add('sm-field-inspector-active');
        
        // Show indicator
        this.showIndicator();
        
        // Build field mappings from current view
        this.buildFieldMappings();
        
        // Setup event listeners
        document.addEventListener('mouseover', this.handleMouseOver);
        document.addEventListener('mouseout', this.handleMouseOut);
        document.addEventListener('click', this.handleClick, true);
        
        this.notification?.add('🔍 Field Inspector Active - Hover over elements to see field names. Press Alt+F or Esc to close.', {
            type: 'info',
            sticky: false,
        });
        
        console.log('[SM Debug] Field Inspector activated');
    }
    
    deactivate() {
        this.isActive = false;
        document.body.classList.remove('sm-field-inspector-active');
        
        // Hide indicator
        this.hideIndicator();
        
        // Remove event listeners
        document.removeEventListener('mouseover', this.handleMouseOver);
        document.removeEventListener('mouseout', this.handleMouseOut);
        document.removeEventListener('click', this.handleClick, true);
        
        // Hide tooltip
        this.hideTooltip();
        
        // Remove highlight
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('sm-field-highlight');
            this.highlightedElement = null;
        }
        
        console.log('[SM Debug] Field Inspector deactivated');
    }
    
    showIndicator() {
        let indicator = document.getElementById('sm-field-inspector-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'sm-field-inspector-indicator';
            indicator.className = 'sm-field-inspector-indicator';
            indicator.innerHTML = '🔍 Field Inspector (Alt+F to close)';
            document.body.appendChild(indicator);
        }
        indicator.classList.add('active');
    }
    
    hideIndicator() {
        const indicator = document.getElementById('sm-field-inspector-indicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }
    
    buildFieldMappings() {
        this.fieldMappings.clear();
        
        // Get current model info from controller
        try {
            const formView = document.querySelector('.o_form_view');
            const listView = document.querySelector('.o_list_view');
            
            // Extract model from URL hash
            const hash = window.location.hash;
            const modelMatch = hash.match(/model=([^&]+)/);
            const currentModel = modelMatch ? decodeURIComponent(modelMatch[1]) : null;
            
            if (currentModel) {
                this.currentModel = currentModel;
            }
        } catch (e) {
            console.error('[SM Debug] Error building field mappings:', e);
        }
    }
    
    handleMouseOver = (e) => {
        if (!this.isActive) return;
        
        const fieldEl = this.findFieldElement(e.target);
        if (fieldEl) {
            // Remove previous highlight
            if (this.highlightedElement && this.highlightedElement !== fieldEl) {
                this.highlightedElement.classList.remove('sm-field-highlight');
            }
            
            this.highlightedElement = fieldEl;
            fieldEl.classList.add('sm-field-highlight');
            
            const fieldInfo = this.extractFieldInfo(fieldEl);
            this.showTooltip(fieldInfo, e);
        }
    }
    
    handleMouseOut = (e) => {
        if (!this.isActive) return;
        
        const fieldEl = this.findFieldElement(e.target);
        if (fieldEl && this.highlightedElement === fieldEl) {
            fieldEl.classList.remove('sm-field-highlight');
            this.highlightedElement = null;
            this.hideTooltip();
        }
    }
    
    handleClick = (e) => {
        if (!this.isActive) return;
        
        const fieldEl = this.findFieldElement(e.target);
        if (fieldEl) {
            e.preventDefault();
            e.stopPropagation();
            
            const fieldInfo = this.extractFieldInfo(fieldEl);
            if (fieldInfo.name) {
                navigator.clipboard.writeText(fieldInfo.name).then(() => {
                    this.notification?.add(`📋 Copied: ${fieldInfo.name}`, {
                        type: 'success',
                        sticky: false,
                    });
                });
            }
        }
    }
    
    findFieldElement(el) {
        let current = el;
        while (current && current !== document.body) {
            // Check various Odoo field indicators
            if (
                current.hasAttribute('name') ||
                current.hasAttribute('data-field-name') ||
                current.classList?.contains('o_field_widget') ||
                current.classList?.contains('oe_form_field') ||
                current.classList?.contains('o_form_label') ||
                current.classList?.contains('o_stat_info') ||
                current.classList?.contains('oe_stat_button') ||
                current.classList?.contains('oe_subtotal_footer_separator') ||
                current.classList?.contains('o_cell') ||
                // Monetary footer fields
                current.closest('.oe_subtotal_footer') ||
                current.closest('.o_invoice_total')
            ) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }
    
    extractFieldInfo(el) {
        const info = {
            name: null,
            type: null,
            widget: null,
            model: this.currentModel || null,
            label: null,
            comodel: null,
            xpath: this.getSimpleXPath(el),
            classes: []
        };
        
        // Method 1: Direct name attribute
        info.name = el.getAttribute('name') || el.getAttribute('data-field-name');
        
        // Method 2: From label
        if (!info.name) {
            const label = el.querySelector('.o_form_label, label');
            if (label) {
                info.label = label.textContent?.trim();
            }
        }
        
        // Method 3: Check parent for name
        if (!info.name) {
            const parent = el.closest('[name]');
            if (parent) {
                info.name = parent.getAttribute('name');
            }
        }
        
        // Method 4: Check for stat button
        if (!info.name && el.classList?.contains('oe_stat_button')) {
            const statInfo = el.querySelector('.o_stat_info');
            if (statInfo) {
                info.name = statInfo.getAttribute('name') || el.getAttribute('name');
                const statText = el.querySelector('.o_stat_text');
                if (statText) info.label = statText.textContent?.trim();
            }
        }
        
        // Method 5: Monetary footer fields - try to identify by text content
        if (!info.name) {
            const textContent = el.textContent?.trim().toLowerCase();
            const monetaryMappings = {
                'untaxed amount': 'amount_untaxed',
                'taxes': 'amount_tax',
                'tax': 'amount_tax',
                'total': 'amount_total',
                'amount due': 'amount_residual',
                'outstanding credits': 'outstanding_credits',
                'subtotal': 'amount_untaxed',
                'discount': 'discount_amount',
                'margin': 'margin',
                'cost': 'cost',
            };
            
            for (const [text, field] of Object.entries(monetaryMappings)) {
                if (textContent?.includes(text)) {
                    info.name = field;
                    info.type = 'monetary (computed)';
                    break;
                }
            }
        }
        
        // Method 6: Try to get from Odoo internal data
        if (!info.name && el.__owl__) {
            try {
                const owlData = el.__owl__;
                if (owlData.props?.name) info.name = owlData.props.name;
                if (owlData.props?.fieldInfo?.name) info.name = owlData.props.fieldInfo.name;
            } catch (e) {}
        }
        
        // Get field type from classes
        const typeClasses = {
            'o_field_char': 'char',
            'o_field_text': 'text',
            'o_field_integer': 'integer',
            'o_field_float': 'float',
            'o_field_monetary': 'monetary',
            'o_field_date': 'date',
            'o_field_datetime': 'datetime',
            'o_field_boolean': 'boolean',
            'o_field_selection': 'selection',
            'o_field_many2one': 'many2one',
            'o_field_one2many': 'one2many',
            'o_field_many2many': 'many2many',
            'o_field_many2many_tags': 'many2many_tags',
            'o_field_binary': 'binary',
            'o_field_image': 'image',
            'o_field_html': 'html',
            'o_field_json': 'json',
        };
        
        for (const [cls, type] of Object.entries(typeClasses)) {
            if (el.classList?.contains(cls)) {
                info.type = type;
                break;
            }
        }
        
        // Get widget
        info.widget = el.getAttribute('widget') || el.dataset?.widget;
        
        // Get comodel for relational fields
        info.comodel = el.getAttribute('data-oe-many2one-model') || 
                       el.dataset?.relation;
        
        // Get important classes
        info.classes = Array.from(el.classList || []).filter(c => 
            c.startsWith('o_') || c.startsWith('oe_')
        );
        
        // If still no name, show what we have
        if (!info.name && info.label) {
            info.name = `[Label: ${info.label}]`;
        }
        
        return info;
    }
    
    getSimpleXPath(el) {
        if (!el) return '';
        
        const parts = [];
        let current = el;
        let depth = 0;
        
        while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
            let part = current.tagName.toLowerCase();
            
            if (current.id) {
                part += `#${current.id}`;
            } else if (current.getAttribute('name')) {
                part += `[name="${current.getAttribute('name')}"]`;
            } else if (current.className) {
                const mainClass = current.className.split(' ').find(c => c.startsWith('o_') || c.startsWith('oe_'));
                if (mainClass) part += `.${mainClass}`;
            }
            
            parts.unshift(part);
            current = current.parentElement;
            depth++;
        }
        
        return parts.join(' > ');
    }
    
    showTooltip(fieldInfo, event) {
        if (!this.tooltip) return;
        
        let html = '<div class="sm-tooltip-content">';
        
        if (fieldInfo.name) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Field:</span> <span class="sm-value">${fieldInfo.name}</span></div>`;
        }
        if (fieldInfo.model) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Model:</span> <span class="sm-value">${fieldInfo.model}</span></div>`;
        }
        if (fieldInfo.type) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Type:</span> <span class="sm-value">${fieldInfo.type}</span></div>`;
        }
        if (fieldInfo.widget) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Widget:</span> <span class="sm-value">${fieldInfo.widget}</span></div>`;
        }
        if (fieldInfo.comodel) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Comodel:</span> <span class="sm-value">${fieldInfo.comodel}</span></div>`;
        }
        if (fieldInfo.label) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Label:</span> <span class="sm-value">${fieldInfo.label}</span></div>`;
        }
        if (fieldInfo.classes.length > 0) {
            html += `<div class="sm-tooltip-row"><span class="sm-label">Classes:</span> <span class="sm-value">${fieldInfo.classes.slice(0, 3).join(', ')}</span></div>`;
        }
        
        html += '<div class="sm-hint">Click to copy field name</div>';
        html += '</div>';
        
        this.tooltip.innerHTML = html;
        this.tooltip.style.display = 'block';
        
        // Position tooltip
        const x = event.clientX + 15;
        const y = event.clientY + 15;
        
        this.tooltip.style.left = x + 'px';
        this.tooltip.style.top = y + 'px';
        
        // Adjust if off-screen
        const rect = this.tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.tooltip.style.left = (event.clientX - rect.width - 15) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            this.tooltip.style.top = (event.clientY - rect.height - 15) + 'px';
        }
    }
    
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }
}

// Register as a service
export const fieldInspectorService = {
    dependencies: ["notification"],
    start(env, services) {
        return new FieldInspectorService(env, services);
    },
};

registry.category("services").add("sm_field_inspector", fieldInspectorService);

// Also add a systray item for easy access
class FieldInspectorSystray extends Component {
    static template = "sm_debug_field_inspector.Systray";
    
    setup() {
        this.fieldInspector = useService("sm_field_inspector");
    }
    
    onClick() {
        this.fieldInspector.toggle();
    }
}

// Only register systray in debug mode
if (session.debug || new URL(window.location.href).searchParams.has('debug')) {
    registry.category("systray").add("sm_field_inspector", {
        Component: FieldInspectorSystray,
    }, { sequence: 1 });
}
