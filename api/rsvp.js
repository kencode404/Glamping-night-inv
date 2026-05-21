// Serverless function backing the shared RSVP list.
//   GET  /api/rsvp -> { guests: [{ name }] } (newest first)
//   POST /api/rsvp { name, phone } -> { guests: [...] }
//
// Storage: Supabase Postgres. The serverless function uses the
// service_role key (kept in Vercel env vars, never sent to the browser),
// which bypasses RLS — so we only need a plain `rsvps` table; no
// policies required.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function listGuests() {
  const { data, error } = await supabase
    .from('rsvps')
    .select('name, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({ name: r.name, created_at: r.created_at }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const guests = await listGuests();
      return res.status(200).json({ guests });
    } catch (err) {
      console.error('GET /api/rsvp failed', err);
      return res.status(500).json({ error: 'Could not load guest list' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const name    = String(body.name    || '').trim().slice(0, 80);
      const phone   = String(body.phone   || '').trim().slice(0, 40);
      const allergy = String(body.allergy || '').trim().slice(0, 300);
      if (!name || !phone) {
        return res.status(400).json({ error: 'Name and phone are required' });
      }

      const { error: insertErr } = await supabase
        .from('rsvps')
        .insert({ name, phone, food_allergy: allergy });
      if (insertErr) throw insertErr;

      const guests = await listGuests();
      return res.status(201).json({ guests });
    } catch (err) {
      console.error('POST /api/rsvp failed', err);
      return res.status(500).json({ error: 'Could not save your RSVP' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
