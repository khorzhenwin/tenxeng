export async function establishSession(idToken: string, timezone?: string) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, timezone }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to create session.");
  }
}

export async function clearSession() {
  await fetch("/api/session", { method: "DELETE" });
}
