import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone admin app — separate from the main HomeTongue bundle so that
// admin-only code never ships to end users.
export default defineConfig({
  plugins: [react()],
});
