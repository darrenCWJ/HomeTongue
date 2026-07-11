import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ChatPage } from "./pages/ChatPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: ChatPage },
      {
        path: "learn",
        lazy: async () => ({ Component: (await import("./pages/LearnPage")).LearnPage }),
      },
      {
        path: "bookmarks",
        lazy: async () => ({ Component: (await import("./pages/BookmarksPage")).BookmarksPage }),
      },
      {
        path: "profile",
        lazy: async () => ({ Component: (await import("./pages/ProfilePage")).ProfilePage }),
      },
    ],
  },
]);
