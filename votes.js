import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = [
    "https://aljazeera-sd.blogspot.com",
    "https://www.aljazeera-sd.blogspot.com",
  ];

  const origin = req.headers.origin;

  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGINS.includes(origin) ? origin : "null"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ message: "Access denied: Unauthorized origin" });
  }

  const SUPABASE_URL = "https://alkhlsicauxxiuunzuse.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa2hsc2ljYXV4eGl1dW56dXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMzA0NjgsImV4cCI6MjA3NzcwNjQ2OH0.gHMcYLJWwpvoLkGlHDDTMosMK6wVwufKWWh3R9JiaHk";
  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // GET: قراءة جميع البيانات
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .order('time', { ascending: false });

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
      
      return res.status(200).json({ votes: data });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ message: "Error fetching data", error: error.message });
    }
  }

  // POST: إضافة بيانات جديدة بعد التحقق من reCAPTCHA
  if (req.method === "POST") {
    try {
      const { name, deviceId, token } = req.body;

      if (!name || !token || !deviceId) {
        return res.status(400).json({ message: "البيانات غير مكتملة" });
      }

      // تحقق reCAPTCHA مع Google
      const captchaRes = await fetch(
        `https://www.google.com/recaptcha/api/siteverify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${RECAPTCHA_SECRET}&response=${token}`,
        }
      );
      
      const captchaData = await captchaRes.json();

      if (!captchaData.success) {
        console.error("reCAPTCHA verification failed:", captchaData);
        return res.status(403).json({ message: "فشل التحقق من reCAPTCHA" });
      }

      // التحقق من الحد الأقصى للتسجيلات لهذا الجهاز
      const MAX_VOTES_PER_DEVICE = 10;
      
      const { data: deviceVotes, error: countError } = await supabase
        .from('votes')
        .select('*')
        .eq('device_id', deviceId);

      if (countError) {
        throw new Error(`Supabase count error: ${countError.message}`);
      }

      if (deviceVotes.length >= MAX_VOTES_PER_DEVICE) {
        return res.status(403).json({ message: "لقد بلغت الحد الأقصى لمرات التسجيل" });
      }

      // إضافة البيانات الجديدة إلى Supabase
      const { data: newVote, error: insertError } = await supabase
        .from('votes')
        .insert([
          { 
            name: name, 
            device_id: deviceId,
            time: new Date().toISOString()
          }
        ])
        .select();

      if (insertError) {
        throw new Error(`Supabase insert error: ${insertError.message}`);
      }

      return res.status(200).json({ 
        message: "تمت الإضافة بنجاح", 
        vote: newVote[0] 
      });

    } catch (error) {
      console.error("Error updating data:", error);
      return res.status(500).json({ message: "Error updating data", error: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}