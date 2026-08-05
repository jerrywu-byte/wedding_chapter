/**
 * Wedding Chapter — Phase 1 Backend
 *
 * Script Property required:
 *   SPREADSHEET_ID = Google Spreadsheet ID
 *
 * Sheets created by setupWeddingChapterSheets():
 *   新人資料, 業務資料, 系統設定
 */

const SUBMISSIONS_SHEET = '新人資料';
const SALES_SHEET = '業務資料';
const SETTINGS_SHEET = '系統設定';
const SERIAL_PREFIX = 'DX';
const FIRST_SERIAL_SEQUENCE = 2001;

const SUBMISSION_HEADERS = [
  '正式流水號',
  '提交時間',
  '防重複識別碼',
  '新郎姓名',
  '新郎電話',
  '新娘姓名',
  '新娘電話',
  '緊急聯絡人姓名',
  '緊急聯絡人電話',
  '婚宴日期',
  '日期未定',
  '婚宴時段',
  '預計桌數',
  '業務代碼',
  '業務姓名',
];

const SALES_HEADERS = ['業務代碼', '業務姓名', '業務Email', 'LINE連結', '啟用'];
const SETTINGS_HEADERS = ['設定項目', '設定值'];

const LEGACY_SHEETS = {
  '新人資料': 'submissions',
  '業務資料': 'sales',
  '系統設定': 'settings',
};

const LEGACY_HEADERS = {
  '新人資料': [
    'serialNumber',
    'submittedAt',
    'submissionId',
    'partner1Name',
    'partner1Phone',
    'partner2Name',
    'partner2Phone',
    'emergencyContactName',
    'emergencyContactPhone',
    'weddingDate',
    'dateUndecided',
    'banquetSession',
    'estimatedTables',
    'salesCode',
    'salesName',
  ],
  '業務資料': ['salesCode', 'salesName', 'salesEmail'],
  '系統設定': ['key', 'value'],
};

/**
 * Run once from the Apps Script editor after setting SPREADSHEET_ID.
 * Safe to run again: it never clears existing submission data.
 */
function setupWeddingChapterSheets() {
  const spreadsheet = getSpreadsheet_();
  const submissions = ensureSheet_(
    spreadsheet,
    SUBMISSIONS_SHEET,
    SUBMISSION_HEADERS,
    LEGACY_SHEETS[SUBMISSIONS_SHEET],
    LEGACY_HEADERS[SUBMISSIONS_SHEET]
  );
  const sales = ensureSheet_(
    spreadsheet,
    SALES_SHEET,
    SALES_HEADERS.slice(0, 3),
    LEGACY_SHEETS[SALES_SHEET],
    LEGACY_HEADERS[SALES_SHEET]
  );
  const settings = ensureSheet_(
    spreadsheet,
    SETTINGS_SHEET,
    SETTINGS_HEADERS,
    LEGACY_SHEETS[SETTINGS_SHEET],
    LEGACY_HEADERS[SETTINGS_SHEET]
  );

  submissions.setFrozenRows(1);
  sales.setFrozenRows(1);
  settings.setFrozenRows(1);

  ensureSalesColumns_(sales);
  ensureSerialSetting_(settings, getRocYear_(new Date()));

  return {
    success: true,
    sheets: [SUBMISSIONS_SHEET, SALES_SHEET, SETTINGS_SHEET],
  };
}

function doPost(e) {
  try {
    const payload = parseRequest_(e);
    if (payload && payload.action === 'getSalesOptions') {
      return jsonResponse_({
        success: true,
        salesOptions: getSalesOptions_(),
      });
    }
    const result = saveSubmission_(payload);
    return jsonResponse_(result);
  } catch (error) {
    return jsonResponse_({
      success: false,
      status: 'ERROR',
      message: error && error.message ? error.message : String(error),
    });
  }
}

function doGet() {
  return jsonResponse_({
    success: false,
    status: 'METHOD_NOT_ALLOWED',
    error: 'Use POST /api/submissions.',
  });
}

function saveSubmission_(payload) {
  const normalized = validateAndNormalize_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getSpreadsheet_();
    const submissions = requireSheet_(spreadsheet, SUBMISSIONS_SHEET);
    const salesSheet = requireSheet_(spreadsheet, SALES_SHEET);
    const settings = requireSheet_(spreadsheet, SETTINGS_SHEET);

    const existing = findSubmissionById_(submissions, normalized.submissionId);
    if (existing) {
      return {
        success: true,
        status: 'ALREADY_SAVED',
        serialNumber: existing.serialNumber,
        salesName: existing.salesName,
      };
    }

    const sales = findSales_(salesSheet, normalized.salesCode);
    if (!sales) {
      throw new Error('INVALID_SALES_CODE');
    }

    const serialNumber = nextSerialNumber_(settings, new Date());
    const submittedAt = new Date();

    submissions.appendRow([
      serialNumber,
      submittedAt,
      normalized.submissionId,
      normalized.partner1Name,
      normalized.partner1Phone,
      normalized.partner2Name,
      normalized.partner2Phone,
      normalized.emergencyContactName,
      normalized.emergencyContactPhone,
      normalized.weddingDate,
      normalized.dateUndecided,
      normalized.banquetSession,
      normalized.estimatedTables,
      normalized.salesCode,
      sales.salesName,
    ]);

    SpreadsheetApp.flush();

    return {
      success: true,
      status: 'SAVED',
      serialNumber: serialNumber,
      salesName: sales.salesName,
    };
  } finally {
    lock.releaseLock();
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('EMPTY_REQUEST_BODY');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('INVALID_JSON');
  }
}

function validateAndNormalize_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('INVALID_PAYLOAD');
  }

  const data = {
    submissionId: cleanText_(payload.submissionId),
    partner1Name: cleanText_(payload.partner1Name),
    partner1Phone: cleanText_(payload.partner1Phone),
    partner2Name: cleanText_(payload.partner2Name),
    partner2Phone: cleanText_(payload.partner2Phone),
    emergencyContactName: cleanText_(payload.emergencyContactName),
    emergencyContactPhone: cleanText_(payload.emergencyContactPhone),
    weddingDate: cleanText_(payload.weddingDate),
    dateUndecided: payload.dateUndecided === true,
    banquetSession: cleanText_(payload.banquetSession),
    estimatedTables: Number(payload.estimatedTables),
    salesCode: cleanText_(payload.salesCode).toUpperCase(),
  };

  const required = [
    'submissionId',
    'partner1Name',
    'partner1Phone',
    'partner2Name',
    'partner2Phone',
    'emergencyContactName',
    'emergencyContactPhone',
    'banquetSession',
    'salesCode',
  ];

  required.forEach(function (field) {
    if (!data[field]) {
      throw new Error('MISSING_REQUIRED_FIELD:' + field);
    }
  });

  if (!data.dateUndecided && !data.weddingDate) {
    throw new Error('MISSING_REQUIRED_FIELD:weddingDate');
  }

  if (['午宴', '晚宴', '都可以'].indexOf(data.banquetSession) === -1) {
    throw new Error('INVALID_BANQUET_SESSION');
  }

  if (!Number.isFinite(data.estimatedTables) || data.estimatedTables <= 0) {
    throw new Error('INVALID_ESTIMATED_TABLES');
  }

  return data;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID_NOT_CONFIGURED');
  }
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(spreadsheet, name, headers, legacyName, legacyHeaders) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet && legacyName) {
    sheet = spreadsheet.getSheetByName(legacyName);
    if (sheet) {
      sheet.setName(name);
    }
  }
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const matchesCurrent = headersMatch_(current, headers);
    const matchesLegacy = legacyHeaders && headersMatch_(current, legacyHeaders);
    if (matchesLegacy) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else if (!matchesCurrent) {
      throw new Error('HEADER_MISMATCH:' + name);
    }
  }

  return sheet;
}

function headersMatch_(current, expected) {
  return expected.every(function (header, index) {
    return String(current[index] || '') === header;
  });
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error('SHEET_NOT_INITIALIZED:' + name);
  }
  return sheet;
}

function ensureSalesColumns_(sheet) {
  sheet.getRange(1, 4, 1, 2).setValues([SALES_HEADERS.slice(3)]);
  if (sheet.getMaxRows() > 1) {
    const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sheet.getRange(2, 5, sheet.getMaxRows() - 1, 1).setDataValidation(checkboxRule);
  }
}

function findSales_(sheet, salesCode) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SALES_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][0]).toUpperCase() === salesCode && isSalesEnabled_(values[i][4])) {
      return {
        salesCode: salesCode,
        salesName: cleanText_(values[i][1]),
      };
    }
  }
  return null;
}

function getSalesOptions_() {
  const sheet = requireSheet_(getSpreadsheet_(), SALES_SHEET);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SALES_HEADERS.length).getValues()
    .filter(function (row) {
      return cleanText_(row[0]) && cleanText_(row[1]) && /^https:\/\//i.test(cleanText_(row[3])) && isSalesEnabled_(row[4]);
    })
    .map(function (row) {
      return {
        value: cleanText_(row[0]).toUpperCase(),
        label: cleanText_(row[1]),
        lineUrl: cleanText_(row[3]),
      };
    });
}

function isSalesEnabled_(value) {
  return value === true || cleanText_(value).toUpperCase() === 'TRUE';
}

function findSubmissionById_(sheet, submissionId) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SUBMISSION_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][2]) === submissionId) {
      return {
        serialNumber: cleanText_(values[i][0]),
        salesName: cleanText_(values[i][14]),
      };
    }
  }
  return null;
}

function ensureSerialSetting_(settingsSheet, rocYear) {
  const key = 'LAST_SERIAL_SEQUENCE_' + rocYear;
  if (findSettingRow_(settingsSheet, key)) return;
  settingsSheet.appendRow([key, FIRST_SERIAL_SEQUENCE - 1]);
}

function nextSerialNumber_(settingsSheet, now) {
  const rocYear = getRocYear_(now);
  const key = 'LAST_SERIAL_SEQUENCE_' + rocYear;
  let row = findSettingRow_(settingsSheet, key);

  if (!row) {
    settingsSheet.appendRow([key, FIRST_SERIAL_SEQUENCE - 1]);
    row = settingsSheet.getLastRow();
  }

  const currentValue = Number(settingsSheet.getRange(row, 2).getValue());
  const current = Number.isFinite(currentValue) ? currentValue : FIRST_SERIAL_SEQUENCE - 1;
  const next = Math.max(current + 1, FIRST_SERIAL_SEQUENCE);
  settingsSheet.getRange(row, 2).setValue(next);

  return String(rocYear) + SERIAL_PREFIX + String(next);
}

function findSettingRow_(sheet, key) {
  if (sheet.getLastRow() < 2) return null;
  const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < keys.length; i += 1) {
    if (cleanText_(keys[i][0]) === key) return i + 2;
  }
  return null;
}

function getRocYear_(date) {
  return Number(Utilities.formatDate(date, 'Asia/Taipei', 'yyyy')) - 1911;
}

function cleanText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
