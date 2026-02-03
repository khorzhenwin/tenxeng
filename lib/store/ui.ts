import { create } from "zustand";
import { persist } from "zustand/middleware";

type DashboardTab = "questions" | "preferences" | "leaderboard" | "statistics";

type UiState = {
  activeTab: DashboardTab;
  leaderboardLimit: 10 | 25 | 50;
  applyDays: 1 | 2 | 3 | 4 | 5;
  setActiveTab: (tab: DashboardTab) => void;
  setLeaderboardLimit: (limit: 10 | 25 | 50) => void;
  setApplyDays: (days: 1 | 2 | 3 | 4 | 5) => void;
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
      version: 1,
      migrate: (state) => {
        const data = state as UiState;
        const allowed = new Set([10, 25, 50]);
        return {
          ...data,
          leaderboardLimit: allowed.has(data.leaderboardLimit)
            ? data.leaderboardLimit
            : 10,
        };
      },
    }
  )
);
