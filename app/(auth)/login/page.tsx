"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { establishSession } from "@/lib/auth/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );
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

      if (errorCode === "auth/invalid-credential") {
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
              : "Invalid credentials. Please sign in with Google.";
          setError(message);
          return;
        }
      }

      const message =
        err instanceof Error ? err.message : "Unable to sign in.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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
        err instanceof Error ? err.message : "Unable to sign in.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <Link
        href="/"
        aria-label="Go to home"
        className="absolute left-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 text-slate-200 hover:border-slate-500"
      >
        <span className="text-lg">⌂</span>
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-slate-400">
            Sign in to access today&apos;s system design quiz.
          </p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleEmailLogin}>
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
              autoComplete="current-password"
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <button
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-2 text-sm font-semibold text-white hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          Continue with Google
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-semibold text-slate-900">
            G
          </span>
        </button>
        <p className="mt-6 text-center text-sm text-slate-400">
          New here?{" "}
          <Link className="text-white hover:underline" href="/signup">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
