import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Database } from "@/types/supabase";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface AccountStore {
  activeAccountId: string | null;
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  setActiveAccount: (id: string) => void;
  activeAccount: () => Account | null;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      activeAccountId: null,
      accounts: [],
      setAccounts: (accounts) => {
        const current = get().activeAccountId;
        const stillExists = accounts.some((a) => a.id === current);
        set({
          accounts,
          activeAccountId: stillExists
            ? current
            : (accounts.find((a) => a.is_active)?.id ?? accounts[0]?.id ?? null),
        });
      },
      setActiveAccount: (id) => set({ activeAccountId: id }),
      activeAccount: () => {
        const { accounts, activeAccountId } = get();
        return accounts.find((a) => a.id === activeAccountId) ?? null;
      },
    }),
    { name: "active-account", partialize: (s) => ({ activeAccountId: s.activeAccountId }) }
  )
);
