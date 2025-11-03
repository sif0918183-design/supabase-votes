import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = [
  "https://aljazeera-sd.blogspot.com",
  "https://www.aljazeera-sd.blogspot.com",
];

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPA_URL, SUPA_KEY);

export default async function handler(req, res) {
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

  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

  // GET: قراءة جميع التصويتات
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("votes")
      .select("*")
      .order("time", { ascending: true });

    if (error) return res.status(500).json({ message: "Error fetching data", error });
    return res.status(200).json({ votes: data });
  }

  // POST: إضافة تصويت جديد
  if (req.method === "POST") {
    try {
      const { name, deviceId, token } = req.body;

      if (!name || !deviceId || !token) {
        return res.status(400).json({ message: "البيانات غير مكتملة" });
      }

      // تحقق reCAPTCHA
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
        return res.status(403).json({ message: "فشل التحقق من reCAPTCHA" });
      }

      // التحقق من عدد التصويتات لهذا الجهاز
      const { data: existingVotes, error: fetchError } = await supabase
        .from("votes")
        .select("id")
        .eq("device_id", deviceId);

      if (fetchError) return res.status(500).json({ message: "Error checking votes", fetchError });

      const MAX_VOTES_PER_DEVICE = 10;
      if (existingVotes.length >= MAX_VOTES_PER_DEVICE) {
        return res.status(403).json({ message: "لقد بلغت الحد الأقصى لمرات التسجيل" });
      }

      // إضافة التصويت الجديد
      const { data, error } = await supabase
        .from("votes")
        .insert([{ name, device_id: deviceId, time: new Date().toISOString() }])
        .select();

      if (error) return res.status(500).json({ message: "Error adding vote", error });

      return res.status(200).json({ message: "تمت الإضافة بنجاح", vote: data[0] });

    } catch (err) {
      console.error("POST error:", err);
      return res.status(500).json({ message: "Internal server error", err });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}