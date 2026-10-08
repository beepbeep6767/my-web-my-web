import { client, result } from './supabase.js';
import { uploadFile } from './api.js';
import { refreshQueue } from './refreshQueue.js';

export const IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
export function validateHonorImage(file) {
  if (!file || !IMAGE_TYPES.includes(file.type)) throw new Error('เลือกรูป JPG, PNG, WEBP หรือ GIF');
  if (file.size > 12 * 1024 * 1024) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 12 MB');
}
export async function submitHonor(draft) {
  if (!draft.caption || draft.caption.trim().length < 3 || draft.caption.trim().length > 2000) throw new Error('อธิบายการช่วยเหลือเพื่อน 3–2000 ตัวอักษร');
  if (!draft.imagePath) {
    validateHonorImage(draft.file);
    draft.imagePath = (await uploadFile(draft.file)).id;
  }
  // Retain image path and request ID after errors so retrying cannot award twice.
  return result(client().rpc('mnchat_honor_submit', { request_id: draft.id, description: draft.caption, picture_path: draft.imagePath }));
}
export async function honorPage({ admin = false, after = null } = {}) {
  let q = client().from('honor_submissions').select('*,author:profiles!author_id(username)').order('id').limit(20);
  if (admin) q = q.is('approved_at', null);
  else {
    const { data, error } = await client().auth.getSession();
    if (error || !data.session?.user?.id) throw new Error('กรุณาเข้าสู่ระบบใหม่');
    q = q.eq('author_id', data.session.user.id);
  }
  if (after) q = q.gt('id', after);
  return result(q);
}
export function watchHonors(table, onChanged) {
  const refresh = refreshQueue(() => document.visibilityState === 'visible' ? onChanged() : undefined);
  const db = client(), channel = db.channel(`honors:${table}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, refresh).subscribe();
  const timer = setInterval(refresh, 15000);
  window.addEventListener('focus', refresh);
  return () => { refresh.stop(); clearInterval(timer); window.removeEventListener('focus', refresh); db.removeChannel(channel); };
}
