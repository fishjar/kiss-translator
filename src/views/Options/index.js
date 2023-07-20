import { Routes, Route } from "react-router-dom";
import About from "./About";
import Rules from "./Rules";
import Setting from "./Setting";
import Layout from "./Layout";

export default function Options() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Setting />} />
        <Route path="rules" element={<Rules />} />
        <Route path="about" element={<About />} />
      </Route>
    </Routes>
  );
}
