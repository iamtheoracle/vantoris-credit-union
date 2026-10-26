import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import SplashScreen from "@/components/auth/SplashScreen";
import OnboardingCarousel from "@/components/auth/OnboardingCarousel";
import { Loader2, Lock, User } from "lucide-react";

export default function Login() {
  const [phase, setPhase] = useState("login");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();

  useEffect(() => {
    const saved = localStorage.getItem("vantoris_user_id");
    if (saved) {
      setUserId(saved);
      setRememberId(true);
    }
  }, []);

  function handleSplashDone() {
    const seen = localStorage.getItem("vantoris_onboarding_seen");
    setPhase(seen ? "login" : "onboarding");
  }

  function handleOnboardingComplete() {
    localStorage.setItem("vantoris_onboarding_seen", "true");
    setPhase("login");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (rememberId) localStorage.setItem("vantoris_user_id", userId);
      else localStorage.removeItem("vantoris_user_id");

      const result = await base44.auth.loginViaEmailPassword(userId.trim(), password);
      const token = result?.access_token || result?.token || result?.accessToken;
      if (!token) {
        setError("Sign-in succeeded but no session was created. Please try again.");
        return;
      }
      // Ensure SDK client + localStorage both hold the session token
      base44.setToken(token);
      base44.auth.setToken(token);
      // Write every key the app rehydrates from. Do this before navigation.
      localStorage.setItem('base44_access_token', token);
      localStorage.setItem('token', token);
      localStorage.setItem('base44_token', token);

      let dest = '/';
      try {
        const me = await base44.auth.me();
        const role = String(me?.role || '').toLowerCase();
        if (['admin', 'ops', 'super_admin', 'superadmin', 'operations'].includes(role)) dest = '/operations';
        else dest = '/';
      } catch (meErr) {
        setError(meErr?.message || 'Signed in, but the session could not be confirmed. Try again.');
        return;
      }
      window.location.assign(dest);
      return;
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 404) {
        setError("Sign-in is temporarily unavailable. Please refresh the page and try again.");
      } else if (status === 400 || status === 401) {
        setError("Your email or password is incorrect.");
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError("Unable to connect. Please check your internet connection and try again.");
      } else if (err?.message?.includes('Network') || err?.code === 'ERR_NETWORK') {
        setError("Unable to reach the server right now. Please try again in a moment.");
      } else {
        setError(err.message || "Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (phase === "splash") {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  if (phase === "onboarding") {
    return (
      <OnboardingCarousel
        onGetStarted={() => navigate("/register")}
        onSignIn={handleOnboardingComplete}
        onSkip={handleOnboardingComplete}
      />
    );
  }

  return (
    <AuthLayout
      title="Member sign in"
      footer={
        <span>
          Not a member yet?{" "}
          <Link to="/register" className="text-navy font-medium hover:underline">
            Join
          </Link>
        </span>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-crimson/10 border border-crimson/20 text-crimson text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray">Member email</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray" />
            <input
              type="email"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
              className="w-full h-12 rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-foreground outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full h-12 rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-foreground outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-navy/20"
          />
          <span className="text-sm text-gray">Remember email</span>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-navy text-white font-semibold rounded-xl hover:bg-navy/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
      <div className="flex flex-col gap-2 mt-5 text-center text-xs">
        <Link to="/forgot-password" className="text-gray hover:text-navy transition">Forgot email</Link>
        <Link to="/forgot-password" className="text-gray hover:text-navy transition">Forgot Password</Link>
        <Link to="/forgot-password" className="text-gray hover:text-navy transition">Need Help?</Link>
      </div>
    </AuthLayout>
  );
}
