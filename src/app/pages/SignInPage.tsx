import React, { useState } from "react";
import { motion } from "motion/react";
import { Globe2, Sparkles, Lock, ArrowRight } from "lucide-react";
import { useAppContext } from "../context/AppContext";

const ACCESS_CODE = import.meta.env.VITE_ACCESS_CODE as string | undefined;

export function SignInPage() {
  const { setIsSignedIn } = useAppContext();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;

    setIsLoading(true);
    setError(false);

    setTimeout(() => {
      setIsLoading(false);
      if (!ACCESS_CODE || code === ACCESS_CODE) {
        setIsSignedIn(true);
      } else {
        setError(true);
        setCode("");
      }
    }, 600);
  };

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-0 w-full h-64 bg-indigo-600 rounded-b-[2.5rem] overflow-hidden">
        <div className="absolute top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-purple-500 opacity-20 rounded-full blur-2xl" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-16 pb-8 relative z-10 flex flex-col">
        {/* Branding */}
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
          <p className="text-indigo-100 text-sm font-medium">Master Cantonese naturally.</p>
        </motion.div>

        {/* Access Code Card */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-6 border border-zinc-100"
        >
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3">
              <Lock size={24} className="text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-zinc-800">Enter Access Code</h2>
            <p className="text-zinc-500 text-sm mt-1 text-center">
              This is a private preview — enter the code to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(false); }}
                placeholder="••••••••"
                autoFocus
                className={`w-full bg-zinc-50 border rounded-xl py-3 px-4 text-center text-lg tracking-[0.3em] font-semibold outline-none transition-all
                  ${error
                    ? "border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-400"
                    : "border-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  }`}
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-500 text-xs font-medium text-center mt-2"
                >
                  Incorrect access code. Try again.
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !code}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:pointer-events-none shadow-md shadow-indigo-200"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Unlock
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
