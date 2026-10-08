import { schoolEmail, schoolEmailHint } from './schoolEmail.js';

export async function verifySchoolCode(db, email, code) {
  const address = schoolEmail(email);
  if (!address) throw new Error(schoolEmailHint);
  if (!/^[0-9]{6}$/.test(code)) throw new Error('กรอกรหัสตัวเลข 6 หลักจากอีเมล');
  const { error } = await db.auth.verifyOtp({ email: address, token: code, type: 'email_change' });
  if (error) throw error;
  // Auth success alone does not unlock the UI: RLS status remains authoritative.
}
