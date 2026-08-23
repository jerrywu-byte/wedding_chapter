/**
 * Wedding Chapter — Follow-up authenticated case editor (Phase 1C)
 *
 * Required Script Properties:
 *   FOLLOWUP_ALLOWED_DOMAIN
 *   FOLLOWUP_SPREADSHEET_ID
 *   FOLLOWUP_IDENTITY_SECRET
 *
 * Columns A:L and N:O remain read-only. The only write operation replaces M
 * and P:T in one batch request after authorization, identity, revision, and
 * validation checks.
 */

const FOLLOWUP_SHEET_NAME_ = '新人資料';
const FOLLOWUP_SALES_SHEET_NAME_ = '業務資料';
const FOLLOWUP_MAX_LIST_RESULTS_ = 100;
const FOLLOWUP_MAX_CONSULTATION_LENGTH_ = 5000;
const FOLLOWUP_LOCK_TIMEOUT_MS_ = 30000;
const FOLLOWUP_ALLOWED_STATUSES_ = Object.freeze(['洽談中', '已訂', '退訂', '流失']);
const FOLLOWUP_ALLOWED_ROLES_ = Object.freeze(['MANAGER', 'SALES']);
const FOLLOWUP_UPDATE_FIELDS_ = Object.freeze([
  'serialNumber',
  'identityToken',
  'revisionToken',
  'estimatedTables',
  'firstConsultation',
  'secondConsultation',
  'thirdConsultation',
  'status',
  'closedDate',
]);

const AUTH_PROPERTY_KEYS_ = Object.freeze({
  allowedDomain: 'FOLLOWUP_ALLOWED_DOMAIN',
  spreadsheetId: 'FOLLOWUP_SPREADSHEET_ID',
  identitySecret: 'FOLLOWUP_IDENTITY_SECRET',
});

const FOLLOWUP_SALES_EXPECTED_HEADERS_ = Object.freeze([
  '業務代碼',
  '業務姓名',
  '業務Email',
  'LINE連結',
  '啟用',
  'Follow-up角色',
]);

const FOLLOWUP_SALES_COLUMNS_ = Object.freeze({
  salesCode: 0,
  salesName: 1,
  email: 2,
  enabled: 4,
  role: 5,
});

const FOLLOWUP_EXPECTED_HEADERS_ = Object.freeze([
  '正式流水號',
  '提交時間',
  '防重複識別碼',
  '新郎姓名',
  '新郎電話',
  '新娘姓名',
  '新娘電話',
  '主要聯絡人姓名',
  '主要聯絡人電話',
  '婚宴日期',
  '日期未定',
  '婚宴時段',
  '預計桌數',
  '業務代碼',
  '業務姓名',
  '第一次洽談',
  '第二次洽談',
  '第三次洽談',
  '狀態',
  '結案日期',
]);

const FOLLOWUP_COLUMNS_ = Object.freeze({
  serialNumber: 0,
  submittedAt: 1,
  duplicateKey: 2,
  groomName: 3,
  groomPhone: 4,
  brideName: 5,
  bridePhone: 6,
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
  status: 18,
  closedDate: 19,
});

function doGet() {
  try {
    getCurrentFollowupUser_();
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Wedding Chapter｜新人案件');
  } catch (error) {
    console.warn(
      'Follow-up authentication denied: ' +
        (error && error.message ? error.message : 'UNKNOWN_AUTH_ERROR')
    );
    return HtmlService.createHtmlOutputFromFile('Unauthorized')
      .setTitle('Wedding Chapter｜無法存取');
  }
}

/**
 * Returns at most 100 case summaries. Phone numbers are used only for
 * server-side matching and are never included in the response.
 *
 * @param {string} query
 * @return {Array<Object>}
 */
function listCases(query) {
  const currentUser = getCurrentFollowupUser_();

  const normalizedQuery = normalizeSearchQuery_(query);
  const rows = readListRows_();
  const results = [];

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!cleanText_(row[FOLLOWUP_COLUMNS_.serialNumber])) continue;
    if (!canAccessCase_(currentUser, row)) continue;
    if (normalizedQuery && !rowMatchesQuery_(row, normalizedQuery)) continue;

    results.push(mapCaseSummary_(row));
    if (results.length >= FOLLOWUP_MAX_LIST_RESULTS_) break;
  }

  return results;
}

/**
 * Looks up a case by its stable visitor number. Row numbers are never
 * accepted or returned.
 *
 * @param {string} serialNumber
 * @return {Object}
 */
function getCase(serialNumber) {
  const currentUser = getCurrentFollowupUser_();

  const target = normalizeSerialNumber_(serialNumber);
  if (!target) throw new Error('NOT_FOUND');

  const rows = readDetailRows_();
  const located = locateCaseBySerial_(rows, target);
  assertCaseAccess_(currentUser, located.row);

  const secret = requireIdentitySecret_();
  validateDuplicateKeyUniqueness_(rows, located.row);
  return mapCaseDetail_(located.row, secret);
}

/**
 * Safely replaces only M and P:T for one case.
 *
 * @param {Object} payload
 * @return {Object}
 */
function updateCase(payload) {
  const currentUser = getCurrentFollowupUser_();
  validateUpdatePayloadShape_(payload);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(FOLLOWUP_LOCK_TIMEOUT_MS_);
  } catch (error) {
    throw new Error('LOCK_TIMEOUT');
  }

  try {
    const identity = normalizeUpdateIdentity_(payload);
    const rows = readDetailRows_();
    const secret = requireIdentitySecret_();
    const serialMatch = locateCaseBySerial_(rows, identity.serialNumber);
    const identityMatch = locateCaseByIdentityToken_(rows, identity.identityToken, secret);

    if (serialMatch.index !== identityMatch.index) {
      throw new Error('DATA_INTEGRITY_ERROR');
    }

    validateDuplicateKeyUniqueness_(rows, serialMatch.row);
    assertCaseAccess_(currentUser, serialMatch.row);

    const input = normalizeUpdatePayload_(payload);

    const currentRevisionToken = createRevisionToken_(serialMatch.row, secret);
    if (currentRevisionToken !== input.revisionToken) {
      throw new Error('CONFLICT');
    }

    const updatedRow = serialMatch.row.slice();
    updatedRow[FOLLOWUP_COLUMNS_.estimatedTables] = input.estimatedTables;
    updatedRow[FOLLOWUP_COLUMNS_.firstConsultation] = input.firstConsultation;
    updatedRow[FOLLOWUP_COLUMNS_.secondConsultation] = input.secondConsultation;
    updatedRow[FOLLOWUP_COLUMNS_.thirdConsultation] = input.thirdConsultation;
    updatedRow[FOLLOWUP_COLUMNS_.status] = input.status;
    updatedRow[FOLLOWUP_COLUMNS_.closedDate] = input.closedDate;

    writeCaseFields_(serialMatch.rowNumber, input);

    return {
      serialNumber: input.serialNumber,
      identityToken: input.identityToken,
      revisionToken: createRevisionToken_(updatedRow, secret),
      estimatedTables: input.estimatedTables,
      firstConsultation: input.firstConsultation,
      secondConsultation: input.secondConsultation,
      thirdConsultation: input.thirdConsultation,
      status: input.status,
      closedDate: input.closedDate,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Resolves the active Workspace account against the formal sales sheet.
 *
 * @return {{salesCode: string, salesName: string, email: string, role: string}}
 */
function getCurrentFollowupUser_() {
  const properties = PropertiesService.getScriptProperties();
  const allowedDomain = normalizeDomain_(
    properties.getProperty(AUTH_PROPERTY_KEYS_.allowedDomain)
  );

  if (!allowedDomain) throw new Error('AUTH_CONFIGURATION_MISSING');

  const email = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!email) throw new Error('UNAUTHORIZED');

  const emailDomain = email.split('@')[1] || '';
  if (emailDomain !== allowedDomain) throw new Error('UNAUTHORIZED');

  const rows = readFollowupUsers_();
  const matches = rows.filter(function (row) {
    return normalizeEmail_(row[FOLLOWUP_SALES_COLUMNS_.email]) === email;
  });

  if (matches.length === 0) throw new Error('UNAUTHORIZED');
  if (matches.length > 1) throw new Error('DATA_INTEGRITY_ERROR');

  const userRow = matches[0];
  const salesCode = normalizeSalesCode_(userRow[FOLLOWUP_SALES_COLUMNS_.salesCode]);
  const salesName = cleanText_(userRow[FOLLOWUP_SALES_COLUMNS_.salesName]);
  const role = cleanText_(userRow[FOLLOWUP_SALES_COLUMNS_.role]).toUpperCase();

  if (!salesCode || !isFollowupUserEnabled_(userRow[FOLLOWUP_SALES_COLUMNS_.enabled])) {
    throw new Error('UNAUTHORIZED');
  }
  if (FOLLOWUP_ALLOWED_ROLES_.indexOf(role) === -1) throw new Error('UNAUTHORIZED');

  const duplicateSalesCodes = rows.filter(function (row) {
    return normalizeSalesCode_(row[FOLLOWUP_SALES_COLUMNS_.salesCode]) === salesCode;
  });
  if (duplicateSalesCodes.length > 1) throw new Error('DATA_INTEGRITY_ERROR');

  return {
    salesCode: salesCode,
    salesName: salesName,
    email: email,
    role: role,
  };
}

function requireAuthorizedUser_() {
  return getCurrentFollowupUser_();
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function readFollowupUsers_() {
  const spreadsheetId = requireSpreadsheetId_();
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: [quoteNamedSheetRange_(FOLLOWUP_SALES_SHEET_NAME_, 'A1:F')],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const rows = valuesFrom_((response.valueRanges || [])[0]);
  const header = rows[0] || [];
  const actual = padRow_(header, FOLLOWUP_SALES_EXPECTED_HEADERS_.length).map(cleanText_);
  const valid = FOLLOWUP_SALES_EXPECTED_HEADERS_.every(function (expected, index) {
    return actual[index] === expected;
  });

  if (!valid || header.length !== FOLLOWUP_SALES_EXPECTED_HEADERS_.length) {
    throw new Error('DATA_INTEGRITY_ERROR');
  }

  return rows.slice(1).map(function (row) {
    return padRow_(row, FOLLOWUP_SALES_EXPECTED_HEADERS_.length);
  });
}

function readListRows_() {
  const spreadsheetId = requireSpreadsheetId_();
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: [
      quoteSheetRange_('A1:T1'),
      quoteSheetRange_('A2:O'),
      quoteSheetRange_('S2:S'),
    ],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const valueRanges = response.valueRanges || [];

  validateHeaders_(firstRow_(valueRanges[0]));

  const baseRows = valuesFrom_(valueRanges[1]);
  const statusRows = valuesFrom_(valueRanges[2]);

  return baseRows.map(function (baseRow, index) {
    const row = padRow_(baseRow, FOLLOWUP_EXPECTED_HEADERS_.length);
    row[FOLLOWUP_COLUMNS_.status] = cleanText_((statusRows[index] || [])[0]);
    return row;
  });
}

function readDetailRows_() {
  const spreadsheetId = requireSpreadsheetId_();
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: [quoteSheetRange_('A1:T1'), quoteSheetRange_('A2:T')],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const valueRanges = response.valueRanges || [];

  validateHeaders_(firstRow_(valueRanges[0]));

  return valuesFrom_(valueRanges[1]).map(function (row) {
    return padRow_(row, FOLLOWUP_EXPECTED_HEADERS_.length);
  });
}

function validateHeaders_(headerRow) {
  const actual = padRow_(headerRow, FOLLOWUP_EXPECTED_HEADERS_.length).map(cleanText_);
  const valid = FOLLOWUP_EXPECTED_HEADERS_.every(function (expected, index) {
    return actual[index] === expected;
  });

  if (!valid || headerRow.length !== FOLLOWUP_EXPECTED_HEADERS_.length) {
    throw new Error('DATA_SCHEMA_ERROR');
  }
}

function mapCaseSummary_(row) {
  return {
    serialNumber: cleanText_(row[FOLLOWUP_COLUMNS_.serialNumber]),
    groomName: cleanText_(row[FOLLOWUP_COLUMNS_.groomName]),
    brideName: cleanText_(row[FOLLOWUP_COLUMNS_.brideName]),
    weddingDate: cleanText_(row[FOLLOWUP_COLUMNS_.weddingDate]),
    dateUndecided: parseBoolean_(row[FOLLOWUP_COLUMNS_.dateUndecided]),
    banquetSession: cleanText_(row[FOLLOWUP_COLUMNS_.banquetSession]),
    estimatedTables: cleanText_(row[FOLLOWUP_COLUMNS_.estimatedTables]),
    salesCode: cleanText_(row[FOLLOWUP_COLUMNS_.salesCode]),
    salesName: cleanText_(row[FOLLOWUP_COLUMNS_.salesName]),
    status: normalizeStatus_(row[FOLLOWUP_COLUMNS_.status]),
  };
}

function mapCaseDetail_(row, secret) {
  return {
    serialNumber: cleanText_(row[FOLLOWUP_COLUMNS_.serialNumber]),
    submittedAt: cleanText_(row[FOLLOWUP_COLUMNS_.submittedAt]),
    groomName: cleanText_(row[FOLLOWUP_COLUMNS_.groomName]),
    groomPhone: cleanText_(row[FOLLOWUP_COLUMNS_.groomPhone]),
    brideName: cleanText_(row[FOLLOWUP_COLUMNS_.brideName]),
    bridePhone: cleanText_(row[FOLLOWUP_COLUMNS_.bridePhone]),
    primaryContactName: cleanText_(row[FOLLOWUP_COLUMNS_.primaryContactName]),
    primaryContactPhone: cleanText_(row[FOLLOWUP_COLUMNS_.primaryContactPhone]),
    weddingDate: cleanText_(row[FOLLOWUP_COLUMNS_.weddingDate]),
    dateUndecided: parseBoolean_(row[FOLLOWUP_COLUMNS_.dateUndecided]),
    banquetSession: cleanText_(row[FOLLOWUP_COLUMNS_.banquetSession]),
    estimatedTables: cleanText_(row[FOLLOWUP_COLUMNS_.estimatedTables]),
    salesCode: cleanText_(row[FOLLOWUP_COLUMNS_.salesCode]),
    salesName: cleanText_(row[FOLLOWUP_COLUMNS_.salesName]),
    firstConsultation: cleanText_(row[FOLLOWUP_COLUMNS_.firstConsultation]),
    secondConsultation: cleanText_(row[FOLLOWUP_COLUMNS_.secondConsultation]),
    thirdConsultation: cleanText_(row[FOLLOWUP_COLUMNS_.thirdConsultation]),
    status: normalizeStatus_(row[FOLLOWUP_COLUMNS_.status]),
    closedDate: normalizeStoredDate_(row[FOLLOWUP_COLUMNS_.closedDate]),
    identityToken: createIdentityToken_(row[FOLLOWUP_COLUMNS_.duplicateKey], secret),
    revisionToken: createRevisionToken_(row, secret),
  };
}

function locateCaseBySerial_(rows, serialNumber) {
  const target = normalizeSerialNumber_(serialNumber);
  const matches = [];

  rows.forEach(function (row, index) {
    if (normalizeSerialNumber_(row[FOLLOWUP_COLUMNS_.serialNumber]) === target) {
      matches.push({ row: row, index: index, rowNumber: index + 2 });
    }
  });

  if (matches.length === 0) throw new Error('NOT_FOUND');
  if (matches.length > 1) throw new Error('DATA_INTEGRITY_ERROR');
  return matches[0];
}

function locateCaseByIdentityToken_(rows, identityToken, secret) {
  const matches = [];

  rows.forEach(function (row, index) {
    const duplicateKey = cleanText_(row[FOLLOWUP_COLUMNS_.duplicateKey]);
    if (!duplicateKey) return;
    if (createIdentityToken_(duplicateKey, secret) === identityToken) {
      matches.push({ row: row, index: index, rowNumber: index + 2 });
    }
  });

  if (matches.length === 0) throw new Error('NOT_FOUND');
  if (matches.length > 1) throw new Error('DATA_INTEGRITY_ERROR');
  return matches[0];
}

function validateDuplicateKeyUniqueness_(rows, targetRow) {
  const duplicateKey = cleanText_(targetRow[FOLLOWUP_COLUMNS_.duplicateKey]);
  if (!duplicateKey) throw new Error('NOT_FOUND');

  const matches = rows.filter(function (row) {
    return cleanText_(row[FOLLOWUP_COLUMNS_.duplicateKey]) === duplicateKey;
  });

  if (matches.length > 1) throw new Error('DATA_INTEGRITY_ERROR');
}

function canAccessCase_(currentUser, row) {
  if (currentUser.role === 'MANAGER') return true;
  const caseSalesCode = normalizeSalesCode_(row[FOLLOWUP_COLUMNS_.salesCode]);
  return Boolean(caseSalesCode) && caseSalesCode === currentUser.salesCode;
}

function assertCaseAccess_(currentUser, row) {
  if (!canAccessCase_(currentUser, row)) throw new Error('FORBIDDEN');
}

function validateUpdatePayloadShape_(payload) {
  if (!payload || Object.prototype.toString.call(payload) !== '[object Object]') {
    throw new Error('VALIDATION_ERROR');
  }

  const keys = Object.keys(payload);
  const hasUnknownField = keys.some(function (key) {
    return FOLLOWUP_UPDATE_FIELDS_.indexOf(key) === -1;
  });
  const hasMissingField = FOLLOWUP_UPDATE_FIELDS_.some(function (key) {
    return !Object.prototype.hasOwnProperty.call(payload, key);
  });

  if (hasUnknownField || hasMissingField || keys.length !== FOLLOWUP_UPDATE_FIELDS_.length) {
    throw new Error('VALIDATION_ERROR');
  }
}

function normalizeUpdateIdentity_(payload) {
  const serialNumber = normalizeSerialNumber_(payload.serialNumber);
  const identityToken = cleanText_(payload.identityToken);
  const revisionToken = cleanText_(payload.revisionToken);

  if (!serialNumber || !isSecureToken_(identityToken) || !isSecureToken_(revisionToken)) {
    throw new Error('VALIDATION_ERROR');
  }

  return {
    serialNumber: serialNumber,
    identityToken: identityToken,
    revisionToken: revisionToken,
  };
}

function normalizeUpdatePayload_(payload) {
  FOLLOWUP_UPDATE_FIELDS_.forEach(function (key) {
    if (typeof payload[key] !== 'string') throw new Error('VALIDATION_ERROR');
  });

  const input = {
    serialNumber: normalizeSerialNumber_(payload.serialNumber),
    identityToken: cleanText_(payload.identityToken),
    revisionToken: cleanText_(payload.revisionToken),
    estimatedTables: normalizeEstimatedTables_(payload.estimatedTables),
    firstConsultation: normalizeConsultationText_(payload.firstConsultation),
    secondConsultation: normalizeConsultationText_(payload.secondConsultation),
    thirdConsultation: normalizeConsultationText_(payload.thirdConsultation),
    status: cleanText_(payload.status),
    closedDate: cleanText_(payload.closedDate),
  };

  if (!input.serialNumber || !isSecureToken_(input.identityToken) || !isSecureToken_(input.revisionToken)) {
    throw new Error('VALIDATION_ERROR');
  }

  [input.firstConsultation, input.secondConsultation, input.thirdConsultation]
    .forEach(function (value) {
      if (value.length > FOLLOWUP_MAX_CONSULTATION_LENGTH_) {
        throw new Error('VALIDATION_ERROR');
      }
    });

  if (FOLLOWUP_ALLOWED_STATUSES_.indexOf(input.status) === -1) {
    throw new Error('VALIDATION_ERROR');
  }

  if (input.status === '洽談中') {
    if (input.closedDate) throw new Error('VALIDATION_ERROR');
  } else {
    if (!isValidIsoDate_(input.closedDate)) throw new Error('VALIDATION_ERROR');
  }

  return input;
}

function writeCaseFields_(rowNumber, input) {
  const spreadsheetId = requireSpreadsheetId_();
  Sheets.Spreadsheets.Values.batchUpdate(
    {
      valueInputOption: 'USER_ENTERED',
      includeValuesInResponse: false,
      data: [
        {
          range: quoteSheetRange_('M' + rowNumber),
          majorDimension: 'ROWS',
          values: [[input.estimatedTables]],
        },
        {
          range: quoteSheetRange_('P' + rowNumber),
          majorDimension: 'ROWS',
          values: [[
            input.firstConsultation,
            input.secondConsultation,
            input.thirdConsultation,
            input.status,
            input.closedDate,
          ]],
        },
      ],
    },
    spreadsheetId
  );
}

function createIdentityToken_(duplicateKey, secret) {
  const value = cleanText_(duplicateKey);
  if (!value) throw new Error('NOT_FOUND');
  return createHmacToken_('identity\n' + value, secret);
}

function createRevisionToken_(row, secret) {
  const revisionValues = [
    normalizeSerialNumber_(row[FOLLOWUP_COLUMNS_.serialNumber]),
    cleanText_(row[FOLLOWUP_COLUMNS_.duplicateKey]),
    cleanText_(row[FOLLOWUP_COLUMNS_.estimatedTables]),
    normalizeConsultationText_(row[FOLLOWUP_COLUMNS_.firstConsultation]),
    normalizeConsultationText_(row[FOLLOWUP_COLUMNS_.secondConsultation]),
    normalizeConsultationText_(row[FOLLOWUP_COLUMNS_.thirdConsultation]),
    normalizeStatus_(row[FOLLOWUP_COLUMNS_.status]),
    normalizeStoredDate_(row[FOLLOWUP_COLUMNS_.closedDate]),
  ];
  return createHmacToken_('revision\n' + JSON.stringify(revisionValues), secret);
}

function normalizeEstimatedTables_(value) {
  const text = cleanText_(value);
  if (!/^[1-9]\d{0,2}$/.test(text)) {
    throw new Error('VALIDATION_ERROR');
  }

  const number = Number(text);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 1 || number > 200) {
    throw new Error('VALIDATION_ERROR');
  }

  return String(number);
}

function createHmacToken_(value, secret) {
  const signature = Utilities.computeHmacSha256Signature(
    value,
    secret,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');
}

function rowMatchesQuery_(row, query) {
  const searchableColumns = [
    FOLLOWUP_COLUMNS_.serialNumber,
    FOLLOWUP_COLUMNS_.groomName,
    FOLLOWUP_COLUMNS_.groomPhone,
    FOLLOWUP_COLUMNS_.brideName,
    FOLLOWUP_COLUMNS_.bridePhone,
    FOLLOWUP_COLUMNS_.primaryContactName,
    FOLLOWUP_COLUMNS_.primaryContactPhone,
  ];
  const queryDigits = digitsOnly_(query);

  return searchableColumns.some(function (column) {
    const value = cleanText_(row[column]).toLocaleLowerCase('zh-Hant');
    if (value.indexOf(query) !== -1) return true;
    return queryDigits.length >= 3 && digitsOnly_(value).indexOf(queryDigits) !== -1;
  });
}

function requireSpreadsheetId_() {
  const spreadsheetId = cleanText_(
    PropertiesService.getScriptProperties().getProperty(AUTH_PROPERTY_KEYS_.spreadsheetId)
  );
  if (!spreadsheetId) throw new Error('DATA_CONFIGURATION_ERROR');
  return spreadsheetId;
}

function requireIdentitySecret_() {
  const secret = cleanText_(
    PropertiesService.getScriptProperties().getProperty(AUTH_PROPERTY_KEYS_.identitySecret)
  );
  if (secret.length < 32) throw new Error('DATA_CONFIGURATION_ERROR');
  return secret;
}

function quoteSheetRange_(range) {
  return quoteNamedSheetRange_(FOLLOWUP_SHEET_NAME_, range);
}

function quoteNamedSheetRange_(sheetName, range) {
  return "'" + cleanText_(sheetName).replace(/'/g, "''") + "'!" + range;
}

function firstRow_(valueRange) {
  return valuesFrom_(valueRange)[0] || [];
}

function valuesFrom_(valueRange) {
  return valueRange && Array.isArray(valueRange.values) ? valueRange.values : [];
}

function padRow_(row, length) {
  const copy = Array.isArray(row) ? row.slice(0, length) : [];
  while (copy.length < length) copy.push('');
  return copy;
}

function normalizeStatus_(value) {
  return cleanText_(value) || '洽談中';
}

function normalizeConsultationText_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\r\n?/g, '\n')
    .trim();
}

function normalizeStoredDate_(value) {
  const text = cleanText_(value);
  if (!text) return '';

  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return text;

  const normalized = [
    match[1],
    String(Number(match[2])).padStart(2, '0'),
    String(Number(match[3])).padStart(2, '0'),
  ].join('-');
  return isValidIsoDate_(normalized) ? normalized : text;
}

function isValidIsoDate_(value) {
  const match = cleanText_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isSecureToken_(value) {
  return /^[A-Za-z0-9_-]{40,}$/.test(cleanText_(value));
}

function parseBoolean_(value) {
  const normalized = cleanText_(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === '是';
}

function normalizeSearchQuery_(value) {
  return cleanText_(value).slice(0, 100).toLocaleLowerCase('zh-Hant');
}

function normalizeSerialNumber_(value) {
  return cleanText_(value).toUpperCase();
}

function normalizeEmail_(value) {
  return cleanText_(value).toLowerCase();
}

function normalizeSalesCode_(value) {
  return cleanText_(value).toUpperCase();
}

function normalizeDomain_(value) {
  return cleanText_(value).toLowerCase().replace(/^@+/, '');
}

function isFollowupUserEnabled_(value) {
  return value === true || cleanText_(value).toUpperCase() === 'TRUE';
}

function digitsOnly_(value) {
  return cleanText_(value).replace(/\D/g, '');
}

function cleanText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}
