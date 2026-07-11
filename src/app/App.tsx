import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ProfileProvider } from "./context/ProfileProvider";
import { LibraryProvider } from "./context/LibraryProvider";
import { ChatProvider } from "./context/ChatProvider";

export default function App() {
  return (
    <ProfileProvider>
      <LibraryProvider>
        <ChatProvider>
          <RouterProvider router={router} />
        </ChatProvider>
      </LibraryProvider>
    </ProfileProvider>
  );
}
