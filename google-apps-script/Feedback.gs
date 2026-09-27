/**
 * Wedding Chapter — Activity Feedback module
 *
 * Lives beside the existing newcomer Code.gs.
 * Keeps feedback storage isolated from the original submission flow.
 */

const FEEDBACK_MODULE_SHEET_ = 'Feedback';
const FEEDBACK_MODULE_SUBMISSIONS_SHEET_ = '新人資料';
const FEEDBACK_MODULE_HEADERS_ = Object.freeze([
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

const FEEDBACK_MODULE_ALLOWED_Q1_Q3_ = Object.freeze(['非常同意', '同意', '普通', '不同意']);
const FEEDBACK_MODULE_ALLOWED_Q2_ = Object.freeze(['非常清楚', '清楚', '略有疑問', '不清楚']);
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
  if (!sheet) sheet = spreadsheet.insertSheet(FEEDBACK_MODULE_SHEET_);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, FEEDBACK_MODULE_HEADERS_.length)
      .setValues([FEEDBACK_MODULE_HEADERS_]);
  } else {
    const current = sheet.getRange(1, 1, 1, FEEDBACK_MODULE_HEADERS_.length).getValues()[0];
    if (!feedbackHeadersMatch_(current)) {
      throw new Error('FEEDBACK_HEADER_MISMATCH');
    }
  }

  sheet.setFrozenRows(1);
  return { success: true, sheet: FEEDBACK_MODULE_SHEET_ };
}

function createFeedbackInvite(serialNumber, eventDate) {
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

    if (!feedbackFindSubmission_(submissions, serial)) {
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

    const token = Utilities.getUuid().replace(/-/g, '') +
      Utilities.getUuid().replace(/-/g, '');

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

function getFeedbackContext_(payload) {
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
    if (!feedbackFindSubmission_(submissions, invite.serialNumber)) {
      throw new Error('SERIAL_NOT_FOUND');
    }

    const submittedAt = new Date();

    feedback.getRange(invite.rowNumber, 3, 1, 10).setValues([[
      submittedAt,
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
    q1: feedbackClean_(payload.q1),
    q2: feedbackClean_(payload.q2),
    q3: feedbackClean_(payload.q3),
    q4: feedbackNormalizeMulti_(payload.q4),
    q4Other: feedbackClean_(payload.q4Other),
    q5: feedbackNormalizeMulti_(payload.q5),
    q5Other: feedbackClean_(payload.q5Other),
    q6: feedbackClean_(payload.q6),
    q7: feedbackClean_(payload.q7),
  };

  if (FEEDBACK_MODULE_ALLOWED_Q1_Q3_.indexOf(data.q1) === -1) {
    throw new Error('INVALID_FEEDBACK_Q1');
  }
  if (FEEDBACK_MODULE_ALLOWED_Q2_.indexOf(data.q2) === -1) {
    throw new Error('INVALID_FEEDBACK_Q2');
  }
  if (FEEDBACK_MODULE_ALLOWED_Q1_Q3_.indexOf(data.q3) === -1) {
    throw new Error('INVALID_FEEDBACK_Q3');
  }

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
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    throw new Error('INVALID_FEEDBACK_TOKEN');
  }
  return token;
}

function feedbackFindByToken_(sheet, token) {
  if (sheet.getLastRow() < 2) return null;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, FEEDBACK_MODULE_HEADERS_.length)
    .getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][10]) === token) {
      return {
        rowNumber: i + 2,
        serialNumber: feedbackClean_(values[i][0]),
        eventDate: values[i][1],
        submittedAt: values[i][2],
        token: token,
        status: feedbackClean_(values[i][11]) || 'PENDING',
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
        token: feedbackClean_(values[i][10]),
        status: feedbackClean_(values[i][11]) || 'PENDING',
      };
    }
  }

  return null;
}

function feedbackFindSubmission_(sheet, serialNumber) {
  if (sheet.getLastRow() < 2) return null;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();

  for (let i = 0; i < values.length; i += 1) {
    if (feedbackClean_(values[i][0]) === serialNumber) {
      return {
        serialNumber: serialNumber,
        partner1Name: feedbackClean_(values[i][3]),
        partner2Name: feedbackClean_(values[i][5]),
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
