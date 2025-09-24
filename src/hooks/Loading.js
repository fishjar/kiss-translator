import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Divider from "@mui/material/Divider";

export default function Loading() {
  return (
    <center>
      <Divider>
        <Link
          href={process.env.REACT_APP_HOMEPAGE}
        >{`KISS Translator v${process.env.REACT_APP_VERSION}`}</Link>
      </Divider>
      <CircularProgress />
    </center>
  );
}
