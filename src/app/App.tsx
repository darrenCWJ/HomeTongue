import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AppProvider } from "./context/AppContext";

export default function App() {
  // Added a comment to force HMR to refresh AppProvider
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
