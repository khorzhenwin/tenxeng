"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { establishSession } from "@/lib/auth/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );
      if (name.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() });
      }
      const idToken = await credential.user.getIdToken();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await establishSession(idToken, timezone);
      router.replace("/dashboard");
    } catch (err) {
      const code = typeof err === "object" && err ? "code" in err : false;
      const errorCode =
        code && typeof (err as { code?: unknown }).code === "string"
          ? (err as { code: string }).code
          : null;

      if (errorCode === "auth/email-already-in-use") {
        try {
          const provider = new GoogleAuthProvider();
          const credential = await signInWithPopup(firebaseAuth, provider);
          const idToken = await credential.user.getIdToken();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          await establishSession(idToken, timezone);
          router.replace("/dashboard");
          return;
        } catch (popupError) {
          const message =
            popupError instanceof Error
              ? popupError.message
              : "Email already in use. Please sign in with Google.";
          setError(message);
          return;
        }
      }

      const message =
        err instanceof Error ? err.message : "Unable to sign up.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(firebaseAuth, provider);
      const idToken = await credential.user.getIdToken();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await establishSession(idToken, timezone);
      router.replace("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign up.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="text-sm text-slate-400">
            Start a daily habit of system design practice.
          </p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleEmailSignup}>
          <label className="block text-sm">
            <span className="text-slate-300">Name</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-100 focus:border-slate-500 focus:outline-none"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Email</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-100 focus:border-slate-500 focus:outline-none"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Password</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-100 focus:border-slate-500 focus:outline-none"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
          <button
            className="w-full rounded-xl bg-white py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <button
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-2 text-sm font-semibold text-white hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={handleGoogleSignup}
          disabled={loading}
        >
          Continue with Google
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-semibold text-slate-900">
            G
          </span>
        </button>
        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link className="text-white hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
