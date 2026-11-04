var SettingsService = {
  get: function () {
    return { version: APP_VERSION, categories: SettingsService.listCategories(), photoFolderUrl: DriveStore.folderUrl() };
  },

  listCategories: function () {
    return Db.all(SHEETS.CATEGORIES).sort(function (a, b) {
      return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
    });
  },

  /** Peta code → label, termasuk label untuk biaya jasa. */
  categoryLabels: function () {
    var map = {};
    Db.all(SHEETS.CATEGORIES).forEach(function (c) { map[c.code] = c.label; });
    Object.keys(SYSTEM_CATEGORY_LABELS).forEach(function (k) { map[k] = SYSTEM_CATEGORY_LABELS[k]; });
    return map;
  },

  activeCategoryCodes: function () {
    return Db.all(SHEETS.CATEGORIES)
      .filter(function (c) { return c.active; })
      .map(function (c) { return c.code; });
  },

  saveCategory: function (payload) {
    var v = new Validator_(payload);
    v.string('code', {
      required: true,
      max: 30,
      pattern: /^[A-Z][A-Z0-9_]{1,29}$/,
      patternMessage: 'Gunakan huruf besar, angka, dan garis bawah (contoh: SHOCK_DEPAN)',
    })
      .string('label', { required: true, max: 50 })
      .int('sortOrder', { min: 0, max: 100000, defaultValue: null })
      .bool('active', { defaultValue: true });
    if (payload && SYSTEM_CATEGORY_LABELS.hasOwnProperty(payload.code)) v.addError('code', 'Kode ' + payload.code + ' dipakai sistem');
    var data = v.done();

    var existing = Db.findById(SHEETS.CATEGORIES, data.code);
    if (existing) {
      return Db.update(SHEETS.CATEGORIES, data.code, {
        label: data.label,
        sortOrder: data.sortOrder === null ? existing.sortOrder : data.sortOrder,
        active: data.active,
      });
    }
    var maxOrder = Db.all(SHEETS.CATEGORIES).reduce(function (m, c) { return Math.max(m, c.sortOrder); }, 0);
    return Db.insert(SHEETS.CATEGORIES, {
      code: data.code,
      label: data.label,
      sortOrder: data.sortOrder === null ? maxOrder + 10 : data.sortOrder,
      active: data.active,
    });
  },
};
