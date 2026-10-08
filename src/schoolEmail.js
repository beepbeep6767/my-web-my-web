// Preserve leading zeroes: they can be meaningful parts of a school mailbox.
export function schoolEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  const match = /^([0-9]{1,5})@mh\.ac\.th$/.exec(email);
  return match && Number(match[1]) <= 30000 ? email : null;
}

export const schoolEmailHint = 'กรอกอีเมลโรงเรียน เช่น 12345@mh.ac.th โดยเลขหน้า @ ต้องอยู่ระหว่าง 0–30000 (ไม่เกิน 5 หลัก)';
