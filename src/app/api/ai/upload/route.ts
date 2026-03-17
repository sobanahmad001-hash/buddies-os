import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import JSZip from "jszip";

// Extensions whose text content is worth extracting from a ZIP
const TEXT_EXTS = new Set([
  "ts","tsx","js","jsx","py","rb","go","java","cs","php","swift",
  "html","css","scss","md","mdx","txt","json","yaml","yml","toml",
  "xml","csv","env","sh","bash","sql","graphql","prisma","tf","rs",
]);

async function extractZip(buffer: ArrayBuffer, filename: string, openai: OpenAI) {
  const zip = await JSZip.loadAsync(buffer);

  // Build file tree + extract text from readable files
  const tree: string[] = [];
  const textChunks: string[] = [];
  let totalTextChars = 0;
  const MAX_TEXT_CHARS = 12000;

  const entries = Object.entries(zip.files).filter(([, f]) => !f.dir);

  // Sort: text files first so we prioritise code/docs
  entries.sort(([a], [b]) => {
    const extA = a.split(".").pop()?.toLowerCase() ?? "";
    const extB = b.split(".").pop()?.toLowerCase() ?? "";
    return (TEXT_EXTS.has(extA) ? 0 : 1) - (TEXT_EXTS.has(extB) ? 0 : 1);
  });

  for (const [path, file] of entries) {
    tree.push(path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (TEXT_EXTS.has(ext) && totalTextChars < MAX_TEXT_CHARS) {
      try {
        const content = await file.async("string");
        const chunk = content.slice(0, MAX_TEXT_CHARS - totalTextChars);
        textChunks.push(`=== ${path} ===\n${chunk}`);
        totalTextChars += chunk.length;
      } catch { /* binary or unreadable */ }
    }
  }

  const fileTree = tree.slice(0, 100).join("\n") + (tree.length > 100 ? `\n… and ${tree.length - 100} more files` : "");
  const codeSnippet = textChunks.join("\n\n").slice(0, MAX_TEXT_CHARS);

  const prompt = `You are analyzing a ZIP archive called "${filename}" for an entrepreneur's personal OS.

FILE TREE (${tree.length} files total):
${fileTree}

${codeSnippet ? `FILE CONTENTS (sampled):\n${codeSnippet}` : ""}

Return a JSON object:
{
  "summary": "2-3 sentence overview of what this ZIP contains and its purpose",
  "file_count": ${tree.length},
  "key_files": ["list of the most important files"],
  "updates": ["project progress items if any"],
  "decisions": ["decisions that need to be made"],
  "actions": ["recommended next steps"],
  "blockers": ["risks or blockers found"],
  "project": "project name if obvious, otherwise null"
}
Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as { summary: string; file_count: number; key_files: string[]; updates: string[]; decisions: string[]; actions: string[]; blockers: string[]; project: string | null; };
}

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

  let signedUrl: string | null = null;
  try {
    const { data: signed } = await supabase.storage
      .from("uploads")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    signedUrl = signed?.signedUrl ?? null;
  } catch {
    signedUrl = null;
  }

  // Extract text using OpenAI
  let extractedText = "";
  let summary = "";

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ── ZIP / archive handling ──────────────────────────────────────
    const isZip = file.type === "application/zip"
      || file.type === "application/x-zip-compressed"
      || file.type === "application/x-zip"
      || file.name.endsWith(".zip");

    if (isZip) {
      const parsed = await extractZip(arrayBuffer, file.name, openai);
      summary = parsed.summary ?? "ZIP file uploaded.";

      await supabase.from("uploaded_files").insert({
        user_id: user.id,
        storage_path: storagePath,
        filename: file.name,
        file_type: file.type || "application/zip",
        file_size: file.size,
        extracted_text: `File tree (${parsed.file_count} files). Key files: ${(parsed.key_files ?? []).join(", ")}`,
        summary,
      });

      return NextResponse.json({
        filename: file.name,
        summary,
        extracted: parsed,
        storagePath,
        url: signedUrl,
        isZip: true,
        fileCount: parsed.file_count,
        keyFiles: parsed.key_files ?? [],
      });
    }

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
        url: signedUrl,
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
        url: signedUrl,
      });
    }
  } catch (err: any) {
    console.error("Extraction error:", err);
  }

  return NextResponse.json({
    filename: file.name,
    summary: "File uploaded.",
    extracted: {},
    storagePath,
    url: signedUrl,
  });
}
