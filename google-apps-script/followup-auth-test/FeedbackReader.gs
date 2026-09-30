/**
 * Wedding Chapter — Follow-up activity feedback reader
 *
 * Read-only helper module for the authenticated Follow-up Web App.
 * It reads the Feedback sheet and exposes only the fields required by the case UI.
 */

const FOLLOWUP_FEEDBACK_SHEET_NAME_ = '回饋總表';
const FOLLOWUP_FEEDBACK_LEGACY_SHEET_NAME_ = 'Feedback';
const FOLLOWUP_FEEDBACK_HEADERS_ = Object.freeze([
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
const FOLLOWUP_FEEDBACK_LEGACY_HEADERS_ = Object.freeze([
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

function readFeedbackRows_() {
  const sheetName = resolveFeedbackSheetName_();
  if (!sheetName) return [];

  const response = Sheets.Spreadsheets.Values.batchGet(requireSpreadsheetId_(), {
    ranges: [
      quoteNamedSheetRange_(sheetName, '1:1'),
      quoteNamedSheetRange_(sheetName, 'A2:M'),
    ],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const ranges = response.valueRanges || [];
  const header = firstRow_(ranges[0]);

  if (!header.length) return [];

  const isV2 =
    header.length === FOLLOWUP_FEEDBACK_HEADERS_.length &&
    FOLLOWUP_FEEDBACK_HEADERS_.every(function (name, index) {
      return cleanText_(header[index]) === name;
    });

  const isLegacy =
    header.length === FOLLOWUP_FEEDBACK_LEGACY_HEADERS_.length &&
    FOLLOWUP_FEEDBACK_LEGACY_HEADERS_.every(function (name, index) {
      return cleanText_(header[index]) === name;
    });

  if (!isV2 && !isLegacy) {
    throw new Error('DATA_INTEGRITY_ERROR');
  }

  return valuesFrom_(ranges[1]).map(function (row) {
    if (isV2) {
      return padRow_(row, FOLLOWUP_FEEDBACK_HEADERS_.length);
    }

    const legacy = padRow_(row, FOLLOWUP_FEEDBACK_LEGACY_HEADERS_.length);
    return legacy.slice(0, 3).concat([''], legacy.slice(3));
  });
}

function resolveFeedbackSheetName_() {
  const spreadsheet = Sheets.Spreadsheets.get(requireSpreadsheetId_(), {
    fields: 'sheets.properties.title',
  });
  const names = (spreadsheet.sheets || []).map(function (sheet) {
    return cleanText_(sheet && sheet.properties && sheet.properties.title);
  });

  if (names.indexOf(FOLLOWUP_FEEDBACK_SHEET_NAME_) !== -1) {
    return FOLLOWUP_FEEDBACK_SHEET_NAME_;
  }
  if (names.indexOf(FOLLOWUP_FEEDBACK_LEGACY_SHEET_NAME_) !== -1) {
    return FOLLOWUP_FEEDBACK_LEGACY_SHEET_NAME_;
  }
  return '';
}

function feedbackForSerial_(rows, serialNumber) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (normalizeSerialNumber_(row[0]) !== serialNumber) continue;

    const status = cleanText_(row[12]) || 'PENDING';

    return {
      eventDate: cleanText_(row[1]),
      submittedAt: cleanText_(row[2]),
      status: status,
      salesName: cleanText_(row[3]),
      q1: cleanText_(row[4]),
      q2: cleanText_(row[5]),
      q3: cleanText_(row[6]),
      q4: splitFeedbackMulti_(row[7]),
      q5: splitFeedbackMulti_(row[8]),
      q6: cleanText_(row[9]),
      q7: cleanText_(row[10]),
    };
  }

  return null;
}

function splitFeedbackMulti_(value) {
  const text = cleanText_(value);
  return text ? text.split('｜').map(cleanText_).filter(Boolean) : [];
}
