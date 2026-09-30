const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, data) => fs.writeFileSync(path.join(root, f), data, 'utf8');

const getBody = (src, open, close) => {
  const lines = src.split('\n');
  const i = lines.indexOf(open);
  const j = lines.lastIndexOf(close);
  if (i < 0 || j < 0 || j <= i) { return null; }
  return lines.slice(i + 1, j).join('\n');
};

const gadgetSrc = read('Gadget-WikiTerm.js');
const gadgetBody = getBody(gadgetSrc, '( function () {', '}() );');

const scriptSrc = read('SearchTerm.js');
const lines = scriptSrc.split('\n');
const openIdx = lines.indexOf("mw.loader.using( [ 'mediawiki.util' ] ).then( () => {" );
const closeIdx = lines.lastIndexOf('} );');

if (openIdx < 0 || closeIdx < 0 || closeIdx <= openIdx) {
  console.error('Failed to find wrapper lines in SearchTerm.js');
  process.exit(1);
}

if (!gadgetBody) {
  console.error('Failed to find IIFE lines in Gadget-WikiTerm.js');
  process.exit(1);
}

const header = lines.slice(0, openIdx + 1).join('\n');
const footer = lines.slice(closeIdx).join('\n');

const newScriptSrc = header + '\n' + gadgetBody + '\n' + footer;
write('SearchTerm.js', newScriptSrc);
console.log('Successfully synchronized SearchTerm.js with Gadget-WikiTerm.js');
