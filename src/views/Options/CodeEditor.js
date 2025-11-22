import { Resizable } from "re-resizable";
import AceEditor from "react-ace";
import FormControl from "@mui/material/FormControl";
import Typography from "@mui/material/Typography";
import FormHelperText from "@mui/material/FormHelperText";
import Box from "@mui/material/Box";

import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/theme-github_light_default";
import "ace-builds/src-noconflict/theme-github_dark";

export default function CodeEditor({
  label,
  value,
  onChange,
  height,
  onHeightChange,
  darkMode,
  helperText,
  name,
}) {
  return (
    <FormControl fullWidth>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Resizable
        size={{ width: "100%", height: height }}
        onResizeStop={(e, direction, ref, d) => {
          onHeightChange(height + d.height);
        }}
        enable={{ bottom: true }}
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          margin: "4px 0",
        }}
      >
        <AceEditor
          mode="javascript"
          theme={darkMode === "dark" ? "github_dark" : "github_light_default"}
          name={name}
          value={value}
          onChange={onChange}
          editorProps={{ $blockScrolling: true }}
          width="100%"
          height="100%"
          setOptions={{
            useWorker: false,
            showGutter: true,
            showPrintMargin: false,
            fontSize: 14,
            tabSize: 2,
          }}
        />
      </Resizable>
      <FormHelperText component="div" size="small" variant="filled">
        <Box component="pre" sx={{ overflowX: "auto" }}>
          {helperText}
        </Box>
      </FormHelperText>
    </FormControl>
  );
}
