import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { UserProfile } from "../../../types";
import { ProfileHeader } from "./ProfileHeader";

// The bug under test (PROF-04): the inline name editor persisted whatever the
// blur handler found, including an empty string. Clearing the field and
// tapping away wiped the stored name and left the header showing the "Your
// Persona" placeholder, with no undo.

const PROFILE: UserProfile = {
  id: "p1",
  name: "Darren",
  preferredDialect: "Cantonese",
  preferredTone: "casual",
  toneOverrideEnabled: false,
  personalityNotes: "",
  conversationCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const updateUserProfile = vi.fn();

function renderHeader(userProfile: UserProfile | null = PROFILE) {
  return render(
    <ProfileHeader
      userProfile={userProfile}
      updateUserProfile={updateUserProfile}
      personaSummary={undefined}
    />
  );
}

const openEditor = () => fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
const nameField = () => screen.getByPlaceholderText("Enter your name");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileHeader name editing", () => {
  test("an empty name on blur is discarded and the field resets to the stored name", () => {
    // Arrange
    renderHeader();
    openEditor();

    // Act
    fireEvent.change(nameField(), { target: { value: "" } });
    fireEvent.blur(nameField());

    // Assert — nothing persisted, stored name still shown
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Darren");

    // ...and reopening shows the stored name, not the abandoned empty draft
    openEditor();
    expect(nameField()).toHaveValue("Darren");
  });

  test("a whitespace-only name is treated as empty", () => {
    // Arrange
    renderHeader();
    openEditor();

    // Act
    fireEvent.change(nameField(), { target: { value: "   " } });
    fireEvent.blur(nameField());

    // Assert
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Darren");
  });

  test("a real name still persists, trimmed", () => {
    // Arrange
    renderHeader();
    openEditor();

    // Act
    fireEvent.change(nameField(), { target: { value: "  Mei Ling  " } });
    fireEvent.blur(nameField());

    // Assert
    expect(updateUserProfile).toHaveBeenCalledWith({ name: "Mei Ling" });
  });

  test("an unchanged name persists nothing", () => {
    // Arrange
    renderHeader();
    openEditor();

    // Act
    fireEvent.blur(nameField());

    // Assert
    expect(updateUserProfile).not.toHaveBeenCalled();
  });
});
