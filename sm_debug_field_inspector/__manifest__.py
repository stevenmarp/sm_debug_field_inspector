# -*- coding: utf-8 -*-
{
    'name': 'SM Debug Field Inspector',
    'version': '19.0.1.0.0',
    'category': 'Tools',
    'summary': 'Enhanced debug mode - Show field names on hover for all elements including monetary footer fields',
    'description': """
SM Debug Field Inspector
========================

This module enhances Odoo's debug mode by showing field technical names 
when hovering over ANY element in form views, including:

- Regular fields (char, text, integer, etc.)
- Monetary fields (amount_total, amount_tax, etc.)
- Computed fields
- Related fields
- QWeb rendered content
- Stat buttons
- Smart buttons

Features:
---------
* Hover tooltip showing field name, type, and model
* Works with fields that don't have DOM 'name' attribute
* Auto-show ? indicator on monetary footer fields
* Indicators auto-hide when debug mode is disabled
* Keyboard shortcut to toggle (Alt+F)
* Highlights inspectable elements
* Copy field name to clipboard on click

Author: Stevenmarp
Website: https://apps.odoo.com/apps/browse?repo_maintainer_id=512936
    """,
    'author': 'Stevenmarp',
    'website': 'https://apps.odoo.com/apps/browse?repo_maintainer_id=512936',
    'license': 'OPL-1',
    'depends': ['web'],
    'data': [],
    'assets': {
        'web.assets_backend': [
            'sm_debug_field_inspector/static/src/css/field_inspector.css',
            'sm_debug_field_inspector/static/src/js/field_inspector.js',
            'sm_debug_field_inspector/static/src/js/footer_field_enhancer.js',
            'sm_debug_field_inspector/static/src/xml/field_inspector.xml',
        ],
    },
    'images': [
        'static/description/banner.gif',
        # 'static/description/ss1.png',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'price': 5.00,
    'currency': 'USD',
}
