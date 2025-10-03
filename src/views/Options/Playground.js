import { useState } from "react";
import TranForm from "../Selection/TranForm";
import { DEFAULT_SETTING, DEFAULT_TRANBOX_SETTING } from "../../config";
import { useSetting } from "../../hooks/Setting";

export default function Playgound() {
  const [text, setText] = useState("");
  const { setting } = useSetting();
  const { transApis, langDetector, tranboxSetting } =
    setting || DEFAULT_SETTING;
  const { apiSlugs, fromLang, toLang, toLang2, enDict, enSug } =
    tranboxSetting || DEFAULT_TRANBOX_SETTING;
  return (
    <TranForm
      text={text}
      setText={setText}
      apiSlugs={apiSlugs}
      fromLang={fromLang}
      toLang={toLang}
      toLang2={toLang2}
      transApis={transApis}
      simpleStyle={false}
      langDetector={langDetector}
      enDict={enDict}
      enSug={enSug}
      isPlaygound={true}
    />
  );
}
