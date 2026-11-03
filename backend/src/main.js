/** Health check. Tidak mengembalikan data pengguna. */
function doGet() {
  return ok_({ app: 'motocare', version: APP_VERSION });
}

/**
 * Semua operasi data lewat POST.
 * Body (text/plain): {"action":"...","token":"...","payload":{...}}
 */
function doPost(e) {
  try {
    Db.reset();
    var req = parseRequest_(e);
    Auth.verify(req.token);

    var routes = getRoutes_();
    if (!routes.hasOwnProperty(req.action)) {
      throw new AppError('UNKNOWN_ACTION', 'Action tidak dikenal: ' + req.action);
    }
    var route = routes[req.action];
    var payload = req.payload || {};
    var data = route.write
      ? withLock_(function () { return route.handler(payload); })
      : route.handler(payload);
    return ok_(data);
  } catch (err) {
    return fail_(err);
  }
}

function parseRequest_(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '');
  } catch (err) {
    throw new AppError('BAD_REQUEST', 'Body request harus JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('BAD_REQUEST', 'Body request harus objek JSON.');
  }
  if (typeof body.action !== 'string' || !body.action) {
    throw new AppError('BAD_REQUEST', 'Field "action" wajib diisi.');
  }
  if (body.payload !== undefined && (typeof body.payload !== 'object' || body.payload === null || Array.isArray(body.payload))) {
    throw new AppError('BAD_REQUEST', 'Field "payload" harus objek.');
  }
  return body;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new AppError('LOCK_TIMEOUT', 'Server sedang sibuk. Coba lagi sebentar.');
  }
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}
