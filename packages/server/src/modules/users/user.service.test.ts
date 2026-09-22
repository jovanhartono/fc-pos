import { describe, expect, it, mock } from "bun:test";

const written: { id: number; password: string }[] = [];

mock.module("@/modules/users/user.repository", () => ({
  countUsers: () => Promise.resolve(0),
  findUserDetailById: () => Promise.resolve(null),
  insertUser: () => Promise.resolve([]),
  listUsers: () => Promise.resolve([]),
  replaceUserStores: () => Promise.resolve([]),
  updateUserById: () => Promise.resolve([]),
  updateUserPasswordById: (id: number, password: string) => {
    written.push({ id, password });
    return Promise.resolve([{ id, name: "Budi Santoso" }]);
  },
}));

const { resetUserPassword } = await import("@/modules/users/user.service");

describe("resetting a password", () => {
  it("stores a hash, never what the admin typed", async () => {
    await resetUserPassword({ id: 42, password: "kucing-biru-42" });

    const [stored] = written;
    expect(stored.password).not.toBe("kucing-biru-42");
    expect(await Bun.password.verify("kucing-biru-42", stored.password)).toBe(
      true
    );
  });
});
