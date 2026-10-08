import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySchoolCode } from '../src/emailVerification.js';

test('verify school ownership through Supabase email_change without dropping leading zeroes', async () => {
  let received;
  const db = { auth: { verifyOtp: async input => { received = input; return { error: null }; } } };
  await verifySchoolCode(db, ' 01234@MH.AC.TH ', '001234');
  assert.deepEqual(received, { email: '01234@mh.ac.th', token: '001234', type: 'email_change' });
});
test('reject invalid codes and outside school addresses before network request', async () => {
  const db = { auth: { verifyOtp: () => { assert.fail('must not send invalid requests'); } } };
  for (const code of ['', '12345', '1234567', 'abcdef', '１２３４５６', '123 45']) await assert.rejects(verifySchoolCode(db, '12345@mh.ac.th', code));
  for (const email of ['30001@mh.ac.th', 'test@gmail.com']) await assert.rejects(verifySchoolCode(db, email, '123456'));
});
test('expired code and rate limit errors remain failures', async () => {
  for (const status of [403, 429]) {
    const failure = Object.assign(new Error('Auth rejected'), { status });
    const db = { auth: { verifyOtp: async () => ({ error: failure }) } };
    await assert.rejects(verifySchoolCode(db, '12345@mh.ac.th', '123456'), error => error === failure);
  }
});
