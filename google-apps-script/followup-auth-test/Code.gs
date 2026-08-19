/**
 * Wedding Chapter — Follow-up Authentication Test (Phase 1B-1)
 *
 * Required Script Properties:
 *   FOLLOWUP_ALLOWED_DOMAIN = example.com
 *   FOLLOWUP_ALLOWED_EMAILS = user1@example.com,user2@example.com
 *
 * This project intentionally does not read or write Google Sheets.
 */

const AUTH_PROPERTY_KEYS_ = Object.freeze({
  allowedDomain: 'FOLLOWUP_ALLOWED_DOMAIN',
  allowedEmails: 'FOLLOWUP_ALLOWED_EMAILS',
});

function doGet() {
  try {
    const authorization = requireAuthorizedUser_();
    const template = HtmlService.createTemplateFromFile('Index');

    template.email = authorization.email;
    template.domainValid = authorization.domainValid;
    template.emailAllowlisted = authorization.emailAllowlisted;

    return template
      .evaluate()
      .setTitle('Authentication Test');
  } catch (error) {
    console.warn(
      'Follow-up authentication denied: ' +
        (error && error.message ? error.message : 'UNKNOWN_AUTH_ERROR')
    );
    return HtmlService.createHtmlOutputFromFile('Unauthorized')
      .setTitle('Authentication Test');
  }
}

/**
 * Rejects the request unless the active Google account belongs to the
 * configured Workspace domain and is included in the server-side allowlist.
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
  if (!email) {
    throw new Error('AUTH_EMAIL_UNAVAILABLE');
  }

  const emailDomain = email.split('@')[1] || '';
  if (emailDomain !== allowedDomain) {
    throw new Error('AUTH_DOMAIN_DENIED');
  }

  if (allowedEmails.indexOf(email) === -1) {
    throw new Error('AUTH_EMAIL_DENIED');
  }

  return {
    email: email,
    domainValid: true,
    emailAllowlisted: true,
  };
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDomain_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

function parseAllowedEmails_(value) {
  const uniqueEmails = {};

  String(value || '')
    .split(/[\s,;]+/)
    .map(normalizeEmail_)
    .filter(Boolean)
    .forEach(function (email) {
      uniqueEmails[email] = true;
    });

  return Object.keys(uniqueEmails);
}
