import { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Device from "./LocalAiTabs/Device";
import Models from "./LocalAiTabs/Models";
import Jev from "./LocalAiTabs/Jev";
import Asr from "./LocalAiTabs/Asr";
import Ocr from "./LocalAiTabs/Ocr";
import Vlm from "./LocalAiTabs/Vlm";
import Llm from "./LocalAiTabs/Llm";
import Tts from "./LocalAiTabs/Tts";
import Settings from "./LocalAiTabs/Settings";
import { useI18n } from "../../hooks/I18n";

export default function LocalAi() {
  const i18n = useI18n();
  const [activeTab, setActiveTab] = useState("device");

  const tabs = [
    {
      id: "device",
      label: i18n("local_ai_tab_device", "设备"),
      Component: Device,
    },
    {
      id: "models",
      label: i18n("local_ai_tab_models", "模型中心"),
      Component: Models,
    },
    { id: "jev", label: i18n("local_ai_tab_jev", "JEV"), Component: Jev },
    { id: "asr", label: i18n("local_ai_tab_asr", "ASR"), Component: Asr },
    { id: "ocr", label: i18n("local_ai_tab_ocr", "OCR"), Component: Ocr },
    { id: "vlm", label: i18n("local_ai_tab_vlm", "VLM"), Component: Vlm },
    { id: "llm", label: i18n("local_ai_tab_llm", "LLM"), Component: Llm },
    { id: "tts", label: i18n("local_ai_tab_tts", "TTS"), Component: Tts },
    {
      id: "settings",
      label: i18n("local_ai_tab_settings", "设置"),
      Component: Settings,
    },
  ];

  return (
    <Box sx={{ width: "100%", maxWidth: 1080, mx: "auto" }}>
      <Box sx={{ mb: 2.5 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tab) => (
            <Tab key={tab.id} value={tab.id} label={tab.label} />
          ))}
        </Tabs>
      </Box>

      <Box>
        {tabs.map(({ id, Component }) => (
          <Box key={id} sx={{ display: activeTab === id ? "block" : "none" }}>
            <Component />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
