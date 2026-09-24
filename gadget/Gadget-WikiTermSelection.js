// <nowiki>
/**
 * Gadget-WikiTermSelection.js — Opens WikiTerm for a mouse-selected term.
 *
 * Requires Gadget-WikiTerm.js and mw.libs.wikiTerm.
 *
 * Trigger sequence:
 *   1. mouseup arms the shortcut after a non-collapsed mouse selection.
 *   2. keydown (Ctrl+Shift+K) opens the WikiTerm dialog with the selection.
 * Both steps are required and must occur in an allowed editing surface.
 * A new mousedown disarms any previous selection.
 *
 * The gadget only checks the selection inside ALLOWED_SELECTORS and never
 * reads its contents until the shortcut is pressed. The selected text is
 * used only to pre-fill the WikiTerm search field.
 */
( function () {
	'use strict';

	// Editing surfaces this gadget is allowed to act in. Anywhere else,
	// mouseup and keydown return immediately without reading the selection.
	const ALLOWED_SELECTORS = [
		'#wpTextbox1', // 2010 wikitext source editor
		'.cm-editor .cm-content', // WikiEditor / CodeMirror
		'.ve-ce-documentNode', // Visual Editor surface
		'.cx-segment' // Content Translation
	];
	const ALLOWED_SELECTOR = ALLOWED_SELECTORS.join( ',' );

	const SHORTCUT = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'k' };
	// The dependency name Gadget-WikiTerm.js is registered under; adjust to
	// match the actual gadget/module name if it differs on this wiki.
	const WIKITERM_MODULE = 'ext.gadget.WikiTerm';

	// True once a mouseup inside an allowed surface has left a non-empty
	// selection in place. Cleared by a fresh mousedown, by the shortcut
	// firing, or by the selection turning out to be empty.
	let armed = false;

	function isInAllowedContext( el ) {
		return !!( el && el !== document.body && el.closest && el.closest( ALLOWED_SELECTOR ) );
	}

	function onMouseDown() {
		// Any new mouse-driven selection attempt disarms the previous one:
		// the shortcut must always follow the *most recent* mouseup.
		armed = false;
	}

	function onMouseUp() {
		if ( !isInAllowedContext( document.activeElement ) ) {
			return;
		}
		const selection = window.getSelection();
		// Only a boolean (collapsed or not) is read here — never the text.
		armed = !!selection && !selection.isCollapsed;
	}

	function matchesShortcut( e ) {
		return e.ctrlKey === SHORTCUT.ctrlKey &&
            e.shiftKey === SHORTCUT.shiftKey &&
            e.altKey === SHORTCUT.altKey &&
            e.metaKey === SHORTCUT.metaKey &&
            e.key.toLowerCase() === SHORTCUT.key;
	}

	function onKeyDown( e ) {
		if ( !matchesShortcut( e ) ) {
			return;
		}
		if ( !isInAllowedContext( document.activeElement ) ) {
			return;
		}
		if ( !armed ) {
			// No prior mouse selection in this gesture: no-op, as specified.
			return;
		}

		const selection = window.getSelection();
		const text = selection ? selection.toString().trim() : '';
		// The shortcut is consumed either way: a stale/emptied selection
		// should not keep firing on repeated presses.
		armed = false;
		if ( !text ) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		mw.loader.using( WIKITERM_MODULE ).then( () => {
			mw.libs.wikiTerm.openDialog( text );
		}, ( err ) => {
			mw.log.warn( 'WikiTermSelection: could not load Gadget-WikiTerm.js', err );
			mw.notify( 'تعذّر تحميل مسرد الويكي. يرجى المحاولة مرة أخرى.', { type: 'error' } );
		} );
	}

	function init() {
		document.addEventListener( 'mousedown', onMouseDown, true );
		document.addEventListener( 'mouseup', onMouseUp, true );
		document.addEventListener( 'keydown', onKeyDown, true );
	}

	$( init );
}() );
// </nowiki>
