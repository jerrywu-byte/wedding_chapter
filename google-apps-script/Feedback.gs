/**
 * Wedding Chapter — Activity Feedback module
 *
 * Lives beside the existing newcomer Code.gs.
 * Keeps feedback storage isolated from the original submission flow.
 */

const FEEDBACK_MODULE_SHEET_ = '回饋總表';
const FEEDBACK_MODULE_LEGACY_SHEET_ = 'Feedback';
const FEEDBACK_MODULE_SUBMISSIONS_SHEET_ = '新人資料';
const FEEDBACK_MODULE_HEADERS_ = Object.freeze([
  '訪客編號',
  '活動日期',
  '回填時間',
  '業務姓名',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Q5',
  'Q6',
  'Q7',
  '回饋Token',
  '回饋狀態',
]);
const FEEDBACK_MODULE_LEGACY_HEADERS_ = Object.freeze([
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
]);

const FEEDBACK_MODULE_SCORE_MIN_ = 1;
const FEEDBACK_MODULE_SCORE_MAX_ = 5;
const FEEDBACK_MODULE_LEGACY_Q1_Q3_ = Object.freeze(['非常同意', '同意', '普通', '不同意']);
const FEEDBACK_MODULE_LEGACY_Q2_ = Object.freeze(['非常清楚', '清楚', '略有疑問', '不清楚']);
const FEEDBACK_MODULE_ALLOWED_Q4_ = Object.freeze([
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
const FEEDBACK_MODULE_ALLOWED_Q5_ = Object.freeze([
  '宴會廳風格符合期待',
  '菜色口味滿意',
  '價格合理／整體 CP 值高',
  '專案及婚宴內容完整清楚／服務規劃完善',
  '宴會企劃人員親切、專業',
  '場地硬體設備完善',
  '交通／舉辦地點符合需求',
  '其他',
]);

function setupFeedbackSheet() {
  const spreadsheet = feedbackSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(FEEDBACK_MODULE_SHEET_);
  const legacySheet = spreadsheet.getSheetByName(FEEDBACK_MODULE_LEGACY_SHEET_);

  if (!sheet && legacySheet) {
    legacySheet.setName(FEEDBACK_MODULE_SHEET_);
    sheet = legacySheet;
  }
  if (!sheet) sheet = spreadsheet.insertSheet(FEEDBACK_MODULE_SHEET_);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, FEEDBACK_MODULE_HEADERS_.length)
      .setValues([FEEDBACK_MODULE_HEADERS_]);
  } else {
    const currentV2 = sheet.getRange(1, 1, 1, FEEDBACK_MODULE_HEADERS_.length).getValues()[0];
    if (!feedbackHeadersMatch_(currentV2)) {
      const currentLegacy = sheet
        .getRange(1, 1, 1, FEEDBACK_MODULE_LEGACY_HEADERS_.length)
        .getValues()[0];

      if (feedbackLegacyHeadersMatch_(currentLegacy)) {
        sheet.insertColumnBefore(4);
        sheet.getRange(1, 1, 1, FEEDBACK_MODULE_HEADERS_.length)
          .setValues([FEEDBACK_MODULE_HEADERS_]);
        feedbackBackfillSalesNames_(sheet);
      } else {
        throw new Error('FEEDBACK_HEADER_MISMATCH');
      }
    }
  }

  sheet.setFrozenRows(1);
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, sheet.getMaxRows(), FEEDBACK_MODULE_HEADERS_.length)
      .createFilter();
  }

  return { success: true, sheet: FEEDBACK_MODULE_SHEET_ };
}

function createFeedbackInvite(serialNumber, eventDate) {
  setupFeedbackSheet();
  const serial = feedbackClean_(serialNumber);
  const date = feedbackClean_(eventDate);

  if (!serial || !/^\d{3}[A-Z]{2,4}\d{4,}$/.test(serial)) {
    throw new Error('INVALID_SERIAL_NUMBER');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('INVALID_EVENT_DATE');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = feedbackSpreadsheet_();
    const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
    const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);

    const submission = feedbackFindSubmission_(submissions, serial);
    if (!submission) {
      throw new Error('SERIAL_NOT_FOUND');
    }

    const existing = feedbackFindBySerial_(feedback, serial);
    if (existing) {
      return {
        success: true,
        status: existing.status || 'PENDING',
        serialNumber: serial,
        token: existing.token,
      };
    }

    const token = feedbackGenerateToken_();

    feedback.appendRow([
      serial,
      date,
      '',
      submission.salesName,
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

function getFeedbackContext_(payload) {
  setupFeedbackSheet();
  const token = feedbackNormalizeToken_(payload && payload.token);
  const spreadsheet = feedbackSpreadsheet_();
  const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
  const invite = feedbackFindByToken_(feedback, token);

  if (!invite) throw new Error('INVALID_FEEDBACK_TOKEN');

  const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
  const submission = feedbackFindSubmission_(submissions, invite.serialNumber);
  if (!submission) throw new Error('SERIAL_NOT_FOUND');

  return {
    success: true,
    status: invite.status || 'PENDING',
    eventDate: feedbackFormatDate_(invite.eventDate),
    coupleName: [submission.partner1Name, submission.partner2Name]
      .filter(Boolean)
      .join(' × '),
  };
}

function saveFeedback_(payload) {
  setupFeedbackSheet();
  const normalized = feedbackValidatePayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = feedbackSpreadsheet_();
    const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
    const invite = feedbackFindByToken_(feedback, normalized.token);

    if (!invite) throw new Error('INVALID_FEEDBACK_TOKEN');

    if (invite.status === 'COMPLETED') {
      return {
        success: true,
        status: 'ALREADY_COMPLETED',
        submittedAt: feedbackFormatDateTime_(invite.submittedAt),
      };
    }

    const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
    const submission = feedbackFindSubmission_(submissions, invite.serialNumber);
    if (!submission) {
      throw new Error('SERIAL_NOT_FOUND');
    }

    const submittedAt = new Date();

    feedback.getRange(invite.rowNumber, 3, 1, 11).setValues([[
      submittedAt,
      submission.salesName,
      normalized.q1,
      normalized.q2,
      normalized.q3,
      feedbackSerializeMulti_(normalized.q4, normalized.q4Other),
      feedbackSerializeMulti_(normalized.q5, normalized.q5Other),
      normalized.q6,
      normalized.q7,
      normalized.token,
      'COMPLETED',
    ]]);

    feedbackUpdateSendReturnTime_(invite.serialNumber, submittedAt);
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

function feedbackValidatePayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('INVALID_FEEDBACK_PAYLOAD');
  }

  const data = {
    token: feedbackNormalizeToken_(payload.token),
    q1: feedbackNormalizeScoreOrLegacy_(payload.q1, 'Q1'),
    q2: feedbackNormalizeScoreOrLegacy_(payload.q2, 'Q2'),
    q3: feedbackNormalizeScoreOrLegacy_(payload.q3, 'Q3'),
    q4: feedbackNormalizeMulti_(payload.q4),
    q4Other: feedbackClean_(payload.q4Other),
    q5: feedbackNormalizeMulti_(payload.q5),
    q5Other: feedbackClean_(payload.q5Other),
    q6: feedbackClean_(payload.q6),
    q7: feedbackClean_(payload.q7),
  };

  feedbackValidateMulti_(data.q4, FEEDBACK_MODULE_ALLOWED_Q4_, 'Q4');
  feedbackValidateMulti_(data.q5, FEEDBACK_MODULE_ALLOWED_Q5_, 'Q5');

  if (data.q4.indexOf('目前沒有特別猶豫') !== -1 && data.q4.length !== 1) {
    throw new Error('INVALID_FEEDBACK_Q4');
  }

  if (data.q4.indexOf('其他') !== -1 && !data.q4Other) {
    throw new Error('INVALID_FEEDBACK_Q4_OTHER');
  }
  if (data.q5.indexOf('其他') !== -1 && !data.q5Other) {
    throw new Error('INVALID_FEEDBACK_Q5_OTHER');
  }

  if (
    data.q4Other.length > 120 ||
    data.q5Other.length > 120 ||
    data.q6.length > 500 ||
    data.q7.length > 500
  ) {
    throw new Error('INVALID_FEEDBACK_LENGTH');
  }

  return data;
}

function feedbackNormalizeScoreOrLegacy_(value, field) {
  const text = feedbackClean_(value);
  const score = Number(text);

  if (
    Number.isInteger(score) &&
    score >= FEEDBACK_MODULE_SCORE_MIN_ &&
    score <= FEEDBACK_MODULE_SCORE_MAX_
  ) {
    return score;
  }

  const legacyAllowed = field === 'Q2'
    ? FEEDBACK_MODULE_LEGACY_Q2_
    : FEEDBACK_MODULE_LEGACY_Q1_Q3_;

  if (legacyAllowed.indexOf(text) !== -1) {
    return text;
  }

  throw new Error('INVALID_FEEDBACK_' + field);
}

function feedbackNormalizeMulti_(value) {
  if (!Array.isArray(value)) throw new Error('INVALID_FEEDBACK_MULTI');
  return value.map(feedbackClean_).filter(Boolean);
}

function feedbackValidateMulti_(values, allowed, field) {
  if (!values.length) throw new Error('INVALID_FEEDBACK_' + field);
  if (values.some(function (value) { return allowed.indexOf(value) === -1; })) {
    throw new Error('INVALID_FEEDBACK_' + field);
  }
}

function feedbackSerializeMulti_(values, other) {
  return values.map(function (value) {
    return value === '其他' && other ? '其他：' + other : value;
  }).join('｜');
}

function feedbackNormalizeToken_(value) {
  const token = feedbackClean_(value);
  // New tokens are 22 URL-safe characters. Keep accepting legacy 64-char tokens.
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(token)) {
    throw new Error('INVALID_FEEDBACK_TOKEN');
  }
  return token;
}

function feedbackGenerateToken_() {
  const seed = [
    Utilities.getUuid(),
    Utilities.getUuid(),
    String(new Date().getTime()),
  ].join('|');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    seed
  );

  return Utilities.base64EncodeWebSafe(digest)
    .replace(/=+$/g, '')
    .slice(0, 22);
}

function feedbackFindByToken_(sheet, token) {
  if (sheet.getLastRow() < 2) return null;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, FEEDBACK_MODULE_HEADERS_.length)
    .getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][11]) === token) {
      return {
        rowNumber: i + 2,
        serialNumber: feedbackClean_(values[i][0]),
        eventDate: values[i][1],
        submittedAt: values[i][2],
        token: token,
        status: feedbackClean_(values[i][12]) || 'PENDING',
      };
    }
  }

  return null;
}

function feedbackFindBySerial_(sheet, serialNumber) {
  if (sheet.getLastRow() < 2) return null;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, FEEDBACK_MODULE_HEADERS_.length)
    .getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][0]) === serialNumber) {
      return {
        rowNumber: i + 2,
        serialNumber: serialNumber,
        eventDate: values[i][1],
        submittedAt: values[i][2],
        token: feedbackClean_(values[i][11]),
        status: feedbackClean_(values[i][12]) || 'PENDING',
      };
    }
  }

  return null;
}

function feedbackFindSubmission_(sheet, serialNumber) {
  if (sheet.getLastRow() < 2) return null;

  const columns = feedbackSubmissionColumns_(sheet);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][columns.serialNumber]).toUpperCase() === serialNumber.toUpperCase()) {
      return feedbackSubmissionDataFromRow_(values[i], columns);
    }
  }

  return null;
}

function feedbackSubmissionColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(feedbackClean_);

  function findHeader_(candidates) {
    for (let i = 0; i < candidates.length; i += 1) {
      const index = headers.indexOf(candidates[i]);
      if (index !== -1) return index;
    }
    return -1;
  }

  const columns = {
    serialNumber: findHeader_(['正式流水號', 'serialNumber']),
    submittedAt: findHeader_(['提交時間', 'submittedAt']),
    partner1Name: findHeader_(['新郎姓名', 'partner1Name']),
    partner2Name: findHeader_(['新娘姓名', 'partner2Name']),
    primaryContactName: findHeader_(['主要聯絡人姓名', '緊急聯絡人姓名', 'emergencyContactName']),
    salesName: findHeader_(['業務姓名', 'salesName']),
  };

  Object.keys(columns).forEach(function (key) {
    if (columns[key] < 0) {
      throw new Error('SUBMISSION_HEADER_NOT_FOUND:' + key);
    }
  });

  return columns;
}

function feedbackSubmissionDataFromRow_(row, columns) {
  return {
    serialNumber: feedbackClean_(row[columns.serialNumber]).toUpperCase(),
    submittedAt: row[columns.submittedAt],
    partner1Name: feedbackClean_(row[columns.partner1Name]),
    partner2Name: feedbackClean_(row[columns.partner2Name]),
    primaryContactName: feedbackClean_(row[columns.primaryContactName]),
    salesName: feedbackClean_(row[columns.salesName]),
  };
}

function feedbackSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID_NOT_CONFIGURED');
  return SpreadsheetApp.openById(id);
}

function feedbackRequireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('SHEET_NOT_INITIALIZED:' + name);
  return sheet;
}

function feedbackHeadersMatch_(current) {
  return FEEDBACK_MODULE_HEADERS_.every(function (header, index) {
    return feedbackClean_(current[index]) === header;
  });
}

function feedbackLegacyHeadersMatch_(current) {
  return FEEDBACK_MODULE_LEGACY_HEADERS_.every(function (header, index) {
    return feedbackClean_(current[index]) === header;
  });
}

function feedbackBackfillSalesNames_(sheet) {
  if (sheet.getLastRow() < 2) return;

  const submissions = feedbackRequireSheet_(
    feedbackSpreadsheet_(),
    FEEDBACK_MODULE_SUBMISSIONS_SHEET_
  );
  const submissionMap = feedbackSubmissionMap_(submissions);
  const serials = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const values = serials.map(function (row) {
    const serial = feedbackClean_(row[0]).toUpperCase();
    const submission = submissionMap[serial];
    return [submission ? submission.salesName : ''];
  });

  sheet.getRange(2, 4, values.length, 1).setValues(values);
}

function feedbackFormatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  return feedbackClean_(value);
}

function feedbackFormatDateTime_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return feedbackClean_(value);
}

function feedbackClean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}



function migrateFeedbackV2() {
  return migrateFeedbackV3();
}

/**
 * Feedback V3:
 * - 回饋發送 becomes a 9-column operational send queue.
 * - New Wedding Chapter submissions can create their feedback invite automatically.
 * - 發送日期 and 確認發送 remain staff-maintained.
 */
const FEEDBACK_SEND_SHEET_ = '回饋發送';
const FEEDBACK_SEND_HEADERS_ = Object.freeze([
  '訪客編號',
  '編號創建時間',
  '發送日期',
  '新人姓名',
  '主要聯絡人',
  '產生狀態',
  '專屬回饋連結',
  '回填時間',
  '確認發送',
]);
const FEEDBACK_SEND_V2_HEADERS_ = Object.freeze([
  '訪客編號',
  '發送日期',
  '新人姓名',
  '產生狀態',
  '專屬回饋連結',
  '回填狀態',
  '回填時間',
]);
const FEEDBACK_PUBLIC_FORM_URL_DEFAULT_ =
  'https://jerrywu-byte.github.io/wedding_chapter/f/';
const FEEDBACK_PUBLIC_FORM_URL_LEGACY_ =
  'https://jerrywu-byte.github.io/wedding_chapter/feedback/index.html';

function migrateFeedbackV3() {
  setupFeedbackSheet();
  const sendResult = setupFeedbackSendSheet_();
  syncFeedbackSendRows();

  SpreadsheetApp.getActive().toast(
    '回饋發送已升級為自動連結流程；發送日期與確認發送保留給同事填寫。',
    'Wedding Chapter',
    8
  );

  return {
    success: true,
    feedbackSheet: FEEDBACK_MODULE_SHEET_,
    sendSheet: sendResult.sheet,
  };
}

/**
 * Called by newcomer Code.gs after saveSubmission_ returns a serial number.
 * This function is deliberately idempotent: re-running it reuses the same invite.
 */
function ensureFeedbackInviteForSubmission(serialNumber) {
  const serial = feedbackClean_(serialNumber).toUpperCase();
  if (!serial || !/^\d{3}[A-Z]{2,4}\d{4,}$/.test(serial)) {
    throw new Error('INVALID_SERIAL_NUMBER');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    setupFeedbackSheet();
    setupFeedbackSendSheet_();

    const spreadsheet = feedbackSpreadsheet_();
    const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
    const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
    const sendSheet = feedbackRequireSheet_(spreadsheet, FEEDBACK_SEND_SHEET_);

    const submission = feedbackFindSubmission_(submissions, serial);
    if (!submission) throw new Error('SERIAL_NOT_FOUND');

    let invite = feedbackFindBySerial_(feedback, serial);
    let created = false;

    if (!invite) {
      const token = feedbackGenerateToken_();
      feedback.appendRow([
        serial,
        '',
        '',
        submission.salesName,
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
      invite = {
        serialNumber: serial,
        eventDate: '',
        submittedAt: '',
        token: token,
        status: 'PENDING',
      };
      created = true;
    }

    const sendRow = feedbackUpsertSendRow_(sendSheet, submission, invite);
    SpreadsheetApp.flush();

    return {
      success: true,
      created: created,
      serialNumber: serial,
      token: invite.token,
      sendRow: sendRow,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds only maintenance actions. Link generation itself is automatic.
 */
function feedbackAddMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('活動回饋')
    .addItem('同步回填時間與資料', 'syncFeedbackSendRows')
    .addSeparator()
    .addItem('建立／檢查發送表', 'setupFeedbackSendSheet')
    .addToUi();
}

function installFeedbackMenu() {
  feedbackAddMenu_();
  SpreadsheetApp.getActive().toast(
    '「活動回饋」選單已加入；新人的專屬回饋連結將由後台自動產生。',
    'Wedding Chapter',
    6
  );
}

function setupFeedbackSendSheet() {
  return setupFeedbackSendSheet_();
}

function setupFeedbackSendSheet_() {
  const spreadsheet = feedbackSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(FEEDBACK_SEND_SHEET_);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(FEEDBACK_SEND_SHEET_);
  }

  const lastRow = sheet.getLastRow();
  const maxColumns = sheet.getMaxColumns();
  const currentV2 = maxColumns >= FEEDBACK_SEND_V2_HEADERS_.length
    ? sheet.getRange(1, 1, 1, FEEDBACK_SEND_V2_HEADERS_.length).getValues()[0]
    : [];
  const currentV3 = maxColumns >= FEEDBACK_SEND_HEADERS_.length
    ? sheet.getRange(1, 1, 1, FEEDBACK_SEND_HEADERS_.length).getValues()[0]
    : [];

  const v3Matches = feedbackHeadersEqual_(currentV3, FEEDBACK_SEND_HEADERS_);
  const v2Matches = feedbackHeadersEqual_(currentV2, FEEDBACK_SEND_V2_HEADERS_);
  const isBlank = lastRow === 0 || currentV2.every(function (value) {
    return !feedbackClean_(value);
  });

  if (!v3Matches) {
    if (isBlank) {
      feedbackEnsureSendColumns_(sheet);
      sheet.getRange(1, 1, 1, FEEDBACK_SEND_HEADERS_.length)
        .setValues([FEEDBACK_SEND_HEADERS_]);
    } else if (v2Matches) {
      feedbackMigrateSendSheetV2ToV3_(sheet);
    } else {
      throw new Error('FEEDBACK_SEND_HEADER_MISMATCH');
    }
  }

  feedbackFormatSendSheet_(sheet);
  return { success: true, sheet: FEEDBACK_SEND_SHEET_ };
}

function feedbackMigrateSendSheetV2ToV3_(sheet) {
  const oldLastRow = sheet.getLastRow();
  const oldRows = oldLastRow >= 2
    ? sheet.getRange(2, 1, oldLastRow - 1, FEEDBACK_SEND_V2_HEADERS_.length).getValues()
    : [];

  const spreadsheet = feedbackSpreadsheet_();
  const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
  const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
  const submissionMap = feedbackSubmissionMap_(submissions);
  const feedbackMap = feedbackInviteMap_(feedback);

  const migratedRows = oldRows.map(function (row) {
    const serial = feedbackClean_(row[0]).toUpperCase();
    if (!serial) return ['', '', '', '', '', '', '', '', ''];

    const submission = submissionMap[serial] || {};
    const invite = feedbackMap[serial] || null;
    const url = invite && invite.token
      ? feedbackPublicFormUrl_() + '?t=' + encodeURIComponent(invite.token)
      : feedbackClean_(row[4]);

    return [
      serial,
      submission.submittedAt || '',
      row[1] || '',
      feedbackClean_(row[2]) || feedbackCoupleName_(submission),
      feedbackClean_(submission.primaryContactName),
      feedbackClean_(row[3]) || (url ? '已產生' : '尚未產生'),
      url,
      row[6] || (invite && invite.submittedAt ? invite.submittedAt : ''),
      '',
    ];
  });

  const filter = sheet.getFilter();
  if (filter) filter.remove();

  feedbackEnsureSendColumns_(sheet);
  sheet.getRange(1, 1, sheet.getMaxRows(), FEEDBACK_SEND_HEADERS_.length).clearContent();
  sheet.getRange(1, 1, 1, FEEDBACK_SEND_HEADERS_.length)
    .setValues([FEEDBACK_SEND_HEADERS_]);

  if (migratedRows.length) {
    sheet.getRange(2, 1, migratedRows.length, FEEDBACK_SEND_HEADERS_.length)
      .setValues(migratedRows);
  }
}

function feedbackEnsureSendColumns_(sheet) {
  const missing = FEEDBACK_SEND_HEADERS_.length - sheet.getMaxColumns();
  if (missing > 0) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);
  }
}

function feedbackFormatSendSheet_(sheet) {
  const filter = sheet.getFilter();
  if (filter) filter.remove();

  sheet.setFrozenRows(1);
  sheet.getRange('A1:I1')
    .setBackground('#d9d9d9')
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange('A1').setNote('由新人完成 Wedding Chapter 後自動同步訪客編號');
  sheet.getRange('B1').setNote('訪客編號建立時間，由新人資料的提交時間自動同步');
  sheet.getRange('C1').setNote('由同事在實際發送回饋連結時填寫');
  sheet.getRange('E1').setNote('由新人資料的主要聯絡人姓名自動同步');
  sheet.getRange('I1').setNote('保持空白，由同事自行填寫是否已完成發送');

  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1)
      .setNumberFormat('yyyy-mm-dd hh:mm');
    sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1)
      .setNumberFormat('yyyy-mm-dd');
    sheet.getRange(2, 8, sheet.getMaxRows() - 1, 1)
      .setNumberFormat('yyyy-mm-dd hh:mm');
  }

  const widths = [110, 150, 110, 170, 140, 110, 360, 150, 110];
  widths.forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  sheet.getRange(1, 1, sheet.getMaxRows(), FEEDBACK_SEND_HEADERS_.length)
    .createFilter();
}

function feedbackHeadersEqual_(current, expected) {
  if (!current || current.length < expected.length) return false;
  return expected.every(function (header, index) {
    return feedbackClean_(current[index]) === header;
  });
}

function feedbackUpsertSendRow_(sheet, submission, invite) {
  const existingRow = feedbackFindSendRowBySerial_(sheet, submission.serialNumber);
  let sendDate = '';
  let confirmedSend = '';

  if (existingRow) {
    const current = sheet.getRange(existingRow, 1, 1, FEEDBACK_SEND_HEADERS_.length)
      .getValues()[0];
    sendDate = current[2] || '';
    confirmedSend = current[8] || '';
  }

  const rowValues = [
    submission.serialNumber,
    submission.submittedAt || '',
    sendDate,
    feedbackCoupleName_(submission),
    submission.primaryContactName || '',
    invite && invite.token ? '已產生' : '尚未產生',
    invite && invite.token
      ? feedbackPublicFormUrl_() + '?t=' + encodeURIComponent(invite.token)
      : '',
    invite && invite.submittedAt ? invite.submittedAt : '',
    confirmedSend,
  ];

  let rowNumber = existingRow;
  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, FEEDBACK_SEND_HEADERS_.length)
      .setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
    rowNumber = sheet.getLastRow();
  }

  sheet.getRange(rowNumber, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(rowNumber, 3).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(rowNumber, 8).setNumberFormat('yyyy-mm-dd hh:mm');
  return rowNumber;
}

function feedbackFindSendRowBySerial_(sheet, serialNumber) {
  if (sheet.getLastRow() < 2) return 0;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][0]).toUpperCase() === serialNumber.toUpperCase()) {
      return i + 2;
    }
  }
  return 0;
}

function feedbackUpdateSendReturnTime_(serialNumber, submittedAt) {
  const spreadsheet = feedbackSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(FEEDBACK_SEND_SHEET_);
  if (!sheet) return;

  const rowNumber = feedbackFindSendRowBySerial_(sheet, serialNumber);
  if (!rowNumber) return;

  sheet.getRange(rowNumber, 8)
    .setValue(submittedAt)
    .setNumberFormat('yyyy-mm-dd hh:mm');
}

function syncFeedbackSendRows() {
  setupFeedbackSheet();
  setupFeedbackSendSheet_();

  const spreadsheet = feedbackSpreadsheet_();
  const sheet = feedbackRequireSheet_(spreadsheet, FEEDBACK_SEND_SHEET_);
  const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
  const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
  const submissionMap = feedbackSubmissionMap_(submissions);
  const feedbackMap = feedbackInviteMap_(feedback);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { success: true, rows: 0 };
  }

  const currentRows = sheet.getRange(2, 1, lastRow - 1, FEEDBACK_SEND_HEADERS_.length)
    .getValues();

  const output = currentRows.map(function (current) {
    const serial = feedbackClean_(current[0]).toUpperCase();
    if (!serial) return current;

    const submission = submissionMap[serial];
    const invite = feedbackMap[serial];
    if (!submission) return current;

    return [
      serial,
      submission.submittedAt || current[1] || '',
      current[2] || '',
      feedbackCoupleName_(submission),
      submission.primaryContactName || '',
      invite && invite.token ? '已產生' : '尚未產生',
      invite && invite.token
        ? feedbackPublicFormUrl_() + '?t=' + encodeURIComponent(invite.token)
        : current[6] || '',
      invite && invite.submittedAt ? invite.submittedAt : current[7] || '',
      current[8] || '',
    ];
  });

  sheet.getRange(2, 1, output.length, FEEDBACK_SEND_HEADERS_.length)
    .setValues(output);
  feedbackFormatSendSheet_(sheet);
  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast(
    '已同步 ' + output.length + ' 列回饋發送資料。',
    'Wedding Chapter',
    6
  );

  return { success: true, rows: output.length };
}

/**
 * Compatibility wrappers for the previous V2 menu/functions.
 */
function setupFeedbackBatchSheet() {
  return setupFeedbackSendSheet();
}

function syncFeedbackBatchStatus() {
  return syncFeedbackSendRows();
}

function generateFeedbackLinksBatch() {
  setupFeedbackSheet();
  setupFeedbackSendSheet_();

  const spreadsheet = feedbackSpreadsheet_();
  const sheet = feedbackRequireSheet_(spreadsheet, FEEDBACK_SEND_SHEET_);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return { success: true, generated: 0 };

  const serials = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let generated = 0;

  serials.forEach(function (row) {
    const serial = feedbackClean_(row[0]).toUpperCase();
    if (!serial) return;
    const result = ensureFeedbackInviteForSubmission(serial);
    if (result && result.created) generated += 1;
  });

  return { success: true, generated: generated };
}

function feedbackSubmissionMap_(sheet) {
  const map = Object.create(null);
  if (sheet.getLastRow() < 2) return map;

  const columns = feedbackSubmissionColumns_(sheet);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();

  values.forEach(function (row) {
    const submission = feedbackSubmissionDataFromRow_(row, columns);
    if (!submission.serialNumber || map[submission.serialNumber]) return;
    map[submission.serialNumber] = submission;
  });

  return map;
}

function feedbackInviteMap_(sheet) {
  const map = Object.create(null);
  if (sheet.getLastRow() < 2) return map;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, FEEDBACK_MODULE_HEADERS_.length)
    .getValues();

  values.forEach(function (row) {
    const serial = feedbackClean_(row[0]).toUpperCase();
    if (!serial) return;

    map[serial] = {
      serialNumber: serial,
      eventDate: feedbackFormatDate_(row[1]),
      submittedAt: row[2],
      token: feedbackClean_(row[11]),
      status: feedbackClean_(row[12]) || 'PENDING',
    };
  });

  return map;
}

function feedbackCoupleName_(submission) {
  return [
    feedbackClean_(submission && submission.partner1Name),
    feedbackClean_(submission && submission.partner2Name),
  ].filter(Boolean).join(' × ');
}

function feedbackPublicFormUrl_() {
  const configured = feedbackClean_(
    PropertiesService.getScriptProperties().getProperty('FEEDBACK_PUBLIC_FORM_URL')
  );

  const url = !configured || configured === FEEDBACK_PUBLIC_FORM_URL_LEGACY_
    ? FEEDBACK_PUBLIC_FORM_URL_DEFAULT_
    : configured;

  return url.replace(/\/+$/, '');
}
