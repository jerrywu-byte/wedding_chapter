/**
 * Wedding Chapter — Follow-up activity feedback reader
 *
 * Read-only helper module for the authenticated Follow-up Web App.
 * It reads the Feedback sheet and exposes only the fields required by the case UI.
 */

const FOLLOWUP_FEEDBACK_SHEET_NAME_ = 'Feedback';
const FOLLOWUP_FEEDBACK_HEADERS_ = Object.freeze([
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
  const response = Sheets.Spreadsheets.Values.batchGet(requireSpreadsheetId_(), {
    ranges: [
      quoteNamedSheetRange_(FOLLOWUP_FEEDBACK_SHEET_NAME_, '1:1'),
      quoteNamedSheetRange_(FOLLOWUP_FEEDBACK_SHEET_NAME_, 'A2:L'),
    ],
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const ranges = response.valueRanges || [];
  const header = firstRow_(ranges[0]);

  // A newly created blank Feedback sheet should not break existing Follow-up cases.
  if (!header.length) return [];

  if (
    header.length !== FOLLOWUP_FEEDBACK_HEADERS_.length ||
    !FOLLOWUP_FEEDBACK_HEADERS_.every(function (name, index) {
      return cleanText_(header[index]) === name;
    })
  ) {
    throw new Error('DATA_INTEGRITY_ERROR');
  }

  return valuesFrom_(ranges[1]).map(function (row) {
    return padRow_(row, FOLLOWUP_FEEDBACK_HEADERS_.length);
  });
}

function feedbackForSerial_(rows, serialNumber) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (normalizeSerialNumber_(row[0]) !== serialNumber) continue;

    const status = cleanText_(row[11]) || 'PENDING';

    return {
      eventDate: cleanText_(row[1]),
      submittedAt: cleanText_(row[2]),
      status: status,
      q1: cleanText_(row[3]),
      q2: cleanText_(row[4]),
      q3: cleanText_(row[5]),
      q4: splitFeedbackMulti_(row[6]),
      q5: splitFeedbackMulti_(row[7]),
      q6: cleanText_(row[8]),
      q7: cleanText_(row[9]),
    };
  }

  return null;
}

function splitFeedbackMulti_(value) {
  const text = cleanText_(value);
  return text ? text.split('｜').map(cleanText_).filter(Boolean) : [];
}
