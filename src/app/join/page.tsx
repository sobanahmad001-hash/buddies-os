"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function JoinContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading"|"success"|"error"|"login">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Invalid invite link."); return; }
    acceptInvite();
  }, [token]);

  async function acceptInvite() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("login"); return; }

    const res = await fetch("/api/workspace/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const d = await res.json();

    if (d.success) {
      setStatus("success");
      setMessage(`You joined as ${d.role}. Redirecting...`);
      setTimeout(() => router.push("/app"), 2000);
    } else {
      setStatus("error");
      setMessage(d.error ?? "Failed to accept invite.");
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-[#E5E2DE] p-8 max-w-sm w-full text-center">
        <div className="text-2xl mb-4">
          {status === "loading" ? "⏳" : status === "success" ? "✅" : status === "login" ? "🔐" : "❌"}
        </div>
        <h1 className="text-lg font-semibold text-[#1A1A1A] mb-2">
          {status === "loading" ? "Joining workspace..." :
           status === "success" ? "Welcome aboard!" :
           status === "login" ? "Sign in to join" :
           "Invite error"}
        </h1>
        <p className="text-sm text-[#737373] mb-6">
          {status === "loading" ? "Processing your invite..." :
           status === "success" ? message :
           status === "login" ? "You need to sign in or create an account first." :
           message}
        </p>
        {status === "login" && (
          <button onClick={() => router.push(`/login?redirect=/join?token=${token}`)}
            className="w-full py-2.5 bg-[#E8521A] text-white font-semibold rounded-lg hover:bg-[#c94415]">
            Sign In
          </button>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-[#E5E2DE] p-8 max-w-sm w-full text-center">
          <div className="text-2xl mb-4">⏳</div>
          <h1 className="text-lg font-semibold text-[#1A1A1A]">Loading...</h1>
        </div>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
