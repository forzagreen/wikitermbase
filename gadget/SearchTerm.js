// <nowiki>
mw.loader.using(['mediawiki.util', 'jquery', 'oojs-ui-core', 'oojs-ui-widgets'], function () {
  console.log('WikiDictionary: Script loading...');

  // Add styles
  const styles = `
    /* Modal styles */
    #wdict-modal {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .wdict-hidden {
      display: none !important;
    }

    .wdict-modal-content {
      background: white;
      border-radius: 8px;
      width: 90%;
      max-width: 800px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      box-sizing: border-box;
    }

    .wdict-header {
      padding: 1rem;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .wdict-header h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: bold;
    }

    .wdict-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.5rem;
      color: #666;
    }

    .wdict-search {
      padding: 1rem;
      position: relative;
      box-sizing: border-box;
    }

    .wdict-search input {
      width: 100%;
      padding: 0.75rem 2.5rem 0.75rem 1rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 1rem;
      box-sizing: border-box;
    }

    .wdict-search-icon {
      position: absolute;
      left: 1.5rem;
      top: 50%;
      transform: translateY(-50%);
      color: #666;
    }

    .wdict-results {
      padding: 1rem;
    }

    /* Result card styles */
    .wdict-result {
      border: 1px solid #eee;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
      position: relative;
      transition: border-color 0.2s;
    }

    .wdict-result:hover {
      border-color: #ddd;
    }

    .wdict-side-column {
      position: absolute;
      top: 1rem;
      right: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      width: 2rem;
    }

    .wdict-result-number {
      font-size: 1.125rem;
      font-weight: 600;
      color: #9ca3af;
    }

    .wdict-external-link {
      color: #2563eb;
      transition: color 0.2s;
    }

    .wdict-external-link:hover {
      color: #1d4ed8;
    }

    .wdict-result-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      padding-right: 3rem;
    }

    .wdict-translations {
      text-align: left;
    }

    .wdict-english {
      font-weight: 600;
      font-size: 1.1rem;
    }

    .wdict-french {
      color: #666;
    }

    .wdict-meta {
      font-size: 0.9rem;
      color: #666;
      margin: 0.5rem 0;
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .wdict-meta-separator {
      margin: 0 0.25rem;
    }

    .wdict-toggle {
      background: none;
      border: none;
      color: #2196F3;
      cursor: pointer;
      padding: 0.5rem 0;
      display: flex;
      align-items: center;
    }

    .wdict-description-content {
      background: #f5f5f5;
      border-radius: 4px;
      padding: 1rem;
      margin-top: 0.5rem;
    }

    .wdict-loading {
      text-align: center;
      padding: 2rem;
      color: #666;
    }

    .wdict-error {
      text-align: center;
      padding: 2rem;
      color: #dc3545;
    }

    /* Citation styles */
    .wdict-citation-button {
      display: inline-flex;
      align-items: center;
      color: #666;
      transition: color 0.2s;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      margin-right: 0.5rem;
    }

    .wdict-citation-button:hover {
      color: #2563eb;
    }

    .wdict-citation-popup {
      position: absolute;
      left: 1rem;
      right: 1rem;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 1rem;
      z-index: 11;
      /* Change positioning */
      top: 100%;  /* Position below the button */
      margin-top: 0.5rem;  /* Add small gap */
    }

    /* Keep the responsive adjustment */
    @media (min-width: 640px) {
      .wdict-citation-popup {
        left: auto;
        right: 0;
        width: 24rem;
      }
    }

    .wdict-citation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .wdict-citation-title {
      font-weight: 600;
      color: #111;
    }

    .wdict-copy-button {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: #666;
      transition: color 0.2s;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
    }

    .wdict-copy-button:hover {
      color: #2563eb;
    }

    .wdict-citation-code {
      background: #f9fafb;
      padding: 0.5rem;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.875rem;
      color: #333;
      overflow-x: auto;
      border: 1px solid #eee;
      word-break: break-all;
    }
  `;

  // Add styles to page
  mw.util.addCSS(styles);
  console.log('WikiDictionary: Styles added');

  // Initialize main functionality
  function initialize() {
    console.log('WikiDictionary: Initializing...');

    // Create OOUI button
    const button = new OO.ui.ButtonWidget({
      label: 'البحث عن مصطلح',
      icon: 'search',
      flags: ['progressive'],
      framed: false
    });

    // Different placement based on Vector skin version
    if ($('.vector-search-box').length) {
      $('.vector-search-box').after(button.$element);
      console.log('WikiDictionary: Button added to Vector 2');
    } else {
      $('#p-search').after(button.$element);
      console.log('WikiDictionary: Button added to Vector legacy');
    }

    // Create modal container
    const modal = $(`
      <div id="wdict-modal" class="wdict-hidden" dir="rtl">
        <div class="wdict-modal-content">
          <div class="wdict-header">
            <h2>قاموس المصطلحات التقنية</h2>
            <button class="wdict-close">×</button>
          </div>
          <div class="wdict-search">
            <input type="text" placeholder="ابحث عن مصطلح..." />
            <div class="wdict-search-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
          </div>
          <div class="wdict-results"></div>
        </div>
      </div>
    `);

    $('body').append(modal);
    console.log('WikiDictionary: Modal added to DOM');

    // Event handlers
    button.on('click', function () {
      console.log('WikiDictionary: Button clicked');
      $('#wdict-modal').removeClass('wdict-hidden');
      setTimeout(() => {
        $('#wdict-modal input').focus();
      }, 0);
    });

    $('.wdict-close').on('click', function () {
      console.log('WikiDictionary: Close button clicked');
      $('#wdict-modal').addClass('wdict-hidden');
    });

    // Close on click outside
    $(document).on('click', function (e) {
      if (!$(e.target).closest('.wdict-modal-content').length
        && !$(e.target).closest('.oo-ui-buttonElement-button').length
        && !$('#wdict-modal').hasClass('wdict-hidden')) {
        console.log('WikiDictionary: Clicked outside modal');
        $('#wdict-modal').addClass('wdict-hidden');
      }

      // Close citation popups when clicking outside
      if (!$(e.target).closest('.wdict-citation-popup').length &&
        !$(e.target).closest('.wdict-citation-button').length) {
        $('.wdict-citation-popup').remove();
      }
    });

    // Search functionality
    let searchTimeout;
    $('#wdict-modal input').on('input', function () {
      const query = $(this).val();
      clearTimeout(searchTimeout);

      if (query.length < 2) {
        $('#wdict-modal .wdict-results').empty();
        return;
      }

      const resultsContainer = $('#wdict-modal .wdict-results');
      resultsContainer.html('<div class="wdict-loading">جارٍ البحث...</div>');

      searchTimeout = setTimeout(() => {
        console.log('WikiDictionary: Searching for:', query);
        fetch(`https://wikitermbase.toolforge.org/search?q=${encodeURIComponent(query)}`)
          .then(response => response.json())
          .then(data => {
            console.log('WikiDictionary: Search results received:', data);
            resultsContainer.empty();
            data.results.forEach((item, index) => {
              const resultElement = $(`
                <div class="wdict-result">
                  <div class="wdict-side-column">
                    <div class="wdict-result-number">${index + 1}</div>
                    ${item.uri ? `
                      <a href="${item.uri}" 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         class="wdict-external-link">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                      </a>
                    ` : ''}
                  </div>
                  <div class="wdict-result-header">
                    <h3>${item.arabic}</h3>
                    <div class="wdict-translations">
                      <div class="wdict-english">${item.english}</div>
                      ${item.french ? `<div class="wdict-french">${item.french}</div>` : ''}
                    </div>
                  </div>
                  <div class="wdict-meta">
                    <span>${item.dictionary_name_arabic}</span>
                    ${item.page ? `
                      <span class="wdict-meta-separator">•</span>
                      <span>ص. ${item.page}</span>
                      ` : ''}
                    ${item.dictionary_wikidata_id ? `
                      <span class="wdict-meta-separator">•</span>
                      <span>
                        QID: <a href="https://www.wikidata.org/wiki/${item.dictionary_wikidata_id}" 
                          target="_blank"
                          rel="noopener noreferrer">${item.dictionary_wikidata_id}</a>
                      </span>
                      <span class="wdict-meta-separator">•</span>
                      <button class="wdict-citation-button" data-item-id="${item.id}">
                        <span class="oo-ui-widget oo-ui-widget-enabled oo-ui-iconElement oo-ui-iconElement-icon oo-ui-icon-quotes oo-ui-labelElement-invisible oo-ui-iconWidget"></span>
                        <span style="margin-right: 0.25rem">استشهاد</span>
                      </button>
                    ` : ''}
                  </div>
                  ${item.description ? `
                    <div class="wdict-description">
                      <button class="wdict-toggle">التفاصيل</button>
                      <div class="wdict-description-content wdict-hidden">
                        ${item.description}
                      </div>
                    </div>
                  ` : ''}
                </div>
              `);

              // Add citation functionality
              let activePopup = null;
              resultElement.find('.wdict-citation-button').on('click', function (e) {
                e.stopPropagation();
                const button = $(this);

                // Remove any existing popups
                $('.wdict-citation-popup').remove();

                if (activePopup === item.id) {
                  activePopup = null;
                  return;
                }

                activePopup = item.id;

                const citation = item.page
                  ? `{{استشهاد بويكي بيانات|${item.dictionary_wikidata_id}|ص=${item.page}}}`
                  : `{{استشهاد بويكي بيانات|${item.dictionary_wikidata_id}}}`;

                const popup = $(`
                  <div class="wdict-citation-popup">
                    <div class="wdict-citation-header">
                      <span class="wdict-citation-title">رمز الاستشهاد</span>
                      <button class="wdict-copy-button">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none">
                          <path d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.912 4.895 3 6 3h8c1.105 0 2 .912 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.088 19.105 22 18 22h-8c-1.105 0-2-.912-2-2.036V9.107c0-1.124.895-2.036 2-2.036z"/>
                        </svg>
                        <span>نسخ</span>
                      </button>
                    </div>
                    <div class="wdict-citation-code">${citation}</div>
                  </div>
                `);

                // Handle copy button click
                popup.find('.wdict-copy-button').on('click', async function () {
                  try {
                    await navigator.clipboard.writeText(citation);
                    const button = $(this);
                    button.html(`
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="#16a34a" fill="none">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span style="color: #16a34a">تم النسخ</span>
                    `);
                    setTimeout(() => {
                      button.html(`
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none">
                          <path d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.912 4.895 3 6 3h8c1.105 0 2 .912 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.088 19.105 22 18 22h-8c-1.105 0-2-.912-2-2.036V9.107c0-1.124.895-2.036 2-2.036z"/>
                        </svg>
                        <span>نسخ</span>
                      `);
                    }, 2000);
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                });

                button.after(popup);
              });

              // Add description toggle functionality
              resultElement.find('.wdict-toggle').on('click', function () {
                $(this).next('.wdict-description-content').toggleClass('wdict-hidden');
              });

              resultsContainer.append(resultElement);
            });
          })
          .catch(error => {
            console.error('WikiDictionary: Search error:', error);
            resultsContainer.html('<div class="wdict-error">حدث خطأ في البحث</div>');
          });
      }, 300);
    });
  }

  // Call initialize when document is ready
  $(document).ready(function () {
    initialize();
    console.log('WikiDictionary: Initialization complete');
  });
});
// </nowiki>
