// <nowiki>
/**
 * Gadget-WikiTermSelection.js — مُشغِّل «مسرد الويكي» بالتحديد + الاختصار
 *
 * Companion to Gadget-WikiTerm.js. Lets an editor highlight a word with the
 * mouse inside an editing surface, then press a keyboard shortcut to open
 * the WikiTerm lookup dialog pre-filled with that selection — without
 * leaving the editor or re-typing the term.
 *
 * Requires Gadget-WikiTerm.js (declare it as a dependency in the gadget's
 * definition on [[MediaWiki:Gadgets-definition]]) for mw.libs.wikiTerm.
 *
 * Trigger sequence (both steps are required, in order):
 *   1. mouseup — the user finishes a mouse-based text selection inside one
 *      of the allowed editing surfaces. This only *arms* the shortcut; it
 *      does not read the selected text yet.
 *   2. keydown — Ctrl+Shift+K (see SHORTCUT below), fired while still
 *      focused in the same kind of surface and while a selection made this
 *      way is still active. Only now is the selection's text read, and the
 *      dialog opened with it.
 * Either step alone does nothing: pressing the shortcut with no prior mouse
 * selection is a no-op, and selecting text with no shortcut afterwards does
 * nothing either. Starting a new mouse selection (mousedown) disarms the
 * shortcut until a fresh mouseup re-arms it, so a stale, previously-read
 * selection can never be reused.
 *
 * Scope / privacy
 * ----------------
 * Both listeners bail out immediately, before touching the selection at
 * all, unless `document.activeElement` is inside one of ALLOWED_SELECTORS
 * (the wikitext editor, WikiEditor/CodeMirror, the Visual Editor surface, or
 * a Content Translation segment). Outside of these, the gadget never reads
 * `window.getSelection()` — passively or otherwise.
 *
 * Even inside those surfaces, the only thing read on mouseup is whether the
 * selection is collapsed (a boolean, not its contents) so the shortcut can
 * be armed. The selected text itself is only read once, at the moment the
 * shortcut fires, and is used solely to pre-fill the WikiTerm search field;
 * nothing is transmitted anywhere beyond the existing WikiTermBase query
 * that Gadget-WikiTerm.js already sends once a search is performed. See
 * [[ويكيبيديا:مسرد الويكي]] for details.
 *
 * The shortcut below (Ctrl+Shift+K) is a starting suggestion, not final —
 * change SHORTCUT if it conflicts with a browser or MediaWiki shortcut.
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
