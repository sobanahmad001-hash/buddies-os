"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "owner" | "admin" | "developer" | "agent" | "viewer" | null;

export function useRole() {
  const [role, setRole] = useState<UserRole>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [departmentSlug, setDepartmentSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: mem } = await supabase.from("memberships")
        .select("role, department_id, departments(slug)")
        .eq("user_id", user.id).eq("status", "active").maybeSingle();
      if (mem) {
        setRole(mem.role as UserRole);
        setDepartmentId(mem.department_id ?? null);
        setDepartmentSlug((mem as any).departments?.slug ?? null);
      }
      setLoading(false);
    }
    load();
  }, []);

  const isOwner = role === "owner";
  const isTeamMember = role !== null && role !== "owner";

  return { role, departmentId, departmentSlug, loading, isOwner, isTeamMember };
}
