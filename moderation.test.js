import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { inspectText } from '../src/moderation/filter.js';
import { assertAllowed, stopModeration } from '../src/moderation/client.js';
after(stopModeration);
test('Allows ordinary school questions and avoids common substring false positives', () => {
  for (const text of ['Can someone explain this physics problem?', 'The class has an assignment.', 'ช่วยอธิบายการบ้านข้อนี้หน่อยครับ', 'หีบใส่หนังสือ', 'I am studying biology.']) assert.equal(inspectText(text).allowed, true, text);
});
test('Blocks English, Thai, case changes, separated letters, leetspeak, and invisible characters', () => {
  for (const text of ['FUCK', 'f.u.c.k', 'f u c k', 'f\u200buck', 'sh1t', 'b1tch', 'pornography', 'ควย', 'ค ว ย', 'เย็ด', 'หนังโป๊', 'หี']) assert.equal(inspectText(text).allowed, false, text);
});
test('Worker rejects blocked content and stays usable for subsequent allowed requests', async () => {
  await assert.rejects(assertAllowed('shit'), error => error.status === 422 && error.code === 'CONTENT_BLOCKED');
  await Promise.all(Array.from({ length: 20 }, () => assertAllowed('Let’s share our notes.')));
});
