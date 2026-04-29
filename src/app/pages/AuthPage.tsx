import React, { useState } from "react";
import { motion } from "motion/react";
import { Globe2, Sparkles, Mail, Lock, ArrowRight } from "lucide-react";

interface AuthPageProps {
  onComplete: () => void;
}

export function AuthPage({ onComplete }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onComplete();
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-64 bg-indigo-600 rounded-b-[2.5rem] overflow-hidden">
        <div className="absolute top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-purple-500 opacity-20 rounded-full blur-2xl" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-16 pb-8 relative z-10 flex flex-col">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="relative w-20 h-20 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-200 mb-6">
            <Globe2 size={40} className="text-indigo-600" />
            <Sparkles size={20} className="text-yellow-400 absolute -top-2 -right-2" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">HomeTongue</h1>
          <p className="text-indigo-100 text-sm font-medium">Master your dialect, naturally.</p>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-6 border border-zinc-100 mb-6"
        >
          <h2 className="text-xl font-bold text-zinc-800 mb-6 text-center">
            {isLogin ? "Welcome back" : "Create an account"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">
                Email Address
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@example.com"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-11 pr-4 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm font-medium text-zinc-800 placeholder:font-normal placeholder:text-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-11 pr-4 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm font-medium text-zinc-800 placeholder:font-normal placeholder:text-zinc-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:pointer-events-none mt-2 shadow-md shadow-indigo-200"
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

          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-zinc-500">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-auto flex flex-col items-center"
        >
          <button
            onClick={onComplete}
            className="text-zinc-500 text-sm font-semibold hover:text-zinc-800 transition-colors"
          >
            Continue as Guest
          </button>
        </motion.div>
      </div>
    </div>
  );
}
