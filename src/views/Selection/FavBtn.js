import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useState } from "react";
import { useFavWords } from "../../hooks/FavWords";
import { kissLog } from "../../libs/log";

/**
 * 收藏生词按钮组件 (红心图标)
 *
 * @param {Object} props
 * @param {string} props.word - 需要被收藏或取消收藏的单词
 * @param {string} props.title - 鼠标悬停提示文本
 */
export default function FavBtn({ word, title }) {
  // 使用自定义的 useFavWords 获取收藏的生词列表及切换收藏状态的方法
  const { favWords, toggleFav } = useFavWords();
  const [loading, setLoading] = useState(false);

  // 点击触发收藏/取消收藏
  const handleClick = () => {
    try {
      setLoading(true);
      // REVIEW: toggleFav(word) 极有可能是涉及本地存储或后台同步的异步操作，但在 handleClick 中未对其进行 await (函数也未声明为 async)。这导致 finally 块中的 setLoading(false) 会同步瞬间执行，使防连击的 loading 状态形同虚设。建议将其改为 async 函数，并对 toggleFav(word) 加上 await。
      toggleFav(word);
    } catch (err) {
      kissLog("set fav", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IconButton
      disabled={loading}
      size="small"
      onClick={handleClick}
      title={title}
    >
      {/* 如果单词已存在于生词本中，渲染实心红心，否则为空心红心 */}
      {favWords[word] ? (
        <FavoriteIcon fontSize="inherit" />
      ) : (
        <FavoriteBorderIcon fontSize="inherit" />
      )}
    </IconButton>
  );
}
