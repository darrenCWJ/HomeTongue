import React from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ChatPage } from "./pages/ChatPage";
import { LearnPage } from "./pages/LearnPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ExamTestPage } from "./pages/ExamTestPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: ChatPage },
      { path: "learn", Component: LearnPage },
      { path: "bookmarks", Component: BookmarksPage },
      { path: "profile", Component: ProfilePage },
    ],
  },
  { path: "/test/exam", Component: ExamTestPage },
]);
