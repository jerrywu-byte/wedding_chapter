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
const FEEDBACK_SHEET = 'Feedback';
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
const FEEDBACK_HEADERS = [
  '訪客編號',
  '活動日期',
  '回填時間',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Q5',
  'Q6',
  'Q7',
  '回饋Token',
  '回饋狀態',
];
const FEEDBACK_ALLOWED_Q1_Q3 = Object.freeze(['非常同意', '同意', '普通', '不同意']);
const FEEDBACK_ALLOWED_Q2 = Object.freeze(['非常清楚', '清楚', '略有疑問', '不清楚']);
const FEEDBACK_ALLOWED_Q4 = Object.freeze([
  '菜色口味',
  '交通／停車',
  '現場服務',
  '宴會企劃／婚顧團隊專業度',
  '整體預算／宴會費用',
  '場地風格／宴會廳空間／硬體設備',
  '專案內容／優惠方案',
  '宴會日期／檔期',
  '家人／長輩意見',
  '目前沒有特別猶豫',
  '其他',
]);
const FEEDBACK_ALLOWED_Q5 = Object.freeze([
  '宴會廳風格符合期待',
  '菜色口味滿意',
  '價格合理／整體 CP 值高',
  '專案及婚宴內容完整清楚／服務規劃完善',
  '宴會企劃人員親切、專業',
  '場地硬體設備完善',
  '交通／舉辦地點符合需求',
  '其他',
]);

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

/**
 * Run once manually after creating or before using the Feedback sheet.
 * Never clears existing feedback rows.
 */
function setupFeedbackSheet() {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(FEEDBACK_SHEET) || spreadsheet.insertSheet(FEEDBACK_SHEET);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
  } else {
    const current = sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).getValues()[0];
    if (!headersMatch_(current, FEEDBACK_HEADERS)) {
      throw new Error('HEADER_MISMATCH:' + FEEDBACK_SHEET);
    }
  }

  sheet.setFrozenRows(1);
  return { success: true, sheet: FEEDBACK_SHEET };
}

/**
 * Manual/internal helper for creating one activity-feedback invitation.
 * Returns the opaque token that should be placed in the LINE survey URL.
 */
function createFeedbackInvite(serialNumber, eventDate) {
  const serial = cleanText_(serialNumber);
  const date = cleanText_(eventDate);
  if (!serial || !/^\d{3}[A-Z]{2,4}\d{4,}$/.test(serial)) {
    throw new Error('INVALID_SERIAL_NUMBER');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('INVALID_EVENT_DATE');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const submissions = requireSheet_(spreadsheet, SUBMISSIONS_SHEET);
    const feedback = requireSheet_(spreadsheet, FEEDBACK_SHEET);
    if (!findSubmissionBySerial_(submissions, serial)) {
      throw new Error('SERIAL_NOT_FOUND');
    }

    const existing = findFeedbackBySerial_(feedback, serial);
    if (existing) {
      return {
        success: true,
        status: existing.status || 'PENDING',
        serialNumber: serial,
        token: existing.token,
      };
    }

    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    feedback.appendRow([
      serial,
      date,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      token,
      'PENDING',
    ]);
    SpreadsheetApp.flush();

    return {
      success: true,
      status: 'PENDING',
      serialNumber: serial,
      token: token,
    };
  } finally {
    lock.releaseLock();
  }
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
    if (payload && payload.action === 'getFeedbackContext') {
      return jsonResponse_(getFeedbackContext_(payload));
    }
    if (payload && payload.action === 'saveFeedback') {
      return jsonResponse_(saveFeedback_(payload));
    }
    const result = saveSubmission_(payload);
    return jsonResponse_(result);
  } catch (error) {
    const errorCode = error && error.message === 'VALIDATION_ERROR'
      ? 'VALIDATION_ERROR'
      : 'ERROR';
    return jsonResponse_({
      success: false,
      status: errorCode,
      message: errorCode === 'VALIDATION_ERROR'
        ? '請輸入正確的手機號碼，例如 0912-345-678'
        : error && error.message ? error.message : String(error),
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

function getFeedbackContext_(payload) {
  const token = normalizeFeedbackToken_(payload && payload.token);
  const spreadsheet = getSpreadsheet_();
  const feedback = requireSheet_(spreadsheet, FEEDBACK_SHEET);
  const invite = findFeedbackByToken_(feedback, token);
  if (!invite) throw new Error('INVALID_FEEDBACK_TOKEN');

  const submissions = requireSheet_(spreadsheet, SUBMISSIONS_SHEET);
  const submission = findSubmissionBySerial_(submissions, invite.serialNumber);
  if (!submission) throw new Error('SERIAL_NOT_FOUND');

  return {
    success: true,
    status: invite.status || 'PENDING',
    eventDate: formatSheetDate_(invite.eventDate),
    coupleName: [submission.partner1Name, submission.partner2Name].filter(Boolean).join(' × '),
  };
}

function saveFeedback_(payload) {
  const normalized = validateFeedbackPayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getSpreadsheet_();
    const feedback = requireSheet_(spreadsheet, FEEDBACK_SHEET);
    const invite = findFeedbackByToken_(feedback, normalized.token);
    if (!invite) throw new Error('INVALID_FEEDBACK_TOKEN');

    if (invite.status === 'COMPLETED') {
      return {
        success: true,
        status: 'ALREADY_COMPLETED',
        submittedAt: formatSheetDateTime_(invite.submittedAt),
      };
    }

    const submissions = requireSheet_(spreadsheet, SUBMISSIONS_SHEET);
    if (!findSubmissionBySerial_(submissions, invite.serialNumber)) {
      throw new Error('SERIAL_NOT_FOUND');
    }

    const submittedAt = new Date();
    feedback.getRange(invite.rowNumber, 3, 1, 10).setValues([[
      submittedAt,
      normalized.q1,
      normalized.q2,
      normalized.q3,
      serializeFeedbackMulti_(normalized.q4, normalized.q4Other),
      serializeFeedbackMulti_(normalized.q5, normalized.q5Other),
      normalized.q6,
      normalized.q7,
      normalized.token,
      'COMPLETED',
    ]]);
    SpreadsheetApp.flush();

    return {
      success: true,
      status: 'COMPLETED',
      submittedAt: submittedAt.toISOString(),
    };
  } finally {
    lock.releaseLock();
  }
}

function validateFeedbackPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('INVALID_FEEDBACK_PAYLOAD');
  }

  const data = {
    token: normalizeFeedbackToken_(payload.token),
    q1: cleanText_(payload.q1),
    q2: cleanText_(payload.q2),
    q3: cleanText_(payload.q3),
    q4: normalizeFeedbackMulti_(payload.q4),
    q4Other: cleanText_(payload.q4Other),
    q5: normalizeFeedbackMulti_(payload.q5),
    q5Other: cleanText_(payload.q5Other),
    q6: cleanText_(payload.q6),
    q7: cleanText_(payload.q7),
  };

  if (FEEDBACK_ALLOWED_Q1_Q3.indexOf(data.q1) === -1) throw new Error('INVALID_FEEDBACK_Q1');
  if (FEEDBACK_ALLOWED_Q2.indexOf(data.q2) === -1) throw new Error('INVALID_FEEDBACK_Q2');
  if (FEEDBACK_ALLOWED_Q1_Q3.indexOf(data.q3) === -1) throw new Error('INVALID_FEEDBACK_Q3');
  validateFeedbackMulti_(data.q4, FEEDBACK_ALLOWED_Q4, 'Q4');
  validateFeedbackMulti_(data.q5, FEEDBACK_ALLOWED_Q5, 'Q5');

  if (data.q4.indexOf('目前沒有特別猶豫') !== -1 && data.q4.length !== 1) {
    throw new Error('INVALID_FEEDBACK_Q4');
  }
  if (data.q4.indexOf('其他') !== -1 && !data.q4Other) throw new Error('INVALID_FEEDBACK_Q4_OTHER');
  if (data.q5.indexOf('其他') !== -1 && !data.q5Other) throw new Error('INVALID_FEEDBACK_Q5_OTHER');
  if (data.q4Other.length > 120 || data.q5Other.length > 120 ||
      data.q6.length > 500 || data.q7.length > 500) {
    throw new Error('INVALID_FEEDBACK_LENGTH');
  }

  return data;
}

function normalizeFeedbackMulti_(value) {
  if (!Array.isArray(value)) throw new Error('INVALID_FEEDBACK_MULTI');
  return value.map(cleanText_).filter(Boolean);
}

function validateFeedbackMulti_(values, allowed, field) {
  if (!values.length) throw new Error('INVALID_FEEDBACK_' + field);
  if (values.some(function (value) { return allowed.indexOf(value) === -1; })) {
    throw new Error('INVALID_FEEDBACK_' + field);
  }
}

function serializeFeedbackMulti_(values, other) {
  return values.map(function (value) {
    return value === '其他' && other ? '其他：' + other : value;
  }).join('｜');
}

function normalizeFeedbackToken_(value) {
  const token = cleanText_(value);
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) throw new Error('INVALID_FEEDBACK_TOKEN');
  return token;
}

function findFeedbackByToken_(sheet, token) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, FEEDBACK_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][10]) === token) {
      return {
        rowNumber: i + 2,
        serialNumber: cleanText_(values[i][0]),
        eventDate: values[i][1],
        submittedAt: values[i][2],
        token: token,
        status: cleanText_(values[i][11]) || 'PENDING',
      };
    }
  }
  return null;
}

function findFeedbackBySerial_(sheet, serialNumber) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, FEEDBACK_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][0]) === serialNumber) {
      return {
        rowNumber: i + 2,
        serialNumber: serialNumber,
        eventDate: values[i][1],
        submittedAt: values[i][2],
        token: cleanText_(values[i][10]),
        status: cleanText_(values[i][11]) || 'PENDING',
      };
    }
  }
  return null;
}

function findSubmissionBySerial_(sheet, serialNumber) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SUBMISSION_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (cleanText_(values[i][0]) === serialNumber) {
      return {
        serialNumber: serialNumber,
        partner1Name: cleanText_(values[i][3]),
        partner2Name: cleanText_(values[i][5]),
      };
    }
  }
  return null;
}

function formatSheetDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  return cleanText_(value);
}

function formatSheetDateTime_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return cleanText_(value);
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

  data.partner1Phone = normalizeTaiwanMobile_(data.partner1Phone);
  data.partner2Phone = normalizeTaiwanMobile_(data.partner2Phone);
  data.emergencyContactPhone = normalizeTaiwanMobile_(data.emergencyContactPhone);

  if (data.emergencyContactName === data.partner1Name) {
    data.emergencyContactPhone = data.partner1Phone;
  } else if (data.emergencyContactName === data.partner2Name) {
    data.emergencyContactPhone = data.partner2Phone;
  }

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

function normalizeTaiwanMobile_(value) {
  const compact = cleanText_(value).replace(/[\s\-–—－()（）.．/／]/g, '');
  if (!/^09\d{8}$/.test(compact)) throw new Error('VALIDATION_ERROR');
  return compact.slice(0, 4) + '-' + compact.slice(4, 7) + '-' + compact.slice(7);
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
