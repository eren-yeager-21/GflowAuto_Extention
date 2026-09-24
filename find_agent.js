const fs = require('fs');
const content = fs.readFileSync('./assets/index.ts-DFAayvhs.js', 'utf8');

let pos = 0;
let count = 0;
while ((pos = content.indexOf('Agent', pos)) !== -1) {
  count++;
  console.log('--- ' + count + ' at ' + pos + ' ---');
  console.log(content.slice(Math.max(0, pos - 60), pos + 100));
  pos += 5;
}
