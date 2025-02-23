// <nowiki>
mw.loader.using([
  'mediawiki.util',
  'jquery',
  'oojs-ui-core',
  'oojs-ui-widgets',
  'oojs-ui-windows'
], function () {
  console.log('WikiDictionary: Script loading...');

  // Create dialog
  function WikiTermDialog(config) {
    WikiTermDialog.super.call(this, config);
  }
  OO.inheritClass(WikiTermDialog, OO.ui.ProcessDialog);

  // Configure dialog
  WikiTermDialog.static.name = 'wikiTermDialog';
  WikiTermDialog.static.size = 'larger';
  WikiTermDialog.static.actions = [
    {
      action: 'close',
      label: 'Close',
      flags: ['safe', 'close']
    }
  ];

  // Set up the dialog layout
  WikiTermDialog.prototype.initialize = function () {
    WikiTermDialog.super.prototype.initialize.call(this);
    this.content = $('<iframe>')
      .attr({
        src: 'https://wikitermbase.toolforge.org/',
        width: '100%',
        allow: 'clipboard-read; clipboard-write',
      })
      .css({
        'height': $(window).height() < 600 ? '100vh' : '80vh'
      });
    this.$body.append(this.content);
  };

  // Handle dialog actions
  WikiTermDialog.prototype.getActionProcess = function (action) {
    if (action === 'close') {
      return new OO.ui.Process(function () {
        this.close();
      }, this);
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
      icon: 'search',
      flags: ['progressive'],
      framed: false
    });

    // Mobile-specific styling
    if (mw.config.get('skin') === 'minerva') {
      console.log('WikiDictionary: Mobile skin detected');
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
      console.log('WikiDictionary: Button added to Vector 2');
    } else {
      // Vector legacy
      $('#p-search').after(button.$element);
      console.log('WikiDictionary: Button added to Vector legacy');
    }

    button.on('click', function () {
      windowManager.openWindow(dialog);
    });
  }

  $(document).ready(function () {
    initialize();
    console.log('WikiDictionary: Initialization complete');
  });
});
// </nowiki>
