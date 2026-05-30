import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Divider from "@mui/material/Divider";

/**
 * 全局或者局部通用的 Loading 加载中 React 占位组件
 * 显示 KISS Translator 软件名称、当前版本号以及一个圆形的 Material-UI 加载环 (CircularProgress)
 */
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
