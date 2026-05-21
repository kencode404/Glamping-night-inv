// Serverless function: GET /api/export
// Returns the full RSVP list as a CSV download (name, phone,
// food allergy, RSVP timestamp). Public — anyone with the link
// can download.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // ISO-ish but human-readable: "2026-05-21 14:32"
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('rsvps')
      .select('name, phone, food_allergy, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = data || [];
    const header = ['Name', 'Phone', 'Food Allergy', 'RSVP Time'].join(',');
    const lines = rows.map((r) =>
      [r.name, r.phone, r.food_allergy, formatTime(r.created_at)].map(csvEscape).join(',')
    );
    // BOM so Excel opens UTF-8 cleanly
    const csv = '﻿' + [header, ...lines].join('\r\n');

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rooftop-party-rsvps-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('GET /api/export failed', err);
    return res.status(500).json({ error: 'Could not export' });
  }
}
