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

    // Create iframe to load the external content
    this.content = $('<iframe>')
      .attr({
        src: 'https://wikitermbase.toolforge.org/',
        width: '100%',
        allow: 'clipboard-read; clipboard-write',
      })
      .css({
        'height': $(window).height() < 600 ? '100vh' : '80vh'
      });

    // Add content to dialog
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
    console.log('WikiDictionary: Initializing...');

    // Create window manager
    const windowManager = new OO.ui.WindowManager();
    $('body').append(windowManager.$element);

    // Create dialog window
    const dialog = new WikiTermDialog();
    windowManager.addWindows([dialog]);

    // Create OOUI button
    const button = new OO.ui.ButtonWidget({
      label: 'مسرد الويكي',
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

    // Add click handler to button
    button.on('click', function () {
      windowManager.openWindow(dialog);
    });
  }

  // Call initialize when document is ready
  $(document).ready(function () {
    initialize();
    console.log('WikiDictionary: Initialization complete');
  });
});
// </nowiki>
