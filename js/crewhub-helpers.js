import { Timestamp } from "./firebase-client.js";

export function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTs(ts) {
  if (!ts) return "—";
  let d;
  if (ts instanceof Timestamp) d = ts.toDate();
  else if (typeof ts.toDate === "function") d = ts.toDate();
  else if (typeof ts.seconds === "number") d = new Date(ts.seconds * 1000);
  else if (typeof ts._seconds === "number") d = new Date(ts._seconds * 1000);
  else if (ts instanceof Date) d = ts;
  else return "—";
  return d.toLocaleString();
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function showMessage(elId, text, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#fb7185" : "";
}
