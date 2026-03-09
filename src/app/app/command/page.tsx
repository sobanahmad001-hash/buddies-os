"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q");
  useEffect(() => {
    router.replace(q ? `/app/ai?q=${encodeURIComponent(q)}` : "/app/ai");
  }, []);
  return null;
}

export default function CommandRedirect() {
  return (
    <Suspense>
      <Redirect />
    </Suspense>
  );
}
