// <nowiki>
/**
 * Gadget-WikiTerm.js — أداة «مسرد الويكي» (WikiTermBase) لويكيبيديا العربية
 *
 * Adds an entry point to the skin chrome — an icon button in the header on
 * Vector 2022, Minerva and the Content Translation tool, and an item in the
 * page-actions menu ("المزيد") on Vector legacy, MonoBook, Timeless and any
 * other skin — that opens a dialog for looking up a term (Arabic, English or
 * French) across the WikiTermBase dictionaries: https://wikitermbase.toolforge.org
 *
 * Optional per-user configuration (in your common.js, before the gadget runs):
 *   window.wikiTermConfig = { placement: 'personal' };
 * moves the entry from the page-actions menu to the personal toolbar at the
 * top of the page on Vector legacy, MonoBook and Timeless.
 *
 * The page-load footprint is deliberately minimal:
 *   - the only hard dependency is mediawiki.util;
 *   - OOUI (about 90 KB gzipped) and the dialog code are loaded lazily, on
 *     the first click, through mw.loader.using();
 *   - nothing is sent to the WikiTermBase API until the user submits a search.
 *
 * Source code and issue tracker: https://github.com/forzagreen/wikitermbase
 * Documentation: https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي
 */
( function () {
	'use strict';

	const API_ENDPOINT = 'https://wikitermbase.toolforge.org/api/v1/search/aggregated';
	const TOOL_PAGE_URL = 'https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي';
	const LABEL = 'مسرد الويكي';
	const TOOLTIP = 'ابحث عن مصطلح في مسرد الويكي';
	const MIN_QUERY_LENGTH = 3;
	const REQUEST_TIMEOUT_MS = 20000;
	// Result groups rendered per "show more" step. Broad queries can return
	// several hundred groups; rendering them all at once is slow on low-end
	// devices and nobody reads past the first few dozen anyway.
	const PAGE_SIZE = 30;
	const DESCRIPTION_LIMIT = 200;
	const USER_CONFIG = window.wikiTermConfig || {};

	// Loaded on demand (first click), never at page load.
	const DIALOG_MODULES = [
		'oojs-ui-core',
		'oojs-ui-widgets',
		'oojs-ui-windows',
		'oojs-ui.styles.icons-content',
		'oojs-ui.styles.icons-editing-advanced',
		'oojs-ui.styles.icons-editing-citation',
		'oojs-ui.styles.icons-interactions'
	];

	// Codex "articlesSearch" icon, inlined so the entry point needs no icon
	// module. fill="currentColor" makes it follow the skin's colour scheme,
	// including night mode.
	const ICON_PATHS = {
		ltr: '<path d="M16 19H0V5h16zM2 17h9.586L9.29 14.704A3 3 0 018 15a3 3 0 113-3c0 .463-.109.899-.296 1.29L14 16.586V7H2zm6-6a1 1 0 100 2 1 1 0 000-2"/><path d="M20 17h-2V3H6V1h14z"/>',
		rtl: '<path d="M20 19H4V5h16zM6 17h9.586l-2.296-2.296A3 3 0 0112 15a3 3 0 113-3c0 .463-.109.899-.296 1.29L18 16.586V7H6zm6-6a1 1 0 100 2 1 1 0 000-2"/><path d="M14 1v2H2v14H0V1z"/>'
	};

	function iconSvg() {
		const dir = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
		return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
			ICON_PATHS[ dir ] + '</svg>';
	}

	// Arabic count agreement: 1 = bare singular, 2 = dual, 3–10 = plural,
	// 11+ = singular tamyiz.
	function formatDictionaryCount( count ) {
		if ( count === 1 ) {
			return 'معجم واحد';
		}
		if ( count === 2 ) {
			return 'معجمان';
		}
		if ( count <= 10 ) {
			return count + ' معاجم';
		}
		return count + ' معجما';
	}

	function createCitationTemplate( term ) {
		const wikidataId = term.dictionary_wikidata_id || '';
		if ( term.page ) {
			return '{{استشهاد بويكي بيانات|' + wikidataId + '|ص=' + term.page + '}}';
		}
		return '{{استشهاد بويكي بيانات|' + wikidataId + '}}';
	}

	function translationSpan( langTag, text, cls ) {
		return $( '<span>' ).addClass( cls ).append(
			$( '<span>' ).addClass( 'wikiterm-lang-tag' ).text( langTag ),
			' ',
			$( '<span>' ).text( text )
		);
	}

	/**
	 * Builds the dialog class. Called once, after OOUI has been loaded.
	 *
	 * @return {Function} WikiTermDialog constructor
	 */
	function defineDialogClass() {
		function WikiTermDialog( config ) {
			WikiTermDialog.super.call( this, config );
		}
		OO.inheritClass( WikiTermDialog, OO.ui.ProcessDialog );

		WikiTermDialog.static.name = 'wikiTermDialog';
		WikiTermDialog.static.title = LABEL;
		WikiTermDialog.static.size = 'larger';
		WikiTermDialog.static.actions = [
			{ action: 'close', label: 'إغلاق', flags: [ 'safe', 'close' ] }
		];

		WikiTermDialog.prototype.initialize = function () {
			WikiTermDialog.super.prototype.initialize.call( this );

			this.searchInput = new OO.ui.TextInputWidget( {
				placeholder: 'ابحث عن مصطلح (بالإنجليزية أو الفرنسية أو العربية)...',
				autocomplete: false,
				dir: 'auto',
				classes: [ 'wikiterm-search-input' ]
			} );
			this.searchButton = new OO.ui.ButtonWidget( {
				icon: 'search',
				label: 'بحث'
			} );
			this.loadingIndicator = new OO.ui.ProgressBarWidget( { progress: false } );
			this.loadingIndicator.toggle( false );
			this.errorMessage = new OO.ui.MessageWidget( { type: 'error', inline: true } );
			this.errorMessage.toggle( false );
			this.toolPageMessage = new OO.ui.MessageWidget( {
				type: 'notice',
				inline: true,
				label: new OO.ui.HtmlSnippet(
					'للمزيد، ندعوك للاطلاع على <a href="' + TOOL_PAGE_URL + '" target="_blank">صفحة الأداة</a>'
				),
				classes: [ 'wikiterm-tool-page-message' ]
			} );

			const searchForm = new OO.ui.ActionFieldLayout( this.searchInput, this.searchButton, {
				align: 'top',
				label: 'ابحث عن مصطلح عربي أو إنكليزي أو فرنسي',
				classes: [ 'wikiterm-search-form' ]
			} );

			this.$results = $( '<div>' ).addClass( 'wikiterm-results-container' );
			this.$body.append(
				this.toolPageMessage.$element,
				searchForm.$element,
				this.loadingIndicator.$element,
				this.errorMessage.$element,
				$( '<div>' ).addClass( 'wikiterm-content-area' ).append( this.$results )
			);

			this.activePopup = null;
			this.abortController = null;

			this.searchButton.connect( this, { click: 'performSearch' } );
			this.searchInput.connect( this, { enter: 'performSearch' } );
			// A click anywhere outside the citation popup closes it.
			this.$element.on( 'click', ( e ) => {
				if ( this.activePopup && !$( e.target ).closest( '.wikiterm-citation-popup' ).length ) {
					this.closeActivePopup();
				}
			} );
		};

		WikiTermDialog.prototype.showNotice = function ( text ) {
			this.$results.empty().append(
				$( '<div>' ).addClass( 'wikiterm-no-results' ).text( text )
			);
		};

		WikiTermDialog.prototype.performSearch = function () {
			const query = this.searchInput.getValue().trim();
			this.closeActivePopup();
			this.errorMessage.toggle( false );

			if ( !query ) {
				this.$results.empty();
				return;
			}
			if ( query.length < MIN_QUERY_LENGTH ) {
				this.showNotice( 'يرجى إدخال ' + MIN_QUERY_LENGTH + ' أحرف على الأقل للبحث.' );
				return;
			}

			// The results on screen stay until the new ones arrive, but their
			// "show more" must not fire meanwhile: it would cancel this search.
			this.$results.find( '.wikiterm-show-more' ).hide();
			this.loadingIndicator.toggle( true );

			this.fetchGroups( query, 0 )
				.then( ( data ) => {
					this.loadingIndicator.toggle( false );
					this.renderResults( query, data );
				} )
				.catch( ( err ) => {
					if ( err.superseded ) {
						// A newer search owns the dialog now; nothing to report.
						return;
					}
					this.loadingIndicator.toggle( false );
					mw.log.warn( 'WikiTerm: search failed', err );
					this.$results.empty();
					this.errorMessage.setLabel( err.timedOut ?
						'انتهت مهلة البحث. يرجى المحاولة مرة أخرى.' :
						'فشل البحث. الرجاء المحاولة مرة أخرى لاحقًا.'
					);
					this.errorMessage.toggle( true );
				} );
		};

		// Fetches one window of result groups (PAGE_SIZE of them, from `offset`).
		// Only one request is in flight: a new one cancels the previous, so
		// results never arrive out of order on slow connections. The promise
		// rejects with `superseded` set when that happened, `timedOut` when the
		// request ran out of time.
		WikiTermDialog.prototype.fetchGroups = function ( query, offset ) {
			if ( this.abortController ) {
				this.abortController.abort();
			}
			const controller = new AbortController();
			this.abortController = controller;
			let timedOut = false;
			const timer = setTimeout( () => {
				timedOut = true;
				controller.abort();
			}, REQUEST_TIMEOUT_MS );
			// True when a newer request has taken over in the meantime.
			const settle = () => {
				clearTimeout( timer );
				if ( this.abortController !== controller ) {
					return true;
				}
				this.abortController = null;
				return false;
			};

			const url = API_ENDPOINT + '?q=' + encodeURIComponent( '"' + query + '"' ) +
				'&limit=' + PAGE_SIZE + '&offset=' + offset;
			return fetch( url, { signal: controller.signal, headers: { Accept: 'application/json' } } )
				.then( ( response ) => {
					if ( !response.ok ) {
						throw new Error( 'HTTP ' + response.status );
					}
					return response.json();
				} )
				.then( ( data ) => {
					if ( settle() ) {
						const err = new Error( 'superseded' );
						err.superseded = true;
						throw err;
					}
					return data;
				}, ( err ) => {
					err.superseded = settle();
					err.timedOut = timedOut;
					throw err;
				} );
		};

		WikiTermDialog.prototype.renderResults = function ( query, data ) {
			// Groups received but not shown yet. The API sends one page at a
			// time, so this is normally exactly one page; a response that
			// ignored `limit` carries everything and is paged from memory.
			let pending = data.groups || [];
			let total = Math.max( data.number_groups || 0, pending.length );
			this.$results.empty().scrollTop( 0 );

			if ( !pending.length ) {
				this.showNotice( 'لا توجد نتائج' );
				this.updateSize();
				return;
			}

			const $list = $( '<div>' ).addClass( 'wikiterm-results-list' );
			const moreButton = new OO.ui.ButtonWidget( {
				label: 'عرض المزيد من النتائج',
				framed: false,
				flags: [ 'progressive' ],
				icon: 'expand'
			} );
			const $more = $( '<div>' ).addClass( 'wikiterm-show-more' ).append( moreButton.$element );
			this.$results.append( $list, $more );

			let rendered = 0;
			const showPage = () => {
				pending.splice( 0, PAGE_SIZE ).forEach( ( group ) => {
					$list.append( this.createResultCard( group, rendered === 0 ) );
					rendered++;
				} );
				const remaining = total - rendered;
				$more.toggle( remaining > 0 );
				moreButton.setDisabled( false )
					.setLabel( 'عرض المزيد من النتائج (' + remaining + ')' );
				this.updateSize();
			};
			moreButton.on( 'click', () => {
				if ( pending.length ) {
					showPage();
					return;
				}
				moreButton.setDisabled( true ).setLabel( 'جارٍ التحميل…' );
				this.fetchGroups( query, rendered )
					.then( ( next ) => {
						pending = next.groups || [];
						if ( !pending.length ) {
							// Fewer groups than announced (the data changed
							// between two pages): stop offering more.
							total = rendered;
						}
						showPage();
					} )
					.catch( ( err ) => {
						if ( err.superseded ) {
							return;
						}
						mw.log.warn( 'WikiTerm: loading more results failed', err );
						moreButton.setDisabled( false )
							.setLabel( 'تعذّر تحميل المزيد. أعد المحاولة' );
					} );
			} );
			showPage();
		};

		WikiTermDialog.prototype.createResultCard = function ( group, isHighlighted ) {
			const $card = $( '<div>' )
				.addClass( 'wikiterm-result-card' )
				.toggleClass( 'wikiterm-result-highlighted', isHighlighted );

			const $translations = $( '<div>' ).addClass( 'wikiterm-translations' );
			if ( group.english_normalised ) {
				$translations.append( translationSpan( 'EN', group.english_normalised, 'wikiterm-translation wikiterm-en' ) );
			}
			if ( group.french_normalised ) {
				$translations.append( translationSpan( 'FR', group.french_normalised, 'wikiterm-translation wikiterm-fr' ) );
			}

			const chevron = new OO.ui.IconWidget( { icon: 'expand', title: 'توسيع' } );

			// The whole header is one keyboard-operable disclosure button.
			const $header = $( '<div>' )
				.addClass( 'wikiterm-result-header' )
				.attr( { role: 'button', tabindex: 0, 'aria-expanded': 'false' } )
				.append(
					$( '<span>' ).addClass( 'wikiterm-arabic-term' ).text( group.arabic_normalised ),
					$translations,
					$( '<div>' ).addClass( 'wikiterm-dictionary-count' )
						.text( formatDictionaryCount( group.dictionary_ids.length ) ),
					chevron.$element
				);
			const $details = $( '<div>' ).addClass( 'wikiterm-result-details wikiterm-hidden' );
			$card.append( $header, $details );

			let expanded = false;
			let built = false;
			const toggle = () => {
				expanded = !expanded;
				if ( expanded && !built ) {
					// Variants are built lazily, the first time a group is opened.
					const $variants = $( '<ul>' ).addClass( 'wikiterm-variants-list' );
					group.occurences.forEach( ( term ) => {
						$variants.append( this.createVariantItem( term ) );
					} );
					$details.append( $( '<div>' ).addClass( 'wikiterm-variants' ).append( $variants ) );
					built = true;
				}
				$details.toggleClass( 'wikiterm-hidden', !expanded );
				$header.attr( 'aria-expanded', String( expanded ) );
				chevron.setIcon( expanded ? 'collapse' : 'expand' ).setTitle( expanded ? 'تصغير' : 'توسيع' );
				this.updateSize();
			};
			$header.on( 'click', ( e ) => {
				if ( !$( e.target ).closest( 'a' ).length ) {
					toggle();
				}
			} );
			$header.on( 'keydown', ( e ) => {
				if ( e.key === 'Enter' || e.key === ' ' ) {
					e.preventDefault();
					toggle();
				}
			} );

			return $card;
		};

		WikiTermDialog.prototype.createVariantItem = function ( term ) {
			const $item = $( '<li>' ).addClass( 'wikiterm-variant-item' );

			const $termInfo = $( '<div>' ).addClass( 'wikiterm-term-info' ).append(
				$( '<span>' ).addClass( 'wikiterm-term-arabic' ).text( term.arabic )
			);
			if ( term.english ) {
				$termInfo.append( translationSpan( 'EN', term.english, 'wikiterm-term-translation' ) );
			}
			if ( term.french ) {
				$termInfo.append( translationSpan( 'FR', term.french, 'wikiterm-term-translation' ) );
			}
			$item.append( $termInfo );

			const $dictInfo = $( '<div>' ).addClass( 'wikiterm-dictionary-info' );
			const $dictName = $( '<span>' ).addClass( 'wikiterm-dictionary-name' );
			if ( term.dictionary_wikidata_id ) {
				$dictName.append(
					$( '<a>' )
						.attr( {
							href: 'https://www.wikidata.org/wiki/' + term.dictionary_wikidata_id,
							target: '_blank',
							rel: 'noopener'
						} )
						.text( term.dictionary_name_arabic || 'قاموس' )
				);
			} else {
				$dictName.text( term.dictionary_name_arabic || 'قاموس' );
			}
			$dictInfo.append( $dictName );

			if ( term.page ) {
				$dictInfo.append(
					$( '<span>' ).addClass( 'wikiterm-dictionary-page' ).text( 'ص. ' + term.page )
				);
			}

			if ( term.dictionary_wikidata_id ) {
				const citationBtn = new OO.ui.ButtonWidget( {
					icon: 'reference',
					label: 'استشهد بهذا المصطلح',
					invisibleLabel: true,
					framed: false,
					title: 'استشهد بهذا المصطلح',
					classes: [ 'wikiterm-citation-button' ]
				} );
				citationBtn.on( 'click', () => {
					this.showCitationPopup( citationBtn.$element, term );
				} );
				$dictInfo.append( citationBtn.$element );
			}

			if ( term.uri ) {
				const externalLink = new OO.ui.ButtonWidget( {
					icon: 'linkExternal',
					label: 'فتح المصدر',
					invisibleLabel: true,
					framed: false,
					href: term.uri,
					target: '_blank',
					rel: [ 'noopener' ],
					title: 'فتح المصدر',
					classes: [ 'wikiterm-external-link' ]
				} );
				$dictInfo.append( externalLink.$element );
			}
			$item.append( $dictInfo );

			if ( term.description ) {
				$item.append( this.createDescription( term.description ) );
			}

			return $item;
		};

		WikiTermDialog.prototype.createDescription = function ( description ) {
			const $description = $( '<div>' ).addClass( 'wikiterm-description' );
			const $text = $( '<div>' ).addClass( 'wikiterm-description-text' );
			$description.append( $text );

			if ( description.length <= DESCRIPTION_LIMIT ) {
				$text.text( description );
				return $description;
			}

			let showingAll = false;
			const $toggle = $( '<button>' )
				.attr( 'type', 'button' )
				.addClass( 'wikiterm-description-toggle' );
			const render = () => {
				$text.text( showingAll ? description : description.slice( 0, DESCRIPTION_LIMIT ) + '...' );
				$toggle.text( showingAll ? 'عرض أقل' : 'عرض المزيد' );
			};
			$toggle.on( 'click', () => {
				showingAll = !showingAll;
				render();
				this.updateSize();
			} );
			render();
			return $description.append( $toggle );
		};

		WikiTermDialog.prototype.showCitationPopup = function ( $target, term ) {
			this.closeActivePopup();
			const template = createCitationTemplate( term );

			const textarea = new OO.ui.MultilineTextInputWidget( {
				value: template,
				readOnly: true,
				rows: 3,
				classes: [ 'wikiterm-citation-text' ]
			} );
			const copyBtn = new OO.ui.ButtonWidget( {
				label: 'نسخ',
				icon: 'copy',
				flags: [ 'progressive' ]
			} );
			const onCopied = () => {
				copyBtn.setLabel( 'نُسِخت!' );
				setTimeout( () => {
					copyBtn.setLabel( 'نسخ' );
				}, 2000 );
			};
			const copyFallback = () => {
				textarea.select();
				// Deprecated, but still the only option in a few environments.
				document.execCommand( 'copy' );
				onCopied();
			};
			copyBtn.on( 'click', () => {
				if ( navigator.clipboard && navigator.clipboard.writeText ) {
					navigator.clipboard.writeText( template ).then( onCopied, copyFallback );
				} else {
					copyFallback();
				}
			} );

			const $content = $( '<div>' ).append(
				new OO.ui.LabelWidget( { label: 'رمز الاستشهاد', classes: [ 'wikiterm-citation-title' ] } ).$element,
				textarea.$element,
				$( '<div>' ).addClass( 'wikiterm-citation-actions' ).append( copyBtn.$element )
			);
			const popup = new OO.ui.PopupWidget( {
				$content: $content,
				$floatableContainer: $target,
				padded: true,
				width: 300,
				align: 'forwards',
				position: 'below',
				autoClose: true,
				head: false,
				classes: [ 'wikiterm-citation-popup' ]
			} );
			this.$element.append( popup.$element );
			popup.toggle( true );
			this.activePopup = popup;

			setTimeout( () => {
				textarea.focus().select();
			}, 100 );
		};

		WikiTermDialog.prototype.closeActivePopup = function () {
			if ( this.activePopup ) {
				this.activePopup.toggle( false );
				this.activePopup.$element.remove();
				this.activePopup = null;
			}
		};

		WikiTermDialog.prototype.getReadyProcess = function ( data ) {
			return WikiTermDialog.super.prototype.getReadyProcess.call( this, data )
				.next( () => {
					this.searchInput.focus();
				} );
		};

		WikiTermDialog.prototype.getActionProcess = function ( action ) {
			if ( action === 'close' ) {
				return new OO.ui.Process( () => {
					this.close();
				} );
			}
			return WikiTermDialog.super.prototype.getActionProcess.call( this, action );
		};

		return WikiTermDialog;
	}

	/* ---------- Entry point (what actually runs at page load) ---------- */

	let dialogPromise = null;

	function openDialog() {
		if ( !dialogPromise ) {
			dialogPromise = mw.loader.using( DIALOG_MODULES ).then( () => {
				const WikiTermDialog = defineDialogClass();
				const windowManager = new OO.ui.WindowManager();
				$( document.body ).append( windowManager.$element );
				const dialog = new WikiTermDialog();
				windowManager.addWindows( [ dialog ] );
				return { windowManager: windowManager, dialog: dialog };
			} );
		}
		return dialogPromise.then( ( ui ) => {
			ui.windowManager.openWindow( ui.dialog );
		}, ( err ) => {
			// Let the next click retry the download.
			dialogPromise = null;
			mw.log.warn( 'WikiTerm: failed to load the dialog', err );
			mw.notify( 'تعذّر تحميل مسرد الويكي. يرجى المحاولة مرة أخرى.', { type: 'error' } );
		} );
	}

	function onTriggerClick( e ) {
		e.preventDefault();
		const $trigger = $( e.currentTarget ).addClass( 'wikiterm-busy' );
		openDialog().then( () => {
			$trigger.removeClass( 'wikiterm-busy' );
		} );
	}

	function makeIconButton( extraClasses, plain ) {
		return $( '<a>' )
			.attr( { href: '#', role: 'button', title: TOOLTIP, 'aria-label': LABEL } )
			.addClass( 'wikiterm-trigger wikiterm-icon-button' )
			// Codex quiet icon-only button, unless the host header sizes items itself.
			.addClass( plain ? '' : 'cdx-button cdx-button--fake-button cdx-button--fake-button--enabled cdx-button--weight-quiet cdx-button--icon-only' )
			.addClass( extraClasses )
			.append( $( '<span>' ).addClass( 'wikiterm-icon' ).html( iconSvg() ) )
			.on( 'click', onTriggerClick );
	}

	// Vector 2022: icon next to the user links in the header (and in the
	// sticky header, when the skin renders one).
	function addToVector2022() {
		const anchor = document.getElementById( 'p-vector-user-menu-userpage' );
		if ( !anchor ) {
			return false;
		}
		$( anchor ).after( makeIconButton( 'wikiterm-trigger-header' ) );
		const stickyIcons = document.querySelector( '.vector-sticky-header-icons' );
		if ( stickyIcons ) {
			$( stickyIcons ).prepend(
				makeIconButton( 'wikiterm-trigger-sticky' ).attr( 'tabindex', -1 )
			);
		}
		return true;
	}

	// Minerva (mobile): icon in the header's user navigation.
	function addToMinerva() {
		const nav = document.querySelector( '.minerva-user-navigation' );
		if ( !nav ) {
			return false;
		}
		$( nav ).prepend(
			$( '<div>' ).addClass( 'wikiterm-minerva' ).append(
				makeIconButton( 'cdx-button--size-large' )
			)
		);
		return true;
	}

	// Content Translation (Special:ContentTranslation uses its own skin): icon
	// in the tool's header, sized like the Echo notification badges next to it.
	function addToContentTranslation() {
		const list = document.querySelector(
			'#user-tools .mw-portlet-body:not( .cx-skin-menu-dropdown ) .cx-skin-menu-content'
		);
		if ( !list ) {
			return false;
		}
		$( list ).append(
			$( '<li>' ).addClass( 'mw-list-item wikiterm-cx-item' ).append(
				makeIconButton( 'wikiterm-trigger-cx', true )
			)
		);
		return true;
	}

	// Every other skin (Vector legacy, MonoBook, Timeless, …): a plain item in
	// the page-actions menu ("المزيد" on Vector legacy and Timeless), or in the
	// personal toolbar at the top when the user asked for it, falling back to
	// the toolbox.
	function addToPortlet() {
		const portlets = USER_CONFIG.placement === 'personal' ?
			[ 'p-personal', 'p-cactions', 'p-tb' ] :
			[ 'p-cactions', 'p-tb', 'p-personal' ];
		for ( let i = 0; i < portlets.length; i++ ) {
			const link = mw.util.addPortletLink( portlets[ i ], '#', LABEL, 'ca-wikiterm', TOOLTIP );
			if ( link ) {
				$( link ).find( 'a' ).addClass( 'wikiterm-trigger' ).on( 'click', onTriggerClick );
				return true;
			}
		}
		return false;
	}

	function init() {
		const skin = mw.config.get( 'skin' );
		let added = false;
		if ( skin === 'vector-2022' ) {
			added = addToVector2022();
		} else if ( skin === 'minerva' ) {
			added = addToMinerva();
		} else if ( skin === 'contenttranslation' ) {
			added = addToContentTranslation();
		}
		if ( !added ) {
			addToPortlet();
		}
	}

	$( init );
}() );
// </nowiki>
