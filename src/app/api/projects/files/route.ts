import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ files: [] });
  const { data } = await supabase.from("project_files").select("*")
    .eq("project_id", projectId).order("created_at", { ascending: false });
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const projectId = formData.get("projectId") as string;
  if (!file || !projectId) return NextResponse.json({ error: "file and projectId required" }, { status: 400 });

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

  // Sanitize filename to prevent path traversal
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${projectId}/${Date.now()}_${safeFilename}`;
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Extract text
  let extractedText = "";
  let summary = "";

  try {
    if (file.type === "text/plain" || file.type === "text/markdown" || file.type === "text/csv") {
      extractedText = await file.text();
      extractedText = extractedText.slice(0, 8000);
    } else if (file.type === "application/pdf" || file.type.includes("word")) {
      const bytes = Buffer.from(arrayBuffer).toString("base64");
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      if (file.type === "application/pdf") {
        const res = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [{
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: bytes },
            } as any, {
              type: "text",
              text: "Extract and summarize the key information from this document in 3-5 sentences. Then provide the first 500 words of content.",
            }],
          }],
        });
        extractedText = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").slice(0, 4000);
      }
    } else if (file.type.startsWith("image/")) {
      const bytes = Buffer.from(arrayBuffer).toString("base64");
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: file.type as any, data: bytes },
          }, { type: "text", text: "Describe this image concisely for project context." }],
        }],
      });
      extractedText = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    }

    // Generate summary from extracted text
    if (extractedText.length > 100) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{ role: "user", content: `Summarize in 1-2 sentences for project context:\n\n${extractedText.slice(0, 2000)}` }],
      });
      summary = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    }
  } catch { /* extraction failed, store without text */ }

  const { data, error } = await supabase.from("project_files").insert({
    project_id: projectId,
    user_id: user.id,
    filename: file.name,
    storage_path: path,
    file_type: file.type,
    file_size: file.size,
    extracted_text: extractedText || null,
    summary: summary || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ file: data });
}
