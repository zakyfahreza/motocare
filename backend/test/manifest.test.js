const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Apps Script menolak manifest yang diawali BOM UTF-8 ("Invalid manifest file").
test('appsscript.json: JSON valid tanpa BOM, scope Sheets & Drive', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'appsscript.json'));
  assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'appsscript.json tidak boleh diawali BOM');
  const m = JSON.parse(raw.toString('utf8'));
  assert.equal(m.runtimeVersion, 'V8');
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
  assert.equal(m.webapp.access, 'ANYONE_ANONYMOUS');
});
