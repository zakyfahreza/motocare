/**
 * Mock minimal layanan Google Apps Script untuk menjalankan backend/src di Node.
 * Hanya mencakup API yang dipakai MotoCare. Bukan pengganti uji di Apps Script asli.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some((l) => l.length !== this.numCols)) {
      throw new Error('setValues: ukuran data tidak cocok dengan range');
    }
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; this.setValuesCalls = 0; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if ((this.data[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.data.reduce((m, line) => {
      let last = 0;
      (line || []).forEach((v, i) => { if (v !== '' && v !== undefined) last = i + 1; });
      return Math.max(m, last);
    }, 0);
  }
  getMaxRows() { return 1000; }
  getRange(row, col, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols); }
  getDataRange() {
    const rows = Math.max(1, this.getLastRow());
    const cols = Math.max(1, this.getLastColumn());
    return new FakeRange(this, 1, 1, rows, cols);
  }
  setFrozenRows() { return this; }
}

class FakeSpreadsheet {
  constructor(name) {
    this.id = 'ss-' + crypto.randomUUID();
    this.name = name;
    this.sheets = [new FakeSheet('Sheet1')];
  }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  setSpreadsheetTimeZone() {}
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
}

function createGasContext({ today } = {}) {
  const spreadsheets = {};
  const props = {};
  const logs = [];
  const fixedNow = today ? new Date(today + 'T05:00:00Z') : null;

  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0 && fixedNow) super(fixedNow.getTime());
      else super(...args);
    }
    static now() { return fixedNow ? fixedNow.getTime() : RealDate.now(); }
  }

  const ctx = {
    console: { log() {}, error: (...a) => logs.push(['error', ...a]), warn() {} },
    Date: MockDate,
    Logger: { log: (m) => logs.push(['log', m]) },
    SpreadsheetApp: {
      create(name) { const ss = new FakeSpreadsheet(name); spreadsheets[ss.id] = ss; return ss; },
      openById(id) { if (!spreadsheets[id]) throw new Error('Spreadsheet not found'); return spreadsheets[id]; },
      flush() {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate(date, tz, fmt) {
        if (fmt !== 'yyyy-MM-dd') throw new Error('format tidak didukung mock: ' + fmt);
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return { content, setMimeType() { return this; }, getContent() { return this.content; } };
      },
    },
  };
  vm.createContext(ctx);

  const srcDir = path.join(__dirname, '..', 'src');
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    });
  })(srcDir);
  files.sort().forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));

  function call(action, payload, token = props.API_TOKEN) {
    const body = JSON.stringify({ action, token, payload });
    const out = ctx.doPost({ postData: { contents: body } });
    return JSON.parse(out.getContent());
  }

  function raw(contents) {
    return JSON.parse(ctx.doPost({ postData: { contents } }).getContent());
  }

  function spreadsheet() {
    return spreadsheets[props.SPREADSHEET_ID];
  }

  return { ctx, props, logs, call, raw, spreadsheet };
}

module.exports = { createGasContext };
