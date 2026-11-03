/**
 * @file index.js
 * @description 网页图片翻译浮层入口，提供主题与设置上下文。
 */

import React from "react";
import ThemeProvider from "../../hooks/M3Theme";
import { SettingProvider, useSetting } from "../../hooks/Setting";
import ImageTranslateBox from "./ImageTranslateBox";
import { SELECTION_STYLES } from "../Selection/styles";
import { newI18n } from "../../config";

function ImageTranslateInner(props) {
  const { setting, updateSetting } = useSetting();
  const i18n = newI18n(props.uiLang || setting?.uiLang || "zh");

  return (
    <ImageTranslateBox
      {...props}
      setting={setting}
      updateSetting={updateSetting}
      i18n={i18n}
    />
  );
}

export default function ImageTranslate(props) {
  return (
    <SettingProvider context="imageTranslate">
      <ThemeProvider styles={props.extStyles}>
        <style>{SELECTION_STYLES}</style>
        <ImageTranslateInner {...props} />
      </ThemeProvider>
    </SettingProvider>
  );
}
