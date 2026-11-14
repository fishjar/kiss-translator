import { normalizeTranboxFontSize } from "../../config/tranboxFont";
import TranForm from "../../views/Selection/TranForm";

/** Keep the same translation form and density in every panel host. */
export default function TranslationPanelContent({ fontSize, ...props }) {
  return (
    <div
      className="kt-tranbox-content"
      data-reading-font-size={
        fontSize !== undefined ? normalizeTranboxFontSize(fontSize) : undefined
      }
      style={
        fontSize !== undefined
          ? {
              "--kt-reading-font-size": `${normalizeTranboxFontSize(fontSize)}px`,
            }
          : undefined
      }
    >
      <TranForm {...props} />
    </div>
  );
}
