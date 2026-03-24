"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const ACCENT_PRESETS = [
  { color: "#B5622A", label: "Burnt Orange" },
  { color: "#3B82F6", label: "Blue" },
  { color: "#10B981", label: "Green" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#EF4444", label: "Red" },
  { color: "#EAB308", label: "Yellow" },
  { color: "#EC4899", label: "Pink" },
  { color: "#06B6D4", label: "Cyan" },
];

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [accentColor, setAccentColor] = useState("#B5622A");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUser(user);

    const { data } = await supabase
      .from("workspace_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setWorkspaceName(data.workspace_name ?? "My Workspace");
      setAccentColor(data.accent_color ?? "#B5622A");
      setLogoUrl(data.logo_url ?? null);
    } else {
      setWorkspaceName("Anka Sphere");
    }
  }

  async function uploadLogo(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, SVG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("File must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${user.id}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("workspace-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("workspace-assets")
        .getPublicUrl(path);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setLogoUrl(publicUrl);
      await saveSettings({ logo_url: publicUrl });
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    }
    setUploading(false);
  }

  async function removeLogo() {
    if (!user) return;
    setLogoUrl(null);
    await saveSettings({ logo_url: null });
  }

  async function saveSettings(overrides: Record<string, any> = {}) {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      workspace_name: workspaceName,
      accent_color: accentColor,
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    await supabase
      .from("workspace_settings")
      .upsert(payload, { onConflict: "user_id" });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);

    // Apply accent color live to CSS variable
    const color = overrides.accent_color ?? accentColor;
    document.documentElement.style.setProperty("--accent", color);

    // Dispatch custom event so nav updates logo without full reload
    window.dispatchEvent(new CustomEvent("buddies:settings-updated", {
      detail: { ...payload, ...overrides },
    }));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadLogo(file);
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0D0D0D] p-4 md:p-8">
      <div className="max-w-[600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-[20px] font-bold text-[#C8C5C0]">Settings</h1>
          <p className="text-[13px] text-[#525252] mt-1">Workspace appearance and preferences</p>
        </div>

        {/* Logo */}
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl p-6 mb-4">
          <h2 className="text-[14px] font-bold text-[#C8C5C0] mb-1">Workspace Logo</h2>
          <p className="text-[12px] text-[#525252] mb-5">Shown in the nav sidebar. PNG, JPG, SVG or WebP under 5MB.</p>

          <div className="flex items-center gap-6">
            {/* Current logo / placeholder */}
            <div className="w-20 h-20 rounded-2xl bg-[#111111] border border-[#2D2D2D] flex items-center justify-center overflow-hidden shrink-0 relative group">
              {logoUrl ? (
                <>
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                  <button
                    onClick={removeLogo}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl"
                  >
                    <X size={16} className="text-white" />
                  </button>
                </>
              ) : (
                <span className="text-[28px] select-none">⚡</span>
              )}
            </div>

            {/* Upload area */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex-1 border-2 border-dashed rounded-xl px-6 py-5 cursor-pointer transition-all text-center
                ${dragOver ? "border-[#B5622A] bg-[#B5622A10]" : "border-[#2D2D2D] hover:border-[#525252] hover:bg-[#161616]"}`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="text-[#B5622A] animate-spin" />
                  <span className="text-[13px] text-[#737373]">Uploading...</span>
                </div>
              ) : (
                <>
                  <Upload size={20} className="text-[#525252] mx-auto mb-2" />
                  <p className="text-[13px] text-[#737373]">Click or drag to upload</p>
                  <p className="text-[11px] text-[#525252] mt-1">PNG, JPG, SVG, WebP · max 5MB</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Workspace name */}
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl p-6 mb-4">
          <h2 className="text-[14px] font-bold text-[#C8C5C0] mb-1">Workspace Name</h2>
          <p className="text-[12px] text-[#525252] mb-4">Shown below the logo in the nav.</p>
          <input
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            className="w-full px-4 py-3 bg-[#111111] border border-[#2D2D2D] rounded-xl text-[14px] text-[#C8C5C0] focus:outline-none focus:border-[#B5622A] transition-colors"
            placeholder="Anka Sphere"
          />
        </div>

        {/* Accent color */}
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl p-6 mb-6">
          <h2 className="text-[14px] font-bold text-[#C8C5C0] mb-1">Accent Color</h2>
          <p className="text-[12px] text-[#525252] mb-4">Used for buttons, active states, and highlights.</p>

          <div className="flex flex-wrap gap-3 mb-4">
            {ACCENT_PRESETS.map(preset => (
              <button
                key={preset.color}
                onClick={() => setAccentColor(preset.color)}
                title={preset.label}
                className={`w-8 h-8 rounded-full transition-all border-2 relative
                  ${accentColor === preset.color ? "border-white scale-110" : "border-transparent hover:scale-105"}`}
                style={{ backgroundColor: preset.color }}
              >
                {accentColor === preset.color && (
                  <Check size={12} className="text-white absolute inset-0 m-auto" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-[#2D2D2D] bg-[#111111] cursor-pointer p-1"
            />
            <input
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              className="w-32 px-3 py-2 bg-[#111111] border border-[#2D2D2D] rounded-lg text-[13px] text-[#C8C5C0] font-mono focus:outline-none focus:border-[#B5622A]"
              placeholder="#B5622A"
            />
            <div className="flex-1 h-10 rounded-lg border border-[#2D2D2D] flex items-center px-3 gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
              <span className="text-[12px] text-[#737373]">Preview</span>
              <div
                className="ml-auto px-3 py-1 rounded-lg text-[11px] font-semibold text-white"
                style={{ backgroundColor: accentColor }}
              >
                Button
              </div>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl p-6 mb-6">
          <h2 className="text-[14px] font-bold text-[#C8C5C0] mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#B5622A] flex items-center justify-center text-white font-bold text-[14px]">
              {user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#C8C5C0]">{user?.email ?? "—"}</p>
              <p className="text-[11px] text-[#525252]">
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={() => saveSettings()}
          disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-[14px] text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: accentColor }}
        >
          {saving ? (
            <><Loader2 size={15} className="animate-spin" /> Saving...</>
          ) : saved ? (
            <><Check size={15} /> Saved!</>
          ) : (
            "Save Settings"
          )}
        </button>
      </div>
    </div>
  );
}
