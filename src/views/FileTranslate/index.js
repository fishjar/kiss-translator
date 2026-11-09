import React from "react";
import { FileTranslationProvider } from "./State";
import FileTranslateView from "./FileTranslateView";

export default function FileTranslatePage() {
  return (
    <FileTranslationProvider>
      <FileTranslateView />
    </FileTranslationProvider>
  );
}
