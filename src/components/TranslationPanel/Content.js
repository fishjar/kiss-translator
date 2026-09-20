import TranForm from "../../views/Selection/TranForm";

/** Keep the same translation form and density in every panel host. */
export default function TranslationPanelContent(props) {
  return (
    <div className="kt-tranbox-content">
      <TranForm {...props} />
    </div>
  );
}
