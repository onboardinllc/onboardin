/**
 * Google Drive processor disclosures (#06) and compliance #10 checklist copy.
 */

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_DRIVE_CONNECT_DISCLOSURE =
  'Connecting Google Drive lets Onboardin create an Onboardin folder on your Drive and read or update only the files you upload through Onboardin inside that folder. We cannot see the rest of your Drive.';

export const GOOGLE_GMAIL_OPTIN_WARNING =
  'Personal Gmail accounts lack Workspace admin controls. Use only if you accept that risk.';

export const GOOGLE_LIMITED_USE_SUMMARY =
  'Onboardin use of Google user data is limited to providing the document vault export feature: create the Onboardin folder tree, upload files you choose, and open files the app created. We do not use Google user data for advertising, sell it, or transfer it except as required to operate the feature or comply with law.';

export const GOOGLE_PROCESSOR_OPS_CHECKLIST = [
  'Create or select Google Cloud project; enable Google Drive API',
  'Configure OAuth consent screen with drive.file scope only',
  'Accept Google API Services User Data Policy (Limited Use)',
  'Accept Google Cloud Platform Terms of Service',
  'Add onboardin.llc privacy policy URL on consent screen after counsel publish',
  'Create OAuth 2.0 Web client; register edge callback redirect URI',
  'Set Supabase secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI',
];
