/**
 * Wedding Chapter — Follow-up read-only web app (Phase 1B-2)
 *
 * Required Script Properties:
 *   FOLLOWUP_ALLOWED_DOMAIN
 *   FOLLOWUP_ALLOWED_EMAILS
 *   FOLLOWUP_SPREADSHEET_ID
 *
 * This project intentionally exposes no Sheet write function.
 */

const FOLLOWUP_SHEET_NAME_ = '新人資料';
const FOLLOWUP_MAX_LIST_RESULTS_ = 100;

const AUTH_PROPERTY_KEYS_ = Object.freeze({
  allowedDomain: 'FOLLOWUP_ALLOWED_DOMAIN',
  allowedEmails: 'FOLLOWUP_ALLOWED_EMAILS',
  spreadsheetId: 'FOLLOWUP_SPREADSHEET_ID',
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
    requireAuthorizedUser_();
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
  requireAuthorizedUser_();

  const normalizedQuery = normalizeSearchQuery_(query);
  const rows = readListRows_();
  const results = [];

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!cleanText_(row[FOLLOWUP_COLUMNS_.serialNumber])) continue;
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
  requireAuthorizedUser_();

  const target = normalizeSerialNumber_(serialNumber);
  if (!target) throw new Error('NOT_FOUND');

  const rows = readDetailRows_();
  const matches = rows.filter(function (row) {
    return normalizeSerialNumber_(row[FOLLOWUP_COLUMNS_.serialNumber]) === target;
  });

  if (matches.length === 0) throw new Error('NOT_FOUND');
  if (matches.length > 1) throw new Error('DATA_INTEGRITY_ERROR');

  return mapCaseDetail_(matches[0]);
}

/**
 * Rejects unless the active Google account belongs to the configured
 * Workspace domain and exact server-side email allowlist.
 *
 * @return {{email: string, domainValid: boolean, emailAllowlisted: boolean}}
 */
function requireAuthorizedUser_() {
  const properties = PropertiesService.getScriptProperties();
  const allowedDomain = normalizeDomain_(
    properties.getProperty(AUTH_PROPERTY_KEYS_.allowedDomain)
  );
  const allowedEmails = parseAllowedEmails_(
    properties.getProperty(AUTH_PROPERTY_KEYS_.allowedEmails)
  );

  if (!allowedDomain || allowedEmails.length === 0) {
    throw new Error('AUTH_CONFIGURATION_MISSING');
  }

  const email = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!email) throw new Error('AUTH_EMAIL_UNAVAILABLE');

  const emailDomain = email.split('@')[1] || '';
  if (emailDomain !== allowedDomain) throw new Error('AUTH_DOMAIN_DENIED');
  if (allowedEmails.indexOf(email) === -1) throw new Error('AUTH_EMAIL_DENIED');

  return {
    email: email,
    domainValid: true,
    emailAllowlisted: true,
  };
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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

function mapCaseDetail_(row) {
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
    closedDate: cleanText_(row[FOLLOWUP_COLUMNS_.closedDate]),
  };
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

function quoteSheetRange_(range) {
  return "'" + FOLLOWUP_SHEET_NAME_.replace(/'/g, "''") + "'!" + range;
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

function normalizeDomain_(value) {
  return cleanText_(value).toLowerCase().replace(/^@+/, '');
}

function parseAllowedEmails_(value) {
  const uniqueEmails = {};
  cleanText_(value)
    .split(/[\s,;]+/)
    .map(normalizeEmail_)
    .filter(Boolean)
    .forEach(function (email) {
      uniqueEmails[email] = true;
    });
  return Object.keys(uniqueEmails);
}

function digitsOnly_(value) {
  return cleanText_(value).replace(/\D/g, '');
}

function cleanText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}
