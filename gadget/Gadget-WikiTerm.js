// <nowiki>
/**
 * Gadget-WikiTerm.js - MediaWiki gadget for dictionary term lookup
 * 
 * This gadget provides Arabic-English-French dictionary functionality directly
 * within MediaWiki pages without using an iframe. It uses the Wikitermbase API
 * to fetch dictionary data and presents it using OOJS UI.
 */
'use strict';
console.log('WikiTermGadget: Script loading...');

// API endpoint configuration
const API_ENDPOINT = 'https://wikitermbase.toolforge.org/api/v1/search/aggregated';

// Arabic count agreement (1 = bare singular, 2 = dual, 3-10 = plural,
// 11+ = singular tamyiz) for each dictionary-type bucket.
const TERMINOLOGY_COUNT_FORMS = { one: 'معجم مصطلحات واحد', two: 'معجما مصطلحات', few: 'معاجم مصطلحات', many: 'معجم مصطلحات' };
const LANGUAGE_COUNT_FORMS = { one: 'معجم لغوي واحد', two: 'معجمان لغويان', few: 'معاجم لغوية', many: 'معجم لغوي' };
const THESAURUS_COUNT_FORMS = { one: 'مسرد وب واحد', two: 'مسردا وب', few: 'مسارد وب', many: 'مسرد وب' };
// Fallback for dictionaries not yet classified with a dict_type.
const GENERIC_COUNT_FORMS = { one: 'معجم واحد', two: 'معجمان', few: 'معاجم', many: 'معجما' };

function formatCountClause(count, forms) {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (count <= 10) return `${count} ${forms.few}`;
  return `${count} ${forms.many}`;
}

function formatDictionaryCount(occurences) {
  const countByType = { terminology: 0, language: 0, thesaurus: 0, other: 0 };
  occurences.forEach((o) => {
    const type = o.dictionary_dict_type;
    countByType[type in countByType ? type : 'other'] += 1;
  });

  const clauses = [];
  if (countByType.terminology > 0) clauses.push(formatCountClause(countByType.terminology, TERMINOLOGY_COUNT_FORMS));
  if (countByType.language > 0) clauses.push(formatCountClause(countByType.language, LANGUAGE_COUNT_FORMS));
  if (countByType.thesaurus > 0) clauses.push(formatCountClause(countByType.thesaurus, THESAURUS_COUNT_FORMS));
  if (countByType.other > 0) clauses.push(formatCountClause(countByType.other, GENERIC_COUNT_FORMS));

  return clauses.join(' و ');
}

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

  this.toolPageLink = new OO.ui.HtmlSnippet(
    'للمزيد، ندعوك للاطلاع على ' +
    '<a href="https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي" target="_blank">صفحة الأداة</a>'
  );

  this.toolPageMessage = new OO.ui.MessageWidget({
    type: 'notice',
    inline: true,
    label: this.toolPageLink,
    classes: ['wikiterm-tool-page-message']
  });

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
    this.toolPageMessage.$element,
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

  if (searchTerm.length < 3) {
    this.loadingIndicator.$element.hide();
    this.errorMessage.$element.hide();
    const minLengthMsg = $('<div>')
      .addClass('wikiterm-no-results')
      .text('يرجى إدخال 3 أحرف على الأقل للبحث.');

    this.resultsContainer.$element.empty().append(minLengthMsg);
    return;
  }

  // Show loading indicator
  this.loadingIndicator.$element.show();
  this.errorMessage.$element.hide();

  // Fetch results from API
  $.ajax({
    url: API_ENDPOINT,
    data: { q: `"${searchTerm}"` },
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
  const dictCountEl = $('<div>')
    .addClass('wikiterm-dictionary-count')
    .text(formatDictionaryCount(group.occurences));

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
        .on('click', function () {
          shortText.hide();
          fullText.show();
          $(this).hide();
          showLessBtn.show();
        });

      const showLessBtn = $('<button>')
        .addClass('wikiterm-description-toggle')
        .text('عرض أقل')
        .hide()
        .on('click', function () {
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

  // Create content for the popup
  const content = new OO.ui.PanelLayout({
    padded: true,
    expanded: false
  });

  // Title
  const title = new OO.ui.LabelWidget({
    label: 'رمز الاستشهاد',
    classes: ['wikiterm-citation-title']
  });

  // Text area with citation
  const textarea = new OO.ui.MultilineTextInputWidget({
    value: template,
    readOnly: true,
    rows: 3,
    classes: ['wikiterm-citation-text']
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
    copyBtn.setLabel('نُسِخت!');
    setTimeout(() => {
      copyBtn.setLabel('نسخ');
    }, 2000);
  });

  // Add elements to the panel
  content.$element.append(
    title.$element,
    textarea.$element,
    $('<div>').css('margin-top', '8px').append(copyBtn.$element)
  );

  // Create the popup
  const popup = new OO.ui.PopupWidget({
    $content: content.$element,
    $floatableContainer: $target,
    padded: true,
    width: 300,
    align: 'forwards',
    position: 'below',
    autoClose: true,
    head: false
  });

  // Add popup to the DOM and show it
  this.$element.append(popup.$element);
  popup.toggle(true);

  this.activePopup = popup;

  // Focus and select text
  setTimeout(() => {
    textarea.focus().select();
  }, 100);
};

WikiTermDialog.prototype.closeActivePopup = function () {
  if (this.activePopup) {
    this.activePopup.toggle(false);
    this.activePopup.$element.remove();
    this.activePopup = null;
  }
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

WikiTermDialog.prototype.getActionProcess = function (action) {
  if (action === 'close') {
    return new OO.ui.Process(() => {
      this.close();
    });
  }
  return WikiTermDialog.super.prototype.getActionProcess.call(this, action);
};

// Initialize main functionality
function initialize() {
  const windowManager = new OO.ui.WindowManager();
  $('body').append(windowManager.$element);
  const dialog = new WikiTermDialog();
  windowManager.addWindows([dialog]);

  const button = new OO.ui.ButtonWidget({
    label: 'مسرد الويكي',
    invisibleLabel: true,
    icon: 'articlesSearch',
    framed: false
  });

  // Different integration points based on skin
  const skinName = mw.config.get('skin');
  if (skinName === 'minerva') {
    console.log('WikiTermGadget: Mobile skin detected');
    button.$element.addClass(
      'cdx-button cdx-button--size-large cdx-button--fake-button--enabled ' +
      'cdx-button--icon-only cdx-button--weight-quiet'
    );

    // Create a wrapper similar to the notifications element
    const $navButtonWrapper = $('<div class="minerva-dictionary">').append(
      $('<ul>').append($('<li>').append(button.$element))
    );

    // Add to navigation next to notifications
    $('.minerva-user-navigation .minerva-notifications').before($navButtonWrapper);

  } else if (skinName === 'vector-2022') {
    // Vector 2
    $('#p-vector-user-menu-userpage').after(button.$element);

    // Create a second identical button for the sticky header
    const stickyButton = new OO.ui.ButtonWidget({
      label: 'مسرد الويكي',
      invisibleLabel: true,
      icon: 'articlesSearch',
      framed: false
    });

    // Add the same click handler
    stickyButton.on('click', function () {
      windowManager.openWindow(dialog);
    });

    // Add button to sticky header when page is scrolled
    $(window).on('scroll', function () {
      if ($('.vector-sticky-header-icons').length &&
        !$('.vector-sticky-header-icons .wiki-term-sticky-button').length) {
        stickyButton.$element.addClass('wiki-term-sticky-button');
        $('.vector-sticky-header-icons').prepend(stickyButton.$element);
        console.log('WikiTermGadget: Button added to sticky header');

        // Remove this scroll handler once we've added the button
        $(window).off('scroll');
      }
    });

    console.log('WikiTermGadget: Button added to Vector 2');
  } else if (skinName === 'vector') {
    // Vector legacy
    $('#p-personal').after(button.$element);
    console.log('WikiTermGadget: Button added to Vector legacy');
  } else {
    console.warn('WikiTermGadget: unsupported skin: ' + skinName);
  }

  button.on('click', function () {
    windowManager.openWindow(dialog);
  });
}

$(document).ready(function () {
  initialize();
  console.log('WikiTermGadget: Initialization complete');
});

// </nowiki>
