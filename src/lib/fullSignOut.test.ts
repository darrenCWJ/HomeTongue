import { describe, test, expect, vi } from "vitest";
import { performFullSignOut } from "./fullSignOut";

function createStorageStub() {
  const removed: string[] = [];
  return {
    removed,
    storage: {
      removeItem: (key: string) => {
        removed.push(key);
      },
    },
  };
}

describe("performFullSignOut", () => {
  test("guest: clears both gate flags and reloads without touching cloud auth", async () => {
    const { removed, storage } = createStorageStub();
    const signOutCloud = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();

    await performFullSignOut({ hasCloudSession: false, signOutCloud, storage, reload });

    expect(signOutCloud).not.toHaveBeenCalled();
    expect(removed).toEqual(expect.arrayContaining(["ht_email_authed", "ht_signed_in"]));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("cloud session: ends the cloud session before clearing flags and reloading", async () => {
    const { removed, storage } = createStorageStub();
    const order: string[] = [];
    const signOutCloud = vi.fn().mockImplementation(async () => {
      order.push("cloud");
    });
    const reload = vi.fn().mockImplementation(() => {
      order.push("reload");
    });

    await performFullSignOut({
      hasCloudSession: true,
      signOutCloud,
      storage: {
        removeItem: (key: string) => {
          order.push(`remove:${key}`);
          storage.removeItem(key);
        },
      },
      reload,
    });

    expect(signOutCloud).toHaveBeenCalledTimes(1);
    expect(removed).toEqual(expect.arrayContaining(["ht_email_authed", "ht_signed_in"]));
    expect(order[0]).toBe("cloud");
    expect(order[order.length - 1]).toBe("reload");
  });

  test("cloud sign-out failure: propagates the error and leaves gates and page untouched", async () => {
    const { removed, storage } = createStorageStub();
    const signOutCloud = vi.fn().mockRejectedValue(new Error("network down"));
    const reload = vi.fn();

    await expect(
      performFullSignOut({ hasCloudSession: true, signOutCloud, storage, reload })
    ).rejects.toThrow("network down");

    expect(removed).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });
});
