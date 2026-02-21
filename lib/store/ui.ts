import { create } from "zustand";
import { persist } from "zustand/middleware";

type DashboardTab =
  | "questions"
  | "preferences"
  | "leaderboard"
  | "profile"
  | "pvp"
  | "social";

type UiState = {
  activeTab: DashboardTab;
  leaderboardLimit: 10 | 25 | 50;
  applyDays: 1 | 2 | 3 | 4 | 5;
  setActiveTab: (tab: DashboardTab) => void;
  setLeaderboardLimit: (limit: 10 | 25 | 50) => void;
  setApplyDays: (days: 1 | 2 | 3 | 4 | 5) => void;
};

type PersistedUiState = Partial<
  Omit<UiState, "activeTab" | "leaderboardLimit">
> & {
  activeTab?: string;
  leaderboardLimit?: number;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeTab: "questions",
      leaderboardLimit: 10,
      applyDays: 3,
      setActiveTab: (tab) => set({ activeTab: tab }),
      setLeaderboardLimit: (limit) => set({ leaderboardLimit: limit }),
      setApplyDays: (days) => set({ applyDays: days }),
    }),
    {
      name: "tenxeng-ui",
      version: 4,
      migrate: (state) => {
        const data = (state as PersistedUiState | undefined) ?? {};
        const allowed = new Set([10, 25, 50]);
        const allowedTabs = new Set([
          "questions",
          "preferences",
          "leaderboard",
          "profile",
          "pvp",
          "social",
        ]);
        const activeTab = data.activeTab ?? "questions";
        const migratedTab = activeTab === "statistics" ? "profile" : activeTab;
        const leaderboardLimit = data.leaderboardLimit;
        return {
          ...data,
          activeTab: allowedTabs.has(migratedTab)
            ? migratedTab
            : "questions",
          leaderboardLimit: allowed.has(leaderboardLimit ?? NaN)
            ? (leaderboardLimit as 10 | 25 | 50)
            : 10,
        };
      },
    }
  )
);
