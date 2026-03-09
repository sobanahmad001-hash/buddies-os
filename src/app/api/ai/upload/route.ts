import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop();
  const storagePath = `${user.id}/${Date.now()}-${file.name}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("uploads")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Extract text using OpenAI
  let extractedText = "";
  let summary = "";

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (file.type === "application/pdf" || file.type.includes("text") || file.type.includes("word")) {
      // For text-based files, read content directly
      const text = await file.text();
      extractedText = text.slice(0, 8000); // limit context

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content: `You are analyzing a document for an entrepreneur's personal OS.
Extract the key information and return a JSON object with:
{
  "summary": "2-3 sentence summary of the document",
  "updates": ["list of project updates or progress items"],
  "decisions": ["list of decisions that need to be made"],
  "actions": ["list of action items or next steps"],
  "blockers": ["list of blockers or risks"],
  "project": "project name this relates to if obvious, otherwise null"
}
Return ONLY valid JSON, no markdown.`
          },
          { role: "user", content: `Document: ${file.name}\n\n${extractedText}` }
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      summary = parsed.summary ?? "";

      // Save to DB
      await supabase.from("uploaded_files").insert({
        user_id: user.id,
        storage_path: storagePath,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        extracted_text: extractedText.slice(0, 2000),
        summary,
      });

      return NextResponse.json({
        filename: file.name,
        summary,
        extracted: parsed,
        storagePath,
      });
    } else if (file.type.startsWith("image/")) {
      // For images, use vision
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${file.type};base64,${base64}` }
              },
              {
                type: "text",
                text: `Analyze this image for an entrepreneur's OS. Return JSON:
{
  "summary": "what this image shows",
  "updates": ["any project progress visible"],
  "decisions": ["any decisions visible"],
  "actions": ["any action items"],
  "blockers": [],
  "project": null
}
Return ONLY valid JSON.`
              }
            ]
          }
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      summary = parsed.summary ?? "";

      await supabase.from("uploaded_files").insert({
        user_id: user.id,
        storage_path: storagePath,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        summary,
      });

      return NextResponse.json({
        filename: file.name,
        summary,
        extracted: parsed,
        storagePath,
      });
    }
  } catch (err: any) {
    console.error("Extraction error:", err);
  }

  return NextResponse.json({ filename: file.name, summary: "File uploaded.", extracted: {}, storagePath });
}
