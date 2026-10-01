import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export function client() {
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase URL และ publishable key ใน Vercel');
  return supabase;
}
export async function result(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
