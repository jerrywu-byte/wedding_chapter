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

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][0]) === serialNumber) {
      return {
        serialNumber: serialNumber,
        partner1Name: feedbackClean_(values[i][3]),
        partner2Name: feedbackClean_(values[i][5]),
        salesName: feedbackClean_(values[i][14]),
      };
    }
  }

  return null;
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
  const feedbackResult = setupFeedbackSheet();
  const batchResult = setupFeedbackBatchSheet();
  SpreadsheetApp.getActive().toast(
    '回饋系統已升級：分頁名稱、業務姓名與發送日期欄位已完成。',
    'Wedding Chapter',
    8
  );
  return {
    success: true,
    feedbackSheet: feedbackResult.sheet,
    batchSheet: batchResult.sheet,
  };
}

/**
 * Internal batch-link workspace used by banquet staff.
 * Input columns: A visitor number, B event date.
 * Output columns: C:G are generated by the script.
 */
const FEEDBACK_BATCH_SHEET_ = '回饋發送';
const FEEDBACK_BATCH_LEGACY_SHEET_ = '活動回饋發送';
const FEEDBACK_BATCH_HEADERS_ = Object.freeze([
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

/**
 * Adds the activity-feedback menu to the bound spreadsheet UI.
 * If the project already has onOpen(), call feedbackAddMenu_() from it.
 */
function feedbackAddMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('活動回饋')
    .addItem('批次產生專屬連結', 'generateFeedbackLinksBatch')
    .addItem('同步回填狀態', 'syncFeedbackBatchStatus')
    .addSeparator()
    .addItem('建立／檢查發送表', 'setupFeedbackBatchSheet')
    .addToUi();
}

/**
 * Convenience function for the initial installation session.
 * Run once from the Apps Script editor to show the menu immediately.
 */
function installFeedbackMenu() {
  feedbackAddMenu_();
  SpreadsheetApp.getActive().toast(
    '「活動回饋」選單已加入。重新開啟試算表後，請由 onOpen() 呼叫 feedbackAddMenu_()。',
    'Wedding Chapter',
    6
  );
}

/**
 * Creates or validates the staff-facing batch-send sheet.
 * Safe to run repeatedly. Existing rows are preserved.
 */
function setupFeedbackBatchSheet() {
  const spreadsheet = feedbackSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(FEEDBACK_BATCH_SHEET_);
  const legacySheet = spreadsheet.getSheetByName(FEEDBACK_BATCH_LEGACY_SHEET_);

  if (!sheet && legacySheet) {
    legacySheet.setName(FEEDBACK_BATCH_SHEET_);
    sheet = legacySheet;
  }
  if (!sheet) {
    sheet = spreadsheet.insertSheet(FEEDBACK_BATCH_SHEET_);
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, FEEDBACK_BATCH_HEADERS_.length)
    .getValues()[0];

  const isBlank = currentHeaders.every(function (value) {
    return !feedbackClean_(value);
  });

  if (isBlank) {
    sheet
      .getRange(1, 1, 1, FEEDBACK_BATCH_HEADERS_.length)
      .setValues([FEEDBACK_BATCH_HEADERS_]);
  } else if (!FEEDBACK_BATCH_HEADERS_.every(function (header, index) {
    return feedbackClean_(currentHeaders[index]) === header;
  })) {
    const legacyHeaders = currentHeaders.slice();
    legacyHeaders[1] = '發送日期';
    if (FEEDBACK_BATCH_HEADERS_.every(function (header, index) {
      return feedbackClean_(legacyHeaders[index]) === header;
    })) {
      sheet.getRange(1, 1, 1, FEEDBACK_BATCH_HEADERS_.length)
        .setValues([FEEDBACK_BATCH_HEADERS_]);
    } else {
      throw new Error('FEEDBACK_BATCH_HEADER_MISMATCH');
    }
  }

  sheet.setFrozenRows(1);
  sheet.getRange('A1:G1')
    .setBackground('#d9d9d9')
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.getRange('A1').setNote('貼上 Wedding Chapter 訪客編號，例如 115DX2024');
  sheet.getRange('B1').setNote('輸入發送日期，例如 2026-10-04');
  sheet.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('G2:G').setNumberFormat('yyyy-mm-dd hh:mm');

  const widths = [110, 110, 160, 130, 360, 110, 150];
  widths.forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, sheet.getMaxRows(), FEEDBACK_BATCH_HEADERS_.length)
      .createFilter();
  }

  return {
    success: true,
    sheet: FEEDBACK_BATCH_SHEET_,
  };
}

/**
 * Generates or reuses one opaque feedback token per visitor number.
 * Staff only fill columns A:B. Columns C:G are refreshed in one batch.
 */
function generateFeedbackLinksBatch() {
  setupFeedbackSheet();
  setupFeedbackBatchSheet();

  const spreadsheet = feedbackSpreadsheet_();
  const sheet = feedbackRequireSheet_(spreadsheet, FEEDBACK_BATCH_SHEET_);
  const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
  const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getActive().toast(
      '請先在「回饋發送」A 欄貼上訪客編號，B 欄填發送日期。',
      'Wedding Chapter',
      6
    );
    return { success: true, generated: 0, reused: 0, errors: 0 };
  }

  const inputRows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const submissionMap = feedbackSubmissionMap_(submissions);
    const feedbackMap = feedbackInviteMap_(feedback);
    const newFeedbackRows = [];
    const outputs = [];
    let generated = 0;
    let reused = 0;
    let errors = 0;

    inputRows.forEach(function (row) {
      const rawSerial = feedbackClean_(row[0]);
      const serial = rawSerial.toUpperCase();
      const date = feedbackNormalizeBatchDate_(row[1]);

      if (!rawSerial && !row[1]) {
        outputs.push(['', '', '', '', '']);
        return;
      }

      if (!/^\d{3}[A-Z]{2,4}\d{4,}$/.test(serial)) {
        errors += 1;
        outputs.push(['', '訪客編號格式錯誤', '', '', '']);
        return;
      }

      if (!date) {
        errors += 1;
        outputs.push(['', '發送日期格式錯誤', '', '', '']);
        return;
      }

      const submission = submissionMap[serial];
      if (!submission) {
        errors += 1;
        outputs.push(['', '找不到新人資料', '', '', '']);
        return;
      }

      let invite = feedbackMap[serial];

      if (!invite) {
        const token = feedbackGenerateToken_();
        invite = {
          serialNumber: serial,
          eventDate: date,
          submittedAt: '',
          token: token,
          status: 'PENDING',
        };
        feedbackMap[serial] = invite;
        newFeedbackRows.push([
          serial,
          feedbackDateFromYmd_(date),
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
        generated += 1;
      } else {
        reused += 1;
      }

      outputs.push(feedbackBatchOutputRow_(submission, invite, generated > 0 ? '' : ''));
    });

    if (newFeedbackRows.length) {
      feedback
        .getRange(feedback.getLastRow() + 1, 1, newFeedbackRows.length, FEEDBACK_MODULE_HEADERS_.length)
        .setValues(newFeedbackRows);
    }

    // Rebuild outputs once more so each row gets an accurate generated/reused label.
    let newSerials = Object.create(null);
    newFeedbackRows.forEach(function (row) {
      newSerials[feedbackClean_(row[0])] = true;
    });

    const finalOutputs = inputRows.map(function (row, index) {
      const rawSerial = feedbackClean_(row[0]);
      const serial = rawSerial.toUpperCase();
      const date = feedbackNormalizeBatchDate_(row[1]);

      if (!rawSerial && !row[1]) return ['', '', '', '', ''];
      if (!/^\d{3}[A-Z]{2,4}\d{4,}$/.test(serial)) return ['', '訪客編號格式錯誤', '', '', ''];
      if (!date) return ['', '發送日期格式錯誤', '', '', ''];

      const submission = submissionMap[serial];
      if (!submission) return ['', '找不到新人資料', '', '', ''];

      const invite = feedbackMap[serial];
      const output = feedbackBatchOutputRow_(submission, invite);
      output[1] = newSerials[serial] ? '已產生' : '沿用既有連結';
      return output;
    });

    sheet.getRange(2, 3, finalOutputs.length, 5).setValues(finalOutputs);
    sheet.getRange(2, 7, finalOutputs.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    SpreadsheetApp.flush();

    SpreadsheetApp.getActive().toast(
      '完成：新產生 ' + generated + ' 筆、沿用 ' + reused + ' 筆、錯誤 ' + errors + ' 筆。',
      'Wedding Chapter',
      8
    );

    return {
      success: true,
      generated: generated,
      reused: reused,
      errors: errors,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Refreshes names, links and completion status without creating new invites.
 */
function syncFeedbackBatchStatus() {
  setupFeedbackSheet();
  setupFeedbackBatchSheet();

  const spreadsheet = feedbackSpreadsheet_();
  const sheet = feedbackRequireSheet_(spreadsheet, FEEDBACK_BATCH_SHEET_);
  const submissions = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SUBMISSIONS_SHEET_);
  const feedback = feedbackRequireSheet_(spreadsheet, FEEDBACK_MODULE_SHEET_);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getActive().toast('目前沒有可同步的名單。', 'Wedding Chapter', 5);
    return { success: true, rows: 0 };
  }

  const serialRows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const submissionMap = feedbackSubmissionMap_(submissions);
  const feedbackMap = feedbackInviteMap_(feedback);

  const outputs = serialRows.map(function (row) {
    const rawSerial = feedbackClean_(row[0]);
    const serial = rawSerial.toUpperCase();

    if (!rawSerial) return ['', '', '', '', ''];
    if (!/^\d{3}[A-Z]{2,4}\d{4,}$/.test(serial)) {
      return ['', '訪客編號格式錯誤', '', '', ''];
    }

    const submission = submissionMap[serial];
    if (!submission) return ['', '找不到新人資料', '', '', ''];

    const invite = feedbackMap[serial];
    if (!invite) {
      return [
        feedbackCoupleName_(submission),
        '尚未產生',
        '',
        '尚未產生',
        '',
      ];
    }

    const output = feedbackBatchOutputRow_(submission, invite);
    output[1] = '已產生';
    return output;
  });

  sheet.getRange(2, 3, outputs.length, 5).setValues(outputs);
  sheet.getRange(2, 7, outputs.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast(
    '已同步 ' + outputs.length + ' 列回填狀態。',
    'Wedding Chapter',
    6
  );

  return { success: true, rows: outputs.length };
}

function feedbackSubmissionMap_(sheet) {
  const map = Object.create(null);
  if (sheet.getLastRow() < 2) return map;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();

  values.forEach(function (row) {
    const serial = feedbackClean_(row[0]).toUpperCase();
    if (!serial || map[serial]) return;

    map[serial] = {
      serialNumber: serial,
      partner1Name: feedbackClean_(row[3]),
      partner2Name: feedbackClean_(row[5]),
      salesName: feedbackClean_(row[14]),
    };
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

function feedbackBatchOutputRow_(submission, invite) {
  const status = invite && invite.status === 'COMPLETED' ? '已完成' : '尚未填寫';
  const url = invite && invite.token
    ? feedbackPublicFormUrl_() + '?t=' + encodeURIComponent(invite.token)
    : '';

  return [
    feedbackCoupleName_(submission),
    '已產生',
    url,
    status,
    invite && invite.submittedAt ? invite.submittedAt : '',
  ];
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

  // If the old default was saved as a property, transparently upgrade it.
  const url = !configured || configured === FEEDBACK_PUBLIC_FORM_URL_LEGACY_
    ? FEEDBACK_PUBLIC_FORM_URL_DEFAULT_
    : configured;

  return url.replace(/\/+$/, '');
}

function feedbackNormalizeBatchDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' &&
      !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  }

  const text = feedbackClean_(value).replace(/\//g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd');
}

function feedbackDateFromYmd_(value) {
  const parts = value.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
