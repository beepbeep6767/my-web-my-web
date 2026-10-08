import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolEmail } from '../src/schoolEmail.js';
import { refreshQueue } from '../src/refreshQueue.js';
test('accept school mailbox boundaries and preserve leading zeroes', () => {
  for (const email of ['0@mh.ac.th','00000@mh.ac.th','00001@mh.ac.th','29999@mh.ac.th','30000@mh.ac.th']) assert.equal(schoolEmail(email), email);
  assert.equal(schoolEmail(' 01234@MH.AC.TH '), '01234@mh.ac.th');
});
test('reject outsiders, overflow, aliases and malformed mailbox input', () => {
  for (const email of ['30001@mh.ac.th','99999@mh.ac.th','000001@mh.ac.th','-1@mh.ac.th','1.5@mh.ac.th','1e3@mh.ac.th','1+test@mh.ac.th','12345@gmail.com','12345@mh.ac.th.evil.com','user@mh.ac.th','๑@mh.ac.th','1 @mh.ac.th','1@mh.ac.th\n2@mh.ac.th','', null, 123]) assert.equal(schoolEmail(email), null, String(email));
});
test('collapse simultaneous events and keep one follow-up after in-flight work', async () => {
  let calls = 0, finish;
  const schedule = refreshQueue(async () => { calls++; if (calls === 1) await new Promise(resolve => { finish = resolve; }); }, 5);
  for (let n = 0; n < 100; n++) schedule();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(calls, 1);
  for (let n = 0; n < 100; n++) schedule();
  await new Promise(resolve => setTimeout(resolve, 20));
  finish();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(calls, 2);
  schedule.stop();
});
test('disposing refresh queue prevents scheduled work', async () => {
  let calls = 0; const schedule = refreshQueue(async () => { calls++; }, 5);
  schedule(); schedule.stop(); schedule();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 0);
});
