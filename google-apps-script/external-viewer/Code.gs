/**
 * Wedding Chapter — External Viewer Phase 1
 *
 * Required Script Properties:
 *   EXTERNAL_VIEWER_SPREADSHEET_ID
 *   EXTERNAL_VIEWER_MAGIC_SECRET       (at least 32 characters)
 *   EXTERNAL_VIEWER_SESSION_SECRET     (at least 32 characters)
 *
 * This standalone Web App exposes no case-write API. The only spreadsheet
 * writes are setup of the dedicated allowlist sheet and its last-login field.
 */

const EXTERNAL_VIEWER_ACCESS_SHEET_ = '外部檢視權限';
const EXTERNAL_VIEWER_CASE_SHEET_ = '新人資料';
const EXTERNAL_VIEWER_MAGIC_TTL_SECONDS_ = 15 * 60;
const EXTERNAL_VIEWER_SESSION_TTL_SECONDS_ = 90 * 24 * 60 * 60;
const EXTERNAL_VIEWER_RATE_COOLDOWN_SECONDS_ = 60;
const EXTERNAL_VIEWER_RATE_HOURLY_LIMIT_ = 5;
const EXTERNAL_VIEWER_LOCK_TIMEOUT_MS_ = 30000;

const EXTERNAL_VIEWER_PROPERTY_KEYS_ = Object.freeze({
  spreadsheetId: 'EXTERNAL_VIEWER_SPREADSHEET_ID',
  magicSecret: 'EXTERNAL_VIEWER_MAGIC_SECRET',
  sessionSecret: 'EXTERNAL_VIEWER_SESSION_SECRET',
});

const EXTERNAL_VIEWER_ACCESS_HEADERS_ = Object.freeze([
  'Email', '姓名', '狀態', '建立時間', '最後登入時間', '備註',
]);

const EXTERNAL_VIEWER_ALLOWED_ACCESS_STATUSES_ = Object.freeze([
  'APPROVED', 'SUSPENDED',
]);

const EXTERNAL_VIEWER_CASE_HEADERS_ = Object.freeze([
  '正式流水號', '提交時間', '防重複識別碼', '新郎姓名', '新郎電話',
  '新娘姓名', '新娘電話', '主要聯絡人姓名', '主要聯絡人電話', '婚宴日期',
  '日期未定', '婚宴時段', '預計桌數', '業務代碼', '業務姓名',
  '第一次洽談', '第二次洽談', '第三次洽談', '狀態', '結案日期',
]);

const EXTERNAL_VIEWER_COLUMNS_ = Object.freeze({
  serialNumber: 0,
  submittedAt: 1,
  groomName: 3,
  brideName: 5,
  primaryContactName: 7,
  primaryContactPhone: 8,
  weddingDate: 9,
  dateUndecided: 10,
  banquetSession: 11,
  estimatedTables: 12,
  salesCode: 13,
  salesName: 14,
  firstConsultation: 15,
  secondConsultation: 16,
  thirdConsultation: 17,
});

/** Returns only the public login shell or a non-consuming magic-link confirmation. */
function doGet(event) {
  const template = HtmlService.createTemplateFromFile('Index');
  const token = cleanText_(((event || {}).parameter || {}).token);
  const action = cleanText_(((event || {}).parameter || {}).action);
  let mode = 'LOGIN';
  let viewerEmail = '';
  let magicToken = '';

  if (action === 'magic' && token) {
    try {
      const inspected = inspectMagicLink_(token);
      mode = 'MAGIC_CONFIRM';
      viewerEmail = inspected.email;
      magicToken = token;
    } catch (error) {
      mode = 'MAGIC_INVALID';
    }
  }

  template.bootMode = mode;
  template.viewerEmail = viewerEmail;
  template.magicToken = magicToken;
  return template.evaluate()
    .setTitle('Wedding Chapter｜案件檢視')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function externalViewerRequest_(operation) {
  try {
    return operation();
  } catch (error) {
    const code = error && error.message;
    const allowed = [
      'ACCESS_UNAVAILABLE', 'AUTH_CONFIGURATION_MISSING', 'DATA_CONFIGURATION_ERROR',
      'DATA_INTEGRITY_ERROR', 'DATA_SCHEMA_ERROR', 'FORBIDDEN', 'INTERNAL_ERROR',
      'INVALID_MAGIC_LINK', 'LOCK_TIMEOUT', 'MAIL_QUOTA_EXCEEDED', 'NOT_FOUND',
      'RATE_LIMITED', 'SESSION_EXPIRED', 'UNAUTHORIZED', 'VALIDATION_ERROR',
    ];
    throw new Error(allowed.indexOf(code) !== -1 ? code : 'INTERNAL_ERROR');
  }
}

/** Sends a magic link only to a unique APPROVED allowlist entry. */
function requestViewerMagicLink(email) {
  return externalViewerRequest_(function () {
    const normalizedEmail = normalizeEmail_(email);
    if (!isValidEmail_(normalizedEmail)) throw new Error('ACCESS_UNAVAILABLE');

    const access = findViewerAccess_(normalizedEmail);
    if (!access || access.status !== 'APPROVED') throw new Error('ACCESS_UNAVAILABLE');

    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('MAIL_QUOTA_EXCEEDED');
    reserveMagicLinkSend_(normalizedEmail);

    const token = createMagicToken_(normalizedEmail);
    const serviceUrl = cleanText_(ScriptApp.getService().getUrl());
    if (!/^https:\/\//.test(serviceUrl)) throw new Error('DATA_CONFIGURATION_ERROR');
    const loginUrl = serviceUrl + '?action=magic&token=' + encodeURIComponent(token);
    const subject = 'Wedding Chapter｜案件檢視登入';
    const body = [
      '您好，',
      '',
      '請使用以下連結登入 Wedding Chapter 案件檢視：',
      loginUrl,
      '',
      '此連結將於 15 分鐘後失效，且只能使用一次。',
      '如果不是您本人操作，請忽略這封信。',
    ].join('\n');
    const htmlBody = '<p>您好，</p>' +
      '<p>請點擊下方按鈕登入 Wedding Chapter 案件檢視。</p>' +
      '<p><a href="' + escapeHtml_(loginUrl) + '" style="display:inline-block;' +
      'padding:12px 22px;border-radius:999px;background:#82766b;color:#fff;' +
      'text-decoration:none">登入案件檢視</a></p>' +
      '<p>此連結將於 15 分鐘後失效，且只能使用一次。</p>' +
      '<p style="color:#746d67">如果不是您本人操作，請忽略這封信。</p>';

    MailApp.sendEmail({
      to: normalizedEmail,
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      name: 'Wedding Chapter',
    });
    return { sent: true };
  });
}

/** Redeems a magic link once and returns a long-lived signed viewer session. */
function redeemViewerMagicLink(magicToken) {
  return externalViewerRequest_(function () {
    const payload = verifyMagicToken_(magicToken);
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(EXTERNAL_VIEWER_LOCK_TIMEOUT_MS_);
    } catch (error) {
      throw new Error('LOCK_TIMEOUT');
    }

    try {
      cleanupConsumedMagicTokens_();
      if (isMagicTokenConsumed_(payload.jti)) throw new Error('INVALID_MAGIC_LINK');

      const access = findViewerAccess_(payload.email);
      if (!access || access.status !== 'APPROVED') throw new Error('FORBIDDEN');

      markMagicTokenConsumed_(payload.jti, payload.exp);
      updateViewerLastLogin_(access.rowNumber);
      return createViewerSessionResponse_(access);
    } finally {
      lock.releaseLock();
    }
  });
}

/** Restores a browser session without returning any case data. */
function resumeViewerSession(sessionToken) {
  return externalViewerRequest_(function () {
    const authorized = authorizeViewerSession_(sessionToken);
    return {
      email: authorized.email,
      name: authorized.access.name,
    };
  });
}

/** Returns only External Viewer summary fields after fresh allowlist authorization. */
function viewerListCases(sessionToken, query, salesCode) {
  return externalViewerRequest_(function () {
    authorizeViewerSession_(sessionToken);
    const normalizedQuery = normalizeSearchQuery_(query);
    const normalizedSalesCode = normalizeSalesCode_(salesCode);
    const rows = readCaseRows_(false);

    if (normalizedSalesCode) {
      const actualSalesCodes = rows.reduce(function (set, row) {
        const code = normalizeSalesCode_(row[EXTERNAL_VIEWER_COLUMNS_.salesCode]);
        if (code) set[code] = true;
        return set;
      }, {});
      if (!actualSalesCodes[normalizedSalesCode]) throw new Error('VALIDATION_ERROR');
    }

    const results = [];
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (!cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.serialNumber])) continue;
      if (normalizedQuery && !viewerRowMatchesQuery_(row, normalizedQuery)) continue;
      if (normalizedSalesCode &&
          normalizeSalesCode_(row[EXTERNAL_VIEWER_COLUMNS_.salesCode]) !== normalizedSalesCode) {
        continue;
      }
      results.push(mapViewerCaseSummary_(row));
    }
    return results;
  });
}

/** Returns only explicitly approved External Viewer detail fields. */
function viewerGetCase(sessionToken, serialNumber) {
  return externalViewerRequest_(function () {
    authorizeViewerSession_(sessionToken);
    const target = normalizeSerialNumber_(serialNumber);
    if (!target) throw new Error('NOT_FOUND');

    const matches = readCaseRows_(true).filter(function (row) {
      return normalizeSerialNumber_(row[EXTERNAL_VIEWER_COLUMNS_.serialNumber]) === target;
    });
    if (matches.length === 0) throw new Error('NOT_FOUND');
    if (matches.length !== 1) throw new Error('DATA_INTEGRITY_ERROR');
    return mapViewerCaseDetail_(matches[0]);
  });
}

/**
 * Manual editor-only setup. Anonymous Web App requests have no active-user
 * identity and are rejected before any spreadsheet call.
 */
function setupExternalViewer() {
  return externalViewerRequest_(function () {
    requireManualSetupAdministrator_();
    const spreadsheetId = requireSpreadsheetId_();
    const metadata = Sheets.Spreadsheets.get(spreadsheetId, {
      fields: 'sheets.properties(sheetId,title)',
    });
    const sheets = metadata.sheets || [];
    const existing = sheets.filter(function (sheet) {
      return sheet.properties && sheet.properties.title === EXTERNAL_VIEWER_ACCESS_SHEET_;
    });
    if (existing.length > 1) throw new Error('DATA_INTEGRITY_ERROR');
    if (existing.length === 1) {
      readViewerAccessRows_();
      return { created: false };
    }

    const addResult = Sheets.Spreadsheets.batchUpdate({
      requests: [{ addSheet: { properties: { title: EXTERNAL_VIEWER_ACCESS_SHEET_ } } }],
    }, spreadsheetId);
    const sheetId = (((addResult.replies || [])[0] || {}).addSheet || {}).properties;
    if (!sheetId || typeof sheetId.sheetId !== 'number') throw new Error('INTERNAL_ERROR');

    Sheets.Spreadsheets.Values.update({
      majorDimension: 'ROWS',
      values: [EXTERNAL_VIEWER_ACCESS_HEADERS_.slice()],
    }, spreadsheetId, quoteNamedSheetRange_(EXTERNAL_VIEWER_ACCESS_SHEET_, 'A1:F1'), {
      valueInputOption: 'RAW',
      includeValuesInResponse: false,
    });

    Sheets.Spreadsheets.batchUpdate({
      requests: [{
        setDataValidation: {
          range: {
            sheetId: sheetId.sheetId,
            startRowIndex: 1,
            startColumnIndex: 2,
            endColumnIndex: 3,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [{ userEnteredValue: 'APPROVED' }, { userEnteredValue: 'SUSPENDED' }],
            },
            strict: true,
            showCustomUi: true,
          },
        },
      }],
    }, spreadsheetId);
    return { created: true };
  });
}

function requireManualSetupAdministrator_() {
  const activeEmail = normalizeEmail_(Session.getActiveUser().getEmail());
  const effectiveEmail = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (!activeEmail || !effectiveEmail || activeEmail !== effectiveEmail) {
    throw new Error('FORBIDDEN');
  }
}

function inspectMagicLink_(token) {
  const payload = verifyMagicToken_(token);
  if (isMagicTokenConsumed_(payload.jti)) throw new Error('INVALID_MAGIC_LINK');
  const access = findViewerAccess_(payload.email);
  if (!access || access.status !== 'APPROVED') throw new Error('FORBIDDEN');
  return { email: payload.email };
}

function createMagicToken_(email) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return createSignedToken_({
    v: 1,
    purpose: 'external_viewer_magic_login',
    email: email,
    iat: issuedAt,
    exp: issuedAt + EXTERNAL_VIEWER_MAGIC_TTL_SECONDS_,
    jti: Utilities.getUuid(),
  }, requireSecret_(EXTERNAL_VIEWER_PROPERTY_KEYS_.magicSecret));
}

function verifyMagicToken_(token) {
  const payload = parseSignedToken_(
    token,
    requireSecret_(EXTERNAL_VIEWER_PROPERTY_KEYS_.magicSecret),
    'INVALID_MAGIC_LINK'
  );
  if (!hasExactKeys_(payload, ['email', 'exp', 'iat', 'jti', 'purpose', 'v']) ||
      payload.v !== 1 || payload.purpose !== 'external_viewer_magic_login' ||
      !isValidEmail_(normalizeEmail_(payload.email)) || payload.email !== normalizeEmail_(payload.email) ||
      typeof payload.jti !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(payload.jti)) {
    throw new Error('INVALID_MAGIC_LINK');
  }
  validateTokenTimes_(payload, EXTERNAL_VIEWER_MAGIC_TTL_SECONDS_, 'INVALID_MAGIC_LINK');
  return payload;
}

function createViewerSessionResponse_(access) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const sessionToken = createSignedToken_({
    v: 1,
    purpose: 'external_viewer_session',
    email: access.email,
    iat: issuedAt,
    exp: issuedAt + EXTERNAL_VIEWER_SESSION_TTL_SECONDS_,
    nonce: Utilities.getUuid(),
  }, requireSecret_(EXTERNAL_VIEWER_PROPERTY_KEYS_.sessionSecret));
  return {
    sessionToken: sessionToken,
    email: access.email,
    name: access.name,
  };
}

function verifyViewerSessionToken_(token) {
  const payload = parseSignedToken_(
    token,
    requireSecret_(EXTERNAL_VIEWER_PROPERTY_KEYS_.sessionSecret),
    'UNAUTHORIZED'
  );
  if (!hasExactKeys_(payload, ['email', 'exp', 'iat', 'nonce', 'purpose', 'v']) ||
      payload.v !== 1 || payload.purpose !== 'external_viewer_session' ||
      !isValidEmail_(normalizeEmail_(payload.email)) || payload.email !== normalizeEmail_(payload.email) ||
      typeof payload.nonce !== 'string' || !/^[0-9a-f-]{20,80}$/i.test(payload.nonce)) {
    throw new Error('UNAUTHORIZED');
  }
  validateTokenTimes_(payload, EXTERNAL_VIEWER_SESSION_TTL_SECONDS_, 'SESSION_EXPIRED');
  return payload;
}

function authorizeViewerSession_(sessionToken) {
  const payload = verifyViewerSessionToken_(sessionToken);
  const access = findViewerAccess_(payload.email);
  if (!access || access.status !== 'APPROVED') throw new Error('FORBIDDEN');
  return { email: payload.email, access: access };
}

function createSignedToken_(payload, secret) {
  const encodedPayload = stripBase64Padding_(
    Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8)
  );
  const signature = stripBase64Padding_(Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(encodedPayload, secret, Utilities.Charset.UTF_8)
  ));
  return encodedPayload + '.' + signature;
}

function parseSignedToken_(token, secret, errorCode) {
  const normalized = cleanText_(token);
  const parts = normalized.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1])) throw new Error(errorCode);

  const expected = stripBase64Padding_(Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(parts[0], secret, Utilities.Charset.UTF_8)
  ));
  if (!constantTimeEqual_(parts[1], expected)) throw new Error(errorCode);

  try {
    const bytes = Utilities.base64DecodeWebSafe(addBase64Padding_(parts[0]));
    const json = Utilities.newBlob(bytes).getDataAsString(Utilities.Charset.UTF_8);
    const payload = JSON.parse(json);
    if (!payload || Object.prototype.toString.call(payload) !== '[object Object]') {
      throw new Error(errorCode);
    }
    return payload;
  } catch (error) {
    throw new Error(errorCode);
  }
}

function validateTokenTimes_(payload, maximumLifetime, errorCode) {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      payload.iat > now + 60 || payload.exp <= payload.iat ||
      payload.exp - payload.iat > maximumLifetime || payload.exp <= now) {
    throw new Error(errorCode);
  }
}

function hasExactKeys_(object, expectedKeys) {
  const actual = Object.keys(object).sort();
  const expected = expectedKeys.slice().sort();
  return actual.length === expected.length && actual.every(function (key, index) {
    return key === expected[index];
  });
}

function constantTimeEqual_(left, right) {
  const a = String(left);
  const b = String(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index % Math.max(a.length, 1)) || 0) ^
      (b.charCodeAt(index % Math.max(b.length, 1)) || 0);
  }
  return difference === 0;
}

function stripBase64Padding_(value) {
  return String(value).replace(/=+$/g, '');
}

function addBase64Padding_(value) {
  const remainder = value.length % 4;
  return remainder ? value + '='.repeat(4 - remainder) : value;
}

function consumedMagicPropertyKey_(jti) {
  return 'EXTERNAL_VIEWER_MAGIC_USED_' + secureKeyHash_(jti);
}

function isMagicTokenConsumed_(jti) {
  const properties = PropertiesService.getScriptProperties();
  const key = consumedMagicPropertyKey_(jti);
  const stored = properties.getProperty(key);
  if (stored === null) return false;
  const expiresAt = Number(stored);
  if (!Number.isFinite(expiresAt)) throw new Error('DATA_INTEGRITY_ERROR');
  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    properties.deleteProperty(key);
    return false;
  }
  return true;
}

function markMagicTokenConsumed_(jti, expiresAt) {
  PropertiesService.getScriptProperties().setProperty(
    consumedMagicPropertyKey_(jti), String(expiresAt)
  );
}

function cleanupConsumedMagicTokens_() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  const now = Math.floor(Date.now() / 1000);
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('EXTERNAL_VIEWER_MAGIC_USED_') === 0 && Number(all[key]) <= now) {
      properties.deleteProperty(key);
    }
  });
}

function reserveMagicLinkSend_(email) {
  const hash = secureKeyHash_(email);
  const cacheKey = 'external-viewer:mail-cooldown:' + hash;
  const ratePropertyKey = 'EXTERNAL_VIEWER_RATE_' + hash;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(EXTERNAL_VIEWER_LOCK_TIMEOUT_MS_);
  } catch (error) {
    throw new Error('LOCK_TIMEOUT');
  }

  try {
    const cache = CacheService.getScriptCache();
    if (cache.get(cacheKey)) throw new Error('RATE_LIMITED');

    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    let state = {};
    try { state = JSON.parse(properties.getProperty(ratePropertyKey) || '{}'); }
    catch (error) { state = {}; }
    let windowStartedAt = Number(state.windowStartedAt);
    let count = Number(state.count);
    const lastSentAt = Number(state.lastSentAt);
    if (!Number.isFinite(windowStartedAt) || now - windowStartedAt >= 60 * 60 * 1000) {
      windowStartedAt = now;
      count = 0;
    }
    if (Number.isFinite(lastSentAt) && now - lastSentAt < 60 * 1000) {
      throw new Error('RATE_LIMITED');
    }
    if (!Number.isFinite(count)) count = 0;
    if (count >= EXTERNAL_VIEWER_RATE_HOURLY_LIMIT_) throw new Error('RATE_LIMITED');

    properties.setProperty(ratePropertyKey, JSON.stringify({
      windowStartedAt: windowStartedAt,
      count: count + 1,
      lastSentAt: now,
    }));
    cache.put(cacheKey, '1', EXTERNAL_VIEWER_RATE_COOLDOWN_SECONDS_);
  } finally {
    lock.releaseLock();
  }
}

function secureKeyHash_(value) {
  return stripBase64Padding_(Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(
      String(value),
      requireSecret_(EXTERNAL_VIEWER_PROPERTY_KEYS_.magicSecret),
      Utilities.Charset.UTF_8
    )
  )).slice(0, 32);
}

function readViewerAccessRows_() {
  const response = Sheets.Spreadsheets.Values.batchGet(requireSpreadsheetId_(), {
    ranges: [quoteNamedSheetRange_(EXTERNAL_VIEWER_ACCESS_SHEET_, 'A1:F')],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const rows = valuesFrom_((response.valueRanges || [])[0]);
  const header = rows[0] || [];
  const actualHeader = padRow_(header, EXTERNAL_VIEWER_ACCESS_HEADERS_.length).map(cleanText_);
  if (header.length !== EXTERNAL_VIEWER_ACCESS_HEADERS_.length ||
      !EXTERNAL_VIEWER_ACCESS_HEADERS_.every(function (expected, index) {
        return actualHeader[index] === expected;
      })) throw new Error('DATA_SCHEMA_ERROR');

  const seen = {};
  const result = [];
  rows.slice(1).forEach(function (sourceRow, index) {
    const row = padRow_(sourceRow, EXTERNAL_VIEWER_ACCESS_HEADERS_.length);
    if (!row.some(function (value) { return cleanText_(value); })) return;
    const email = normalizeEmail_(row[0]);
    const status = cleanText_(row[2]);
    if (!isValidEmail_(email) || EXTERNAL_VIEWER_ALLOWED_ACCESS_STATUSES_.indexOf(status) === -1) {
      throw new Error('DATA_INTEGRITY_ERROR');
    }
    if (seen[email]) throw new Error('DATA_INTEGRITY_ERROR');
    seen[email] = true;
    result.push({
      email: email,
      name: cleanText_(row[1]),
      status: status,
      createdAt: cleanText_(row[3]),
      lastLoginAt: cleanText_(row[4]),
      note: cleanText_(row[5]),
      rowNumber: index + 2,
    });
  });
  return result;
}

function findViewerAccess_(email) {
  const normalizedEmail = normalizeEmail_(email);
  const matches = readViewerAccessRows_().filter(function (entry) {
    return entry.email === normalizedEmail;
  });
  if (matches.length > 1) throw new Error('DATA_INTEGRITY_ERROR');
  return matches[0] || null;
}

function updateViewerLastLogin_(rowNumber) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('DATA_INTEGRITY_ERROR');
  Sheets.Spreadsheets.Values.update({
    majorDimension: 'ROWS',
    values: [[new Date().toISOString()]],
  }, requireSpreadsheetId_(), quoteNamedSheetRange_(
    EXTERNAL_VIEWER_ACCESS_SHEET_, 'E' + rowNumber
  ), {
    valueInputOption: 'RAW',
    includeValuesInResponse: false,
  });
}

function readCaseRows_(includeDetail) {
  const range = includeDetail ? 'A2:T' : 'A2:O';
  const response = Sheets.Spreadsheets.Values.batchGet(requireSpreadsheetId_(), {
    ranges: [
      quoteNamedSheetRange_(EXTERNAL_VIEWER_CASE_SHEET_, 'A1:T1'),
      quoteNamedSheetRange_(EXTERNAL_VIEWER_CASE_SHEET_, range),
    ],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const valueRanges = response.valueRanges || [];
  validateCaseHeaders_(firstRow_(valueRanges[0]));
  return valuesFrom_(valueRanges[1]).map(function (row) {
    return padRow_(row, EXTERNAL_VIEWER_CASE_HEADERS_.length);
  });
}

function validateCaseHeaders_(header) {
  const actual = padRow_(header, EXTERNAL_VIEWER_CASE_HEADERS_.length).map(cleanText_);
  if (header.length !== EXTERNAL_VIEWER_CASE_HEADERS_.length ||
      !EXTERNAL_VIEWER_CASE_HEADERS_.every(function (expected, index) {
        return actual[index] === expected;
      })) throw new Error('DATA_SCHEMA_ERROR');
}

function mapViewerCaseSummary_(row) {
  return {
    serialNumber: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.serialNumber]),
    groomName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.groomName]),
    brideName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.brideName]),
    weddingDate: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.weddingDate]),
    dateUndecided: parseBoolean_(row[EXTERNAL_VIEWER_COLUMNS_.dateUndecided]),
    banquetSession: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.banquetSession]),
    estimatedTables: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.estimatedTables]),
    salesCode: normalizeSalesCode_(row[EXTERNAL_VIEWER_COLUMNS_.salesCode]),
    salesName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.salesName]),
  };
}

function mapViewerCaseDetail_(row) {
  return {
    serialNumber: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.serialNumber]),
    submittedAt: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.submittedAt]),
    groomName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.groomName]),
    brideName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.brideName]),
    weddingDate: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.weddingDate]),
    dateUndecided: parseBoolean_(row[EXTERNAL_VIEWER_COLUMNS_.dateUndecided]),
    banquetSession: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.banquetSession]),
    estimatedTables: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.estimatedTables]),
    salesCode: normalizeSalesCode_(row[EXTERNAL_VIEWER_COLUMNS_.salesCode]),
    salesName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.salesName]),
    primaryContactName: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.primaryContactName]),
    primaryContactPhone: formatTaiwanMobileForDisplay_(
      row[EXTERNAL_VIEWER_COLUMNS_.primaryContactPhone]
    ),
    firstConsultation: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.firstConsultation]),
    secondConsultation: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.secondConsultation]),
    thirdConsultation: cleanText_(row[EXTERNAL_VIEWER_COLUMNS_.thirdConsultation]),
  };
}

function viewerRowMatchesQuery_(row, query) {
  return [
    row[EXTERNAL_VIEWER_COLUMNS_.serialNumber],
    row[EXTERNAL_VIEWER_COLUMNS_.groomName],
    row[EXTERNAL_VIEWER_COLUMNS_.brideName],
  ].some(function (value) {
    return cleanText_(value).toLowerCase().indexOf(query) !== -1;
  });
}

function requireSpreadsheetId_() {
  const value = cleanText_(PropertiesService.getScriptProperties().getProperty(
    EXTERNAL_VIEWER_PROPERTY_KEYS_.spreadsheetId
  ));
  if (!value) throw new Error('AUTH_CONFIGURATION_MISSING');
  return value;
}

function requireSecret_(key) {
  const value = cleanText_(PropertiesService.getScriptProperties().getProperty(key));
  if (!value || value.length < 32) throw new Error('AUTH_CONFIGURATION_MISSING');
  return value;
}

function valuesFrom_(valueRange) {
  return valueRange && Array.isArray(valueRange.values) ? valueRange.values : [];
}

function firstRow_(valueRange) {
  return valuesFrom_(valueRange)[0] || [];
}

function padRow_(row, length) {
  const result = Array.isArray(row) ? row.slice(0, length) : [];
  while (result.length < length) result.push('');
  return result;
}

function quoteNamedSheetRange_(sheetName, range) {
  return "'" + String(sheetName).replace(/'/g, "''") + "'!" + range;
}

function normalizeEmail_(value) {
  return cleanText_(value).toLowerCase();
}

function isValidEmail_(value) {
  return typeof value === 'string' && value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeSearchQuery_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 100) throw new Error('VALIDATION_ERROR');
  return value.trim().toLowerCase();
}

function normalizeSerialNumber_(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9-]{1,50}$/.test(normalized) ? normalized : '';
}

function normalizeSalesCode_(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error('VALIDATION_ERROR');
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,50}$/.test(normalized)) throw new Error('VALIDATION_ERROR');
  return normalized;
}

function parseBoolean_(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function digitsOnly_(value) {
  return cleanText_(value).replace(/\D/g, '');
}

function formatTaiwanMobileForDisplay_(value) {
  const digits = digitsOnly_(value);
  if (/^09\d{8}$/.test(digits)) {
    return digits.slice(0, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
  }
  return cleanText_(value);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
  });
}

function cleanText_(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}
