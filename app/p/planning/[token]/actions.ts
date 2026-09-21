"use server";

import { redirect } from "next/navigation";
import { reviewEntry, toDay } from "@/lib/calendar";

const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;

/** The end client's yes or no. No session here: the token in the form is the only authority, and it is checked again server-side. */
export async function review(formData: FormData) {
  const token = String(formData.get("token") || "");
  // Never build a redirect from an unchecked value.
  if (!TOKEN.test(token)) redirect("/");
  const entryId = String(formData.get("entryId") || "");
  const done = await reviewEntry({ token, entryId, verdict: String(formData.get("verdict") || ""), comment: String(formData.get("comment") || ""), today: toDay(new Date()) });
  redirect(`/p/planning/${token}?ok=${done ? "merci" : "echec"}${done ? `#${entryId}` : ""}`);
}
