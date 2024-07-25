// // Minimal code to test user scripts
// $('#bodyContent').prepend('<p>Hello world! (test user script)</p>');

/**
 * Parses an HTML string and extracts data from specific columns.
 * 
 * @param {string} htmlString - The HTML string, contains a table.
 * @returns {Array} An array of objects containing the extracted data.
 * 
 * @example
 * // Example usage
 * const htmlString = '<table>...</table>'; // Replace with your HTML string
 * const extractedData = parseTable(htmlString);
 * console.log(extractedData);
 * // Output:
 * // [
 * //   {
 * //     ar: "مقراب",
 * //     en: "telescope",
 * //     ge: "",
 * //     fr: "télescope",
 * //     url: "http://www.arabterm.org/index.php?id=40&L=1&tx_3m5techdict_pi1[id]=140327",
 * //   },
 * //   ...
 * // ]
 */
function parseTable(htmlString) {


    // Parse the HTML string into a document
    // Otherwise, to parse default document: const doc = document;
    const doc = new DOMParser().parseFromString(htmlString, "text/html")

    // Example usage (assuming you have a reference to the table element)
    const tableElement = doc.querySelector('table'); // Replace with your selector
    const rows = tableElement.querySelectorAll('tr'); // Select all rows
    const searchData = [];

    // Skip row[0] because it is the header row
    // Loop through remaining rows
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        const result = {
            'en': cells[2].textContent.trim(),
            'ge': cells[3].textContent.trim(),
            'fr': cells[4].textContent.trim(),
            'ar': cells[5].textContent.trim(),
            'url': cells[2].querySelector('a').href, // hiden in english column
        };

        searchData.push(result);
    }
    return searchData
}

function getSearchPage(term) {
    // ES6 (ES2015) doesn't support async/await. So we need to use Promise
    return new Promise((resolve, reject) => {
        const urlencoded = new URLSearchParams();
        urlencoded.append('tx_3m5techdict_pi1[action]', 'search');
        urlencoded.append('tx_3m5techdict_pi1[sword]', term);
        var requestOptions = {
            method: "POST",
            body: urlencoded,
            redirect: "follow"
        };

        const LOCAL_TESTING = false;
        const USE_CORS_PROXY = true;
        const arabTermUrl = 'http://www.arabterm.org/index.php?L=1';
        var fullUrl = arabTermUrl;

        if (USE_CORS_PROXY) {
            // URL with CORS proxy
            var fullUrl = 'https://corsproxy.io/?' + encodeURIComponent(arabTermUrl);
        }

        if (LOCAL_TESTING) {
            // URL to test with localhost:
            var fullUrl = 'http://localhost:8000/exampleTelescope.html';
            requestOptions = { method: 'GET' };
        }

        fetch(fullUrl, requestOptions)
            .then(response => response.text())
            .then(responseText => resolve(responseText))
            .catch(error => reject(error));
    });
}



// // Example usage: search for term 'telescope'
// responseText = await getSearchPage('telescope')
// const jsonDataString = parseTable(responseText);
// console.log(jsonDataString);

mw.loader.using(['oojs-ui-core', 'oojs-ui-widgets', 'oojs-ui-windows']).done(function () {
    $(function () {

        var widgets = {};

        /////////
        // ================================================= //
        OO.ui.TableWidget = function OoUiTableWidget(config) {
            // Parent constructor
            OO.ui.TableWidget.super.call(this, config);

            // Create table element
            this.$table = $('<table>')
                .addClass('oo-ui-tableWidget')
                .css('border', '2px solid rgb(140 140 140)')
                .css('border-collapse', 'collapse').css('text-align', 'center');

            // Append the table to the widget's $element
            this.$element.append(this.$table);
        };

        OO.inheritClass(OO.ui.TableWidget, OO.ui.Widget);

        // Method to set headers
        OO.ui.TableWidget.prototype.setHeaders = function () {
            var thead = $('<thead>');
            const trHead = $('<tr>');
            const cssThBorder = '1px solid rgb(160 160 160)';
            const cssThPadding = '8px 10px';
            trHead.append($('<th scope="col">').css('border', cssThBorder).css('padding', cssThPadding).text('العربية'));
            trHead.append($('<th scope="col">').css('border', cssThBorder).css('padding', cssThPadding).text('الفرنسية'));
            trHead.append($('<th scope="col">').css('border', cssThBorder).css('padding', cssThPadding).text('الإنجليزية'));

            thead.append(trHead);
            this.$table.append(thead);
        };

        // Method to add rows
        OO.ui.TableWidget.prototype.addRows = function (searchData) {
            const tbody = $('<tbody>');
            searchData.forEach(item => {
                const row = $('<tr>');
                const cssTdBorder = '1px solid rgb(160 160 160)';
                const cssTdPadding = '8px 10px';

                // row.append($('<td>').css('border', cssTdBorder).css('padding', cssTdPadding).text(item.ar));

                row.append(
                    $('<td>')
                        .css('border', cssTdBorder)
                        .css('padding', cssTdPadding)
                        .append(
                            $('<a>')
                                .attr('href', item.url)
                                .attr('target', '_blank')
                                .text(item.ar)
                        )
                );
                // TODO: icon of external link ?

                // TODO: add link to arabterm.org
                // const arColumn = $('<td>').css('border', cssTdBorder).css('padding', cssTdPadding).append(
                //   $('<span>').text(item.ar)
                // ).append(
                //   new OO.ui.ButtonWidget({
                //     framed: false,
                //     flags: ['progressive'],
                //     icon: 'external-link',
                //     href: item.url,
                //     target: '_blank',
                //     invisibleLabel: true,
                //   }).$element
                // );
                // row.append(arColumn);
                //
                row.append($('<td>').css('border', cssTdBorder).css('padding', cssTdPadding).text(item.fr));
                row.append($('<td>').css('border', cssTdBorder).css('padding', cssTdPadding).text(item.en));
                tbody.append(row);
            });
            this.$table.append(tbody);
        };

        // ================================================= //
        // Integrate Custom Widget with OO.ui.SearchWidget
        // Extend the OO.ui.SearchWidget to use your TableWidget
        OO.ui.CustomSearchWidget = function OoUiCustomSearchWidget(config) {
            // Parent constructor
            OO.ui.CustomSearchWidget.super.call(this, config);

            // Replace the results widget with a custom table widget
            this.results = new OO.ui.TableWidget();

            // Class oo-ui-searchWidget-results has a css line-hight:0
            // => must disable it for table to display correctly
            this.results.$element.addClass('oo-ui-searchWidget-results').css('line-height', 'normal');

            // Replace the results menu with our custom table
            this.$results.replaceWith(this.results.$element);
            this.$results = this.results.$element;
        };

        // Inherit from OO.ui.SearchWidget
        OO.inheritClass(OO.ui.CustomSearchWidget, OO.ui.SearchWidget);

        // Method to set search results
        OO.ui.CustomSearchWidget.prototype.displayResults = function (searchData) {
            this.results.$table.empty(); // Clear previous results
            this.results.setHeaders();
            this.results.addRows(searchData);
        };

        // ================================================= //


        // Initial example from: https://www.mediawiki.org/wiki/OOUI/Windows/Process_Dialogs
        // Subclass ProcessDialog.
        function ProcessDialog(config) {
            ProcessDialog.super.call(this, config);
        }
        OO.inheritClass(ProcessDialog, OO.ui.ProcessDialog);

        // Specify a name for .addWindows()
        ProcessDialog.static.name = 'myDialog';
        // Specify a static title and actions.
        ProcessDialog.static.title = 'البحث عن مصطلحات';
        ProcessDialog.static.actions = [
            { action: 'cancel', label: 'Cancel', flags: ['safe', 'close'] }
        ];


        // Use the initialize() method to add content to the dialog's $body,
        // to initialize widgets, and to set up event handlers.
        ProcessDialog.prototype.initialize = function () {
            ProcessDialog.super.prototype.initialize.apply(this, arguments);

            // TODO: use OO.ui.ButtonInputWidget instead ? (in OO.ui.FormLayout)
            // TODO: use OO.ui.PanelLayout to display results ?
            // this.searchWidget = new OO.ui.SearchWidget();
            this.searchWidget = new OO.ui.CustomSearchWidget();
            widgets.searchWidget = this.searchWidget;

            // // Initialisation example: add 10 items
            // var items = [];
            // for (let i = 1; i <= 10; i++) {
            //   items.push(new OO.ui.OptionWidget({ data: i, label: 'Item ' + i }));
            // }
            // this.searchWidget.results.addItems(items);

            this.searchWidget.onQueryChange = function () {
                // console.log('query changed');
            };
            this.searchWidget.onQueryEnter = function () {
                var term = this.getQuery().value; // here 'this' is the searchWidget
                console.log('term:', term);

                getSearchPage(term)
                    .then(responseText => parseTable(responseText))
                    .then(searchData => {
                        console.log(searchData);

                        this.displayResults(searchData); // `this` is the searchWidget
                    })
                    .catch(error => console.error(error));


                // fetch('https://dummyjson.com/products')
                //   .then(res => res.json())
                //   .then(data => {
                //     console.log(data); // Response from the server
                //     this.results.clearItems();  // here 'this' is the searchWidget
                //     data['products'].forEach(item => {
                //       this.results.addItems([new OO.ui.OptionWidget({ data: item.id, label: item.title + ' / ' + item.category })]);
                //     });
                //   })
                //   .catch(error => {
                //     console.error('Error:', error);
                //   });

            };


            this.$body.append(this.searchWidget.$element);

        };

        // Use the getActionProcess() method to specify a process to handle the
        // actions (for the 'save' action, in this example).
        ProcessDialog.prototype.getActionProcess = function (action) {
            var dialog = this;
            if (action) {
                return new OO.ui.Process(function () {
                    dialog.close({
                        action: action
                    });
                });
            }
            // Fallback to parent handler.
            return ProcessDialog.super.prototype.getActionProcess.call(this, action);
        };

        // Get dialog height.
        ProcessDialog.prototype.getBodyHeight = function () {
            // return this.searchWidget.$element.outerHeight(true); // FIXME: not working
            return 300
        };

        // Create and append the window manager.
        var windowManager = new OO.ui.WindowManager();
        $(document.body).append(windowManager.$element);

        // Create a new dialog window.
        var processDialog = new ProcessDialog({
            size: 'large'
        });

        // Add windows to window manager using the addWindows() method.
        windowManager.addWindows([processDialog]);

        widgets.processDialog = processDialog;



        widgets.button = new OO.ui.ButtonWidget({
            label: 'البحث عن مصطلح',
            icon: 'search',
            flags: ['progressive'],
            framed: false,
        });
        widgets.button.on('click', function () {
            // OO.ui.alert('You clicked the button!');
            // Open the window.
            windowManager.openWindow(processDialog);
        });

        if (mw.config.get('wgPageName') === 'Special:ContentTranslation') {
            var checkElement = setInterval(function () {
                if ($('.cx-feedback-link').length) {
                    clearInterval(checkElement);
                    $('.cx-feedback-link').prepend(widgets.button.$element);
                }
            }, 100);

        } else {
            $('#p-search').after(widgets.button.$element);
            // $('#mw-content-text').append(button.$element);
        }

        // expose this so we can reference widgets in the console
        mw.mywidgets = widgets;
    });
});
