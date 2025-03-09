// <nowiki>
/**
 * WikiTermGadget.js - MediaWiki gadget for dictionary term lookup
 * 
 * This gadget provides Arabic-English-French dictionary functionality directly
 * within MediaWiki pages without using an iframe. It uses the Wikitermbase API
 * to fetch dictionary data and presents it using OOJS UI.
 */

// Dependencies and initialization
mw.loader.using([
  'mediawiki.util',
  'jquery',
  'oojs-ui-core',
  'oojs-ui-widgets',
  'oojs-ui-windows',
  'oojs-ui.styles.icons-editing-citation',
  'oojs-ui.styles.icons-interactions'
], function () {
  'use strict';
  console.log('WikiTermGadget: Script loading...');

  // API endpoint configuration
  const API_ENDPOINT = 'https://wikitermbase.toolforge.org/api/v1/search/aggregated';

  function createCitationTemplate(term) {
    const wikidataId = term.dictionary_wikidata_id || '';

    if (term.page) {
      return `{{استشهاد بويكي بيانات|${wikidataId}|ص=${term.page}}}`;
    } else {
      return `{{استشهاد بويكي بيانات|${wikidataId}}}`;
    }
  }

  // Dictionary Dialog
  function WikiTermDialog(config) {
    WikiTermDialog.super.call(this, config);
  }
  OO.inheritClass(WikiTermDialog, OO.ui.ProcessDialog);

  // Configure dialog
  WikiTermDialog.static.name = 'wikiTermDialog';
  WikiTermDialog.static.title = 'مسرد الويكي';
  WikiTermDialog.static.size = 'larger';
  WikiTermDialog.static.position = 'centered';
  WikiTermDialog.static.actions = [
    {
      action: 'close',
      label: 'إغلاق',
      flags: ['safe', 'close']
    }
  ];

  // Set up the dialog layout
  WikiTermDialog.prototype.initialize = function () {
    WikiTermDialog.super.prototype.initialize.call(this);
    
    // Create UI components
    this.searchInput = new OO.ui.TextInputWidget({
      placeholder: 'ابحث عن مصطلح (بالإنجليزية أو الفرنسية أو العربية)...',
      autocomplete: false,
      dir: 'auto',
      classes: ['wikiterm-search-input']
    });
    
    this.searchButton = new OO.ui.ButtonWidget({
      icon: 'search',
      label: 'بحث'
    });
    
    this.contentArea = new OO.ui.PanelLayout({
      padded: false,
      expanded: false,
      classes: ['wikiterm-content-area']
    });
    
    this.resultsContainer = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
      framed: false,
      classes: ['wikiterm-results-container']
    });
    
    this.loadingIndicator = new OO.ui.ProgressBarWidget({
      progress: false
    });
    this.loadingIndicator.$element.hide();
    
    this.errorMessage = new OO.ui.MessageWidget({
      type: 'error',
      inline: true
    });
    this.errorMessage.$element.hide();
    
    // Create search form
    const searchForm = new OO.ui.ActionFieldLayout(
      this.searchInput,
      this.searchButton,
      {
        align: 'top',
        label: 'ابحث عن مصطلح عربي أو إنكليزي أو فرنسي',
        classes: ['wikiterm-search-form']
      }
    );
    
    // Append search form to top section
    this.$body.append(
      searchForm.$element,
      this.loadingIndicator.$element,
      this.errorMessage.$element
    );
    
    // Add results container to content area
    this.contentArea.$element.append(
      this.resultsContainer.$element
    );
    
    // Add content area to body
    this.$body.append(this.contentArea.$element);
    
    // State variables
    this.expandedGroups = {};
    this.currentResults = null;
    this.activePopup = null;
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Apply CSS
    this.applyCustomCSS();
  };
  
  WikiTermDialog.prototype.setupEventHandlers = function () {
    // Search on button click
    this.searchButton.connect(this, { click: 'performSearch' });
    
    // Search on enter key
    this.searchInput.connect(this, { enter: 'performSearch' });
    
    // Click outside popup closes the popup
    this.$element.on('click', (e) => {
      if (this.activePopup && !$(e.target).closest('.wikiterm-citation-popup').length) {
        this.closeActivePopup();
      }
    });
  };
  
  WikiTermDialog.prototype.performSearch = function () {
    const searchTerm = this.searchInput.getValue().trim();
    
    if (!searchTerm) {
      this.resultsContainer.$element.empty();
      return;
    }
    
    // Show loading indicator
    this.loadingIndicator.$element.show();
    this.errorMessage.$element.hide();
    
    // Fetch results from API
    $.ajax({
      url: API_ENDPOINT,
      data: { q: searchTerm },
      method: 'GET',
      dataType: 'json'
    })
    .done((data) => {
      this.currentResults = data;
      this.renderResults(data);
    })
    .fail((error) => {
      console.error('WikiTermGadget: Search failed', error);
      this.errorMessage.setLabel('فشل البحث. الرجاء المحاولة مرة أخرى لاحقًا.');
      this.errorMessage.$element.show();
      this.resultsContainer.$element.empty();
    })
    .always(() => {
      this.loadingIndicator.$element.hide();
    });
  };
  
  WikiTermDialog.prototype.renderResults = function (data) {
    const container = this.resultsContainer.$element;
    container.empty();
    
    if (!data.groups || data.groups.length === 0) {
      const noResults = $('<div>')
        .addClass('wikiterm-no-results')
        .text('لا توجد نتائج');
      
      container.append(noResults);
      return;
    }
    
    // Update dialog size after adding results
    setTimeout(() => {
      this.updateSize();
    }, 100);
    
    // Create results list
    const resultsList = $('<div>').addClass('wikiterm-results-list');
    
    data.groups.forEach((group, groupIndex) => {
      const isFirstGroup = groupIndex === 0;
      const resultCard = this.createResultCard(group, groupIndex, isFirstGroup);
      resultsList.append(resultCard);
    });
    
    container.append(resultsList);
  };
  
  WikiTermDialog.prototype.createResultCard = function (group, groupIndex, isHighlighted) {
    const isExpanded = this.expandedGroups[groupIndex] === true;
    const card = $('<div>')
      .addClass('wikiterm-result-card')
      .toggleClass('wikiterm-result-highlighted', isHighlighted);
    
    // Header with Arabic term
    const header = $('<div>')
      .addClass('wikiterm-result-header')
      .append(
        $('<span>')
          .addClass('wikiterm-arabic-term')
          .text(group.arabic_normalised)
      );
    
    // Add English and French translations
    const translations = $('<div>').addClass('wikiterm-translations');
    
    // English translation
    if (group.english_normalised) {
      translations.append(
        $('<span>')
          .addClass('wikiterm-translation wikiterm-en')
          .append(
            $('<span>').addClass('wikiterm-lang-tag').text('EN'),
            ' ',
            $('<span>').text(group.english_normalised)
          )
      );
    }
    
    // French translation (if available)
    if (group.french_normalised) {
      translations.append(
        $('<span>')
          .addClass('wikiterm-translation wikiterm-fr')
          .append(
            $('<span>').addClass('wikiterm-lang-tag').text('FR'),
            ' ',
            $('<span>').text(group.french_normalised)
          )
      );
    }
    
    header.append(translations);
    
    // Dictionary count
    const dictCount = group.dictionary_ids.length;
    const dictCountText = dictCount === 1 
      ? 'معجم واحد' 
      : (dictCount === 2 
        ? 'معجمان' 
        : (dictCount <= 10
          ? `${dictCount} معاجم`
          : `${dictCount} معجم`));
    
    const dictCountEl = $('<div>')
      .addClass('wikiterm-dictionary-count')
      .text(dictCountText);
    
    // Toggle button
    const toggleButton = new OO.ui.ButtonWidget({
      icon: isExpanded ? 'collapse' : 'expand',
      framed: false,
      title: isExpanded ? 'تصغير' : 'توسيع'
    });
    
    toggleButton.on('click', () => {
      this.toggleGroup(groupIndex);
    });
    
    // Append header elements
    header.append(dictCountEl, toggleButton.$element);
    card.append(header);
    
    // Details section (hidden by default unless expanded)
    const details = $('<div>')
      .addClass('wikiterm-result-details')
      .toggleClass('wikiterm-hidden', !isExpanded);
    
    if (isExpanded) {
      // Variants section
      const variants = $('<div>').addClass('wikiterm-variants');
      const variantsList = $('<ul>').addClass('wikiterm-variants-list');
      
      group.occurences.forEach((term) => {
        const variant = this.createVariantItem(term);
        variantsList.append(variant);
      });
      
      variants.append(
        variantsList
      );
      
      details.append(variants);
    }
    
    card.append(details);
    
    // Make header clickable to toggle details
    header.on('click', (e) => {
      // Prevent toggles when clicking links or buttons
      if (!$(e.target).closest('a, .oo-ui-buttonElement-button').length) {
        this.toggleGroup(groupIndex);
      }
    });
    
    return card;
  };
  
  WikiTermDialog.prototype.createVariantItem = function (term) {
    const item = $('<li>').addClass('wikiterm-variant-item');
    
    // Term information
    const termInfo = $('<div>').addClass('wikiterm-term-info');
    
    // Arabic term
    termInfo.append(
      $('<span>')
        .addClass('wikiterm-term-arabic')
        .text(term.arabic)
    );
    
    // English translation
    if (term.english) {
      termInfo.append(
        $('<span>')
          .addClass('wikiterm-term-translation')
          .append(
            $('<span>').addClass('wikiterm-lang-tag').text('EN'),
            ' ',
            $('<span>').text(term.english)
          )
      );
    }
    
    // French translation (if available)
    if (term.french) {
      termInfo.append(
        $('<span>')
          .addClass('wikiterm-term-translation')
          .append(
            $('<span>').addClass('wikiterm-lang-tag').text('FR'),
            ' ',
            $('<span>').text(term.french)
          )
      );
    }
    
    item.append(termInfo);
    
    // Dictionary information
    const dictInfo = $('<div>').addClass('wikiterm-dictionary-info');
    
    // Dictionary name
    const dictionaryName = $('<span>')
      .addClass('wikiterm-dictionary-name')
      .text(term.dictionary_name_arabic || 'قاموس');

    // Add link to Wikidata item if available
    if (term.dictionary_wikidata_id) {
      dictionaryName.wrapInner('<a>')
      .children('a')
      .attr('href', `https://wikidata.org/wiki/${term.dictionary_wikidata_id}`)
      .attr('target', '_blank');
    }

    dictInfo.append(dictionaryName);

    // Page number if available
    if (term.page) {
      dictInfo.append(
        $('<span>')
          .addClass('wikiterm-dictionary-page')
          .text(`ص. ${term.page}`)
      );
    }
    
    // Add citation button if Wikidata ID is available
    if (term.dictionary_wikidata_id) {
      const citationBtn = new OO.ui.ButtonWidget({
        icon: 'reference',
        framed: false,
        title: 'استشهد بهذا المصطلح',
        classes: ['wikiterm-citation-button']
      });
      
      citationBtn.on('click', () => {
        this.showCitationPopup(citationBtn.$element, term);
      });
      
      dictInfo.append(citationBtn.$element);
    }
    
    // External link if available
    if (term.uri) {
      const externalLink = new OO.ui.ButtonWidget({
        icon: 'linkExternal',
        framed: false,
        classes: ['wikiterm-external-link']
      });
      
      externalLink.on('click', () => {
        window.open(term.uri, '_blank');
      });
      
      dictInfo.append(externalLink.$element);
    }
    
    item.append(dictInfo);
    
    // Description (if available)
    if (term.description) {
      const descriptionLimit = 200;
      const description = term.description;
      const isLongDescription = description.length > descriptionLimit;
      
      const descriptionEl = $('<div>').addClass('wikiterm-description');
      const descriptionText = $('<div>').addClass('wikiterm-description-text');
      
      if (isLongDescription) {
        // Create short version
        const shortText = $('<div>')
          .addClass('wikiterm-description-short')
          .text(description.substring(0, descriptionLimit) + '...')
          .show();
        
        // Create full version
        const fullText = $('<div>')
          .addClass('wikiterm-description-full')
          .text(description)
          .hide();
        
        // Add toggle buttons
        const showMoreBtn = $('<button>')
          .addClass('wikiterm-description-toggle')
          .text('عرض المزيد')
          .on('click', function() {
            shortText.hide();
            fullText.show();
            $(this).hide();
            showLessBtn.show();
          });
        
        const showLessBtn = $('<button>')
          .addClass('wikiterm-description-toggle')
          .text('عرض أقل')
          .hide()
          .on('click', function() {
            fullText.hide();
            shortText.show();
            $(this).hide();
            showMoreBtn.show();
          });
        
        descriptionText.append(shortText, fullText);
        descriptionEl.append(
          descriptionText,
          showMoreBtn,
          showLessBtn
        );
      } else {
        // Short description doesn't need toggle
        descriptionText.text(description);
        descriptionEl.append(
          descriptionText
        );
      }
      
      item.append(descriptionEl);
    }
    
    return item;
  };
  
  WikiTermDialog.prototype.toggleGroup = function (groupIndex) {
    // Toggle the expanded state
    this.expandedGroups[groupIndex] = !this.expandedGroups[groupIndex];
    
    // Re-render results with the new expanded state
    if (this.currentResults) {
      this.renderResults(this.currentResults);
    }
  };
  
  WikiTermDialog.prototype.showCitationPopup = function ($target, term) {
    // Close any open popup
    this.closeActivePopup();
    
    // Generate citation template
    const template = createCitationTemplate(term);
    
    // Create popup
    const popup = $('<div>')
      .addClass('wikiterm-citation-popup')
      .css({
        position: 'absolute',
        zIndex: 1000,
        backgroundColor: '#fff',
        border: '1px solid #a2a9b1',
        borderRadius: '2px',
        padding: '8px',
        boxShadow: '0 2px 2px 0 rgba(0,0,0,0.25)',
        width: '300px'
      });
    
    // Title
    popup.append(
      $('<div>')
        .addClass('wikiterm-citation-title')
        .text('رمز الاستشهاد')
    );
    
    // Text area with citation
    const textarea = $('<textarea>')
      .addClass('wikiterm-citation-text')
      .val(template)
      .attr('readonly', 'readonly')
      .css({
        width: '100%',
        height: '80px',
        margin: '8px 0',
        padding: '4px',
        resize: 'none',
        fontFamily: 'monospace'
      });
    
    // Copy button
    const copyBtn = new OO.ui.ButtonWidget({
      label: 'نسخ',
      icon: 'copy',
      flags: ['progressive']
    });
    
    copyBtn.on('click', () => {
      textarea.select();
      document.execCommand('copy');
      
      // Show copied message
      copyBtn.setLabel('تم النسخ!');
      setTimeout(() => {
        copyBtn.setLabel('نسخ');
      }, 2000);
    });
    
    popup.append(textarea, copyBtn.$element);
    
    // Position the popup
    const targetOffset = $target.offset();
    const dialogOffset = this.$element.offset();
    
    // Adjust position relative to dialog
    popup.css({
      top: (targetOffset.top - dialogOffset.top + $target.outerHeight() + 5) + 'px',
      left: (targetOffset.left - dialogOffset.left) + 'px'
    });
    
    // Add to DOM
    this.$element.append(popup);
    this.activePopup = popup;
    
    // Focus and select text
    setTimeout(() => {
      textarea.focus().select();
    }, 100);
  };
  
  WikiTermDialog.prototype.closeActivePopup = function () {
    if (this.activePopup) {
      this.activePopup.remove();
      this.activePopup = null;
    }
  };
  
  WikiTermDialog.prototype.getActionProcess = function (action) {
    if (action === 'close') {
      return new OO.ui.Process(() => {
        this.close();
      });
    }
    return WikiTermDialog.super.prototype.getActionProcess.call(this, action);
  };
  
  // When the dialog is ready, focus on the search input
  WikiTermDialog.prototype.getReadyProcess = function (data) {
    return WikiTermDialog.super.prototype.getReadyProcess.call(this, data)
      .next(() => {
        // Focus on the search input - using a more reliable method
        if (this.searchInput) {
          this.searchInput.focus();
        }
      });
  };
  
  // Apply custom CSS for the gadget
  WikiTermDialog.prototype.applyCustomCSS = function () {
    mw.util.addCSS(`
      /* Fix dialog size and layout */
      .oo-ui-window-frame {
        max-height: 80vh !important;
      }
      
      /* Make sure top controls stay in place */
      .wikiterm-search-form {
        margin: 12px 12px 12px 12px; /* top right bottom left */
        background: #fff;
        z-index: 2;
      }
      
      .wikiterm-search-input {
        width: 100%;
      }
      
      /* Content area styling */
      .wikiterm-content-area {
        width: 100%;
        border-top: 1px solid #eaecf0;
        padding-top: 10px;
      }
      
      /* Results scrollable container */
      .wikiterm-results-container {
        max-height: 60vh;
        overflow-y: auto;
        padding-right: 10px;
        margin-bottom: 20px;
      }
      .wikiterm-no-results {
        padding: 16px;
        text-align: center;
        color: #72777d;
      }
      .wikiterm-results-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .wikiterm-result-card {
        border: 1px solid #eaecf0;
        border-radius: 4px;
        overflow: hidden;
      }
      .wikiterm-result-highlighted {
        border-color: #36c;
        box-shadow: 0 0 0 1px #36c;
      }
      .wikiterm-result-header {
        padding: 12px;
        background-color: #f8f9fa;
        cursor: pointer;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .wikiterm-result-highlighted .wikiterm-result-header {
        background-color: #eaf3ff;
      }
      .wikiterm-arabic-term {
        font-size: 16px;
        font-weight: bold;
        margin-right: 12px;
      }
      .wikiterm-translations {
        flex-grow: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .wikiterm-translation {
        font-size: 14px;
      }
      .wikiterm-lang-tag {
        color: #72777d;
        font-size: 12px;
        font-weight: bold;
      }
      .wikiterm-dictionary-count {
        color: #72777d;
        font-size: 12px;
        margin-left: auto;
      }
      .wikiterm-result-details {
        padding: 16px;
        border-top: 1px solid #eaecf0;
        background-color: #fff;
      }
      .wikiterm-hidden {
        display: none;
      }
      .wikiterm-variants-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .wikiterm-variant-item {
        padding: 8px;
        border-bottom: 1px solid #eaecf0;
      }
      .wikiterm-variant-item:last-child {
        border-bottom: none;
      }
      .wikiterm-term-info {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
      }
      .wikiterm-term-arabic {
        font-weight: bold;
        margin-right: 8px;
      }
      .wikiterm-term-translation {
        color: #222;
      }
      .wikiterm-dictionary-info {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .wikiterm-dictionary-name {
        color: #36c;
        font-size: 13px;
      }
      .wikiterm-description {
        margin-top: 8px;
        font-size: 13px;
        color: #54595d;
      }
      .wikiterm-description h5 {
        margin: 0 0 4px 0;
        font-size: 13px;
        color: #222;
      }
      .wikiterm-description-toggle {
        color: #36c;
        background: none;
        border: none;
        padding: 0;
        font-size: 13px;
        cursor: pointer;
        margin-top: 4px;
      }
      .wikiterm-description-toggle:hover {
        text-decoration: underline;
      }
    `);
  };

  // Initialize main functionality
  function initialize() {
    const windowManager = new OO.ui.WindowManager();
    $('body').append(windowManager.$element);
    const dialog = new WikiTermDialog();
    windowManager.addWindows([dialog]);

    const button = new OO.ui.ButtonWidget({
      label: 'مسرد الويكي',
      icon: 'articlesSearch',
      flags: ['progressive'],
      framed: true
    });

    // Different integration points based on skin
    if (mw.config.get('skin') === 'minerva') {
      console.log('WikiTermGadget: Mobile skin detected');
      button.$element.addClass('mobile-wiki-dictionary-button');
      mw.util.addCSS(`
        .mobile-wiki-dictionary-button {
          margin: 0.5em auto;
          padding: 8px;
          display: block;
          text-align: center;
          background: #fff;
          border-bottom: 1px solid #eaecf0;
        }
        .mobile-wiki-dictionary-button .oo-ui-buttonElement-button {
          width: 90%;
          max-width: 300px;
        }
      `);
      $('.header-container').after(button.$element);
    } else if ($('.vector-search-box').length) {
      // Vector 2
      $('.vector-search-box').after(button.$element);
      console.log('WikiTermGadget: Button added to Vector 2');
    } else {
      // Vector legacy
      $('#p-search').after(button.$element);
      console.log('WikiTermGadget: Button added to Vector legacy');
    }

    button.on('click', function () {
      windowManager.openWindow(dialog);
    });
  }

  $(document).ready(function () {
    initialize();
    console.log('WikiTermGadget: Initialization complete');
  });
});
// </nowiki>