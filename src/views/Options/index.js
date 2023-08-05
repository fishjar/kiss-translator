import { Routes, Route, HashRouter } from "react-router-dom";
import About from "./About";
import Rules from "./Rules";
import Setting from "./Setting";
import Layout from "./Layout";
import SyncSetting from "./SyncSetting";
import { StoragesProvider } from "../../hooks/Storage";
import ThemeProvider from "../../hooks/Theme";

export default function Options() {
  return (
    <StoragesProvider>
      <ThemeProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Setting />} />
              <Route path="rules" element={<Rules />} />
              <Route path="sync" element={<SyncSetting />} />
              <Route path="about" element={<About />} />
            </Route>
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </StoragesProvider>
  );
}
