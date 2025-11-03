import { createClient } from "@supabase/supabase-js";

// استخدم القيم مباشرة بدلاً من متغيرات البيئة
const SUPA_URL = "https://alkhlsicauxxiuunzuse.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa2hsc2ljYXV4eGl1dW56dXNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjEzMDQ2OCwiZXhwIjoyMDc3NzA2NDY4fQ.0T-pFa6V_kNkLAhocPJ1yQo4oX2GoudE9h0kU9TNQVE";

const supabase = createClient(SUPA_URL, SUPA_KEY);

const ALLOWED_ORIGINS = [
  "https://aljazeera-sd.blogspot.com",
  "https://www.aljazeera-sd.blogspot.com",
];

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

  // فقط RECAPTCHA_SECRET_KEY يحتاج متغير بيئة
  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

  // GET: قراءة التصويتات
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("votes")
        .select("*")
        .order("time", { ascending: false });

      if (error) {
        console.error("Supabase GET error:", error);
        return res.status(500).json({ message: "Error fetching data", error });
      }
      
      return res.status(200).json({ votes: data });
    } catch (error) {
      console.error("GET error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  // POST: إضافة تصويت
  if (req.method === "POST") {
    try {
      const { name, deviceId, token } = req.body;

      if (!name || !deviceId || !token) {
        return res.status(400).json({ message: "البيانات غير مكتملة" });
      }

      // تحقق reCAPTCHA
      const captchaRes = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
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

      // التحقق من عدد التصويتات لكل جهاز
      const { data: existingVotes, error: fetchError } = await supabase
        .from("votes")
        .select("id")
        .eq("device_id", deviceId);

      if (fetchError) {
        console.error("Count error:", fetchError);
        return res.status(500).json({ message: "Error checking votes" });
      }

      const MAX_VOTES_PER_DEVICE = 10;
      if (existingVotes.length >= MAX_VOTES_PER_DEVICE) {
        return res.status(403).json({ message: "لقد بلغت الحد الأقصى لمرات التسجيل" });
      }

      // إضافة التصويت
      const { data, error } = await supabase
        .from("votes")
        .insert([{ 
          name, 
          device_id: deviceId, 
          time: new Date().toISOString() 
        }])
        .select();

      if (error) {
        console.error("Insert error:", error);
        return res.status(500).json({ message: "Error adding vote" });
      }

      return res.status(200).json({ 
        message: "تمت الإضافة بنجاح", 
        vote: data[0] 
      });

    } catch (err) {
      console.error("POST error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}