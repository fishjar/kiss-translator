import { loadingSvg } from "../../libs/svg";

export default function LoadingIcon() {
  return (
    <div
      style={{
        display: "inline-block",
        width: "1.2em",
        height: "1em",
      }}
      dangerouslySetInnerHTML={{ __html: loadingSvg }}
    />
  );
}
