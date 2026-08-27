import React, { useState } from "react";
import { motion } from "motion/react";
import { Mail, Lock, ArrowRight, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthProvider";

const MIN_PASSWORD_LENGTH = 8;
const FAKE_SUBMIT_DELAY_MS = 1200;

interface AuthPageProps {
  onComplete: () => void;
}

function getAuthErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function AuthPage({ onComplete }: AuthPageProps) {
  const { isCloudAuthEnabled, signInWithPassword, signUpWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (!isCloudAuthEnabled) {
      // Local-only mode: keep the original fake gate behavior untouched.
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        onComplete();
      }, FAKE_SUBMIT_DELAY_MS);
      return;
    }

    if (!isLogin && password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        await signInWithPassword(email, password);
        onComplete();
      } else {
        const { needsEmailConfirmation } = await signUpWithPassword(email, password);
        if (needsEmailConfirmation) {
          setConfirmationEmail(email);
        } else {
          onComplete();
        }
      }
    } catch (err) {
      toast.error(getAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    setConfirmationEmail(null);
    setIsLogin(true);
    setPassword("");
  };

  return (
    <div className="flex flex-col h-full bg-card relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-64 bg-brand-blue rounded-b-[2.5rem] overflow-hidden">
        <div className="absolute top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-brand-red opacity-20 rounded-full blur-2xl" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-16 pb-8 relative z-10 flex flex-col scrollbar-none">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <img
            src="/logo.png"
            alt="HomeTongue"
            className="w-20 h-20 rounded-2xl mx-auto shadow-lg shadow-brand-blue/20 mb-6 object-cover"
          />
          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">HomeTongue</h1>
          <p className="text-brand-white text-sm font-medium">Master your dialect, naturally.</p>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-3xl shadow-xl shadow-border/50 p-6 border border-border-subtle mb-6"
        >
          {confirmationEmail ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <MailCheck size={24} className="text-brand-blue" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                We sent a confirmation link to{" "}
                <span className="font-semibold text-foreground/90">{confirmationEmail}</span>. Confirm your
                address, then sign in.
              </p>
              <button
                onClick={handleBackToSignIn}
                className="font-bold text-brand-blue hover:text-brand-blue/80 transition-colors text-sm"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground mb-6 text-center">
                {isLogin ? "Welcome back" : "Create an account"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hello@example.com"
                      className="w-full bg-input-background border border-border rounded-xl py-3 pl-11 pr-4 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue transition-all text-sm font-medium text-foreground placeholder:font-normal placeholder:text-faint"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-input-background border border-border rounded-xl py-3 pl-11 pr-4 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue transition-all text-sm font-medium text-foreground placeholder:font-normal placeholder:text-faint"
                    />
                  </div>
                  {isCloudAuthEnabled && !isLogin && (
                    <p className="text-xs text-faint mt-1.5">At least {MIN_PASSWORD_LENGTH} characters.</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email || !password}
                  className="w-full bg-brand-blue hover:bg-brand-blue/90 active:bg-brand-blue/80 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:pointer-events-none mt-2 shadow-md shadow-brand-blue/20"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {isLogin ? "Sign In" : "Sign Up"}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="font-bold text-brand-blue hover:text-brand-blue/80 transition-colors"
                >
                  {isLogin ? "Sign Up" : "Sign In"}
                </button>
              </div>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-auto flex flex-col items-center"
        >
          {/* Disabled with the submit button: tapping this mid sign-in used to
              drop the user into the app as a guest while the auth call was
              still resolving behind them. */}
          <button
            onClick={onComplete}
            disabled={isLoading}
            className="text-muted-foreground text-sm font-semibold hover:text-foreground transition-colors disabled:opacity-70 disabled:pointer-events-none"
          >
            Continue as Guest
          </button>
          {isCloudAuthEnabled && (
            <p className="text-faint text-xs mt-1.5">Guest data stays on this device.</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
