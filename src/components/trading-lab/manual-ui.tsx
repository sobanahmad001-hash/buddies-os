"use client";
import { useRef } from "react";
export const inputClass = "mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-sm text-ink";
export const buttonClass = "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
export const panelClass = "rounded-2xl border border-line bg-surface p-5";
export function Field({ label, name, type = "text", required = true, value, placeholder, min, max }: { label: string; name: string; type?: string; required?: boolean; value?: string | number; placeholder?: string; min?: number; max?: number }) {
  return <label className="block text-xs text-muted">{label}<input name={name} type={type} required={required} defaultValue={value} placeholder={placeholder} min={min} max={max} step={type === "number" ? "any" : type === "datetime-local" ? 1 : undefined} className={inputClass}/></label>;
}
export function TextField({ label, name, value, required = true, placeholder }: { label: string; name: string; value?: string; required?: boolean; placeholder?: string }) {
  return <label className="block text-xs text-muted">{label}<textarea name={name} required={required} defaultValue={value} maxLength={4000} placeholder={placeholder} className={`${inputClass} min-h-20`}/></label>;
}
export const localTime = (time = Date.now()) => new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
export const formValues = (form: HTMLFormElement) => {
  const data = new FormData(form);
  return { text: (key: string) => String(data.get(key) ?? ""), number: (key: string) => Number(data.get(key)), time: (key: string) => new Date(String(data.get(key))).toISOString(), checked: (key: string) => data.get(key) === "on" };
};
export async function labApi(path: string, body?: unknown) {
  const response = await fetch(`/api/trading-lab/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not complete the request.");
  return data;
}
export function useRequestIdentity() {
  const requests = useRef(new Map<string, string>());
  return (payload: unknown) => {
    const key = JSON.stringify(payload);
    if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    return requests.current.get(key)!;
  };
}
