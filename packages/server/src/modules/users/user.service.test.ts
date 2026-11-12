import { describe, expect, it, mock } from "bun:test";

const written: { id: number; password: string }[] = [];
const storedHash = await Bun.password.hash("lama-sekali");

mock.module("@/modules/users/user.repository", () => ({
  countUsers: () => Promise.resolve(0),
  findUserDetailById: (id: number) =>
    Promise.resolve(id === 42 ? { id, password: storedHash } : null),
  insertUser: () => Promise.resolve([]),
  listActiveCouriers: () => Promise.resolve([]),
  listUsers: () => Promise.resolve([]),
  replaceUserStores: () => Promise.resolve([]),
  updateUserById: () => Promise.resolve([]),
  updateUserPasswordById: (id: number, password: string) => {
    written.push({ id, password });
    return Promise.resolve([{ id, name: "Budi Santoso" }]);
  },
}));

const { changeOwnPassword, resetUserPassword } = await import(
  "@/modules/users/user.service"
);

describe("changing your own password", () => {
  it("refuses a wrong current password and writes nothing", async () => {
    written.length = 0;
    await expect(
      changeOwnPassword({
        userId: 42,
        currentPassword: "tebak-saja",
        password: "baru-sekali",
      })
    ).rejects.toThrow("Wrong password");
    expect(written).toEqual([]);
  });

  it("stores a hash of the new one once the current one checks out", async () => {
    written.length = 0;
    await changeOwnPassword({
      userId: 42,
      currentPassword: "lama-sekali",
      password: "baru-sekali",
    });

    const [stored] = written;
    expect(stored.id).toBe(42);
    expect(await Bun.password.verify("baru-sekali", stored.password)).toBe(
      true
    );
  });
});

describe("resetting a password", () => {
  it("stores a hash, never what the admin typed", async () => {
    written.length = 0;
    await resetUserPassword({ id: 42, password: "kucing-biru-42" });

    const [stored] = written;
    expect(stored.password).not.toBe("kucing-biru-42");
    expect(await Bun.password.verify("kucing-biru-42", stored.password)).toBe(
      true
    );
  });
});
