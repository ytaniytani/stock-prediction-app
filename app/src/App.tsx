import { useState } from "react";
import { AppDataProvider, useAppData } from "./state/AppDataContext";
import { SimDateProvider } from "./state/SimDateContext";
import { ActivePatternProvider } from "./state/ActivePatternContext";
import { Layout, type ScreenId } from "./components/Layout";
import { DashboardScreen } from "./screens/DashboardScreen";
import { PatternSearchScreen } from "./screens/PatternSearchScreen";
import { CaseViewerScreen } from "./screens/CaseViewerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { TimeMachineScreen } from "./screens/TimeMachineScreen";
import { BacktestScreen } from "./screens/BacktestScreen";
import { PaperTradingScreen } from "./screens/PaperTradingScreen";
import { RegimeScreen } from "./screens/RegimeScreen";
import { DataManagerScreen } from "./screens/DataManagerScreen";

function AppInner() {
  const [screen, setScreen] = useState<ScreenId>("dashboard");
  const { loading, rows } = useAppData();

  return (
    <Layout screen={screen} onNavigate={setScreen}>
      {loading || rows.length === 0 ? (
        <div className="card">データを読み込んでいます…</div>
      ) : (
        <>
          {screen === "dashboard" && <DashboardScreen onNavigate={setScreen} />}
          {screen === "pattern" && <PatternSearchScreen />}
          {screen === "cases" && <CaseViewerScreen />}
          {screen === "calendar" && <CalendarScreen />}
          {screen === "timemachine" && <TimeMachineScreen />}
          {screen === "backtest" && <BacktestScreen />}
          {screen === "papertrading" && <PaperTradingScreen />}
          {screen === "regime" && <RegimeScreen />}
          {screen === "data" && <DataManagerScreen />}
        </>
      )}
    </Layout>
  );
}

function App() {
  return (
    <AppDataProvider>
      <SimDateProvider>
        <ActivePatternProvider>
          <AppInner />
        </ActivePatternProvider>
      </SimDateProvider>
    </AppDataProvider>
  );
}

export default App;
