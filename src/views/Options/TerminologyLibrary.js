import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useI18n } from "../../hooks/I18n";
import { useAlert } from "../../hooks/Alert";
import { useConfirm } from "../../hooks/Confirm";
import { useTerms } from "../../hooks/Terms";
import { useSubTerms } from "../../hooks/SubTerms";
import { useSubRules } from "../../hooks/SubRules";
import UploadButton from "./UploadButton";
import DownloadButton from "./DownloadButton";
import { parseImport } from "../../libs/termsImport";
import { parseTerms } from "../../libs/terms";
import { composeSources } from "../../libs/termsCompose";
import { getSubTerms } from "../../libs/storage";
import {
  TERMS_LIBRARY_MAX_ENTRIES,
  DEFAULT_TERMS_LIBRARY_ID,
} from "../../config";

/** 由文件后缀选择导入格式；无后缀时退化为内容嗅探 */
function resolveFormat(filename, content) {
  const name = typeof filename === "string" ? filename.toLowerCase() : "";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".txt")) return "txt";
  const trimmed = String(content || "").trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "csv";
}

/**
 * 启用「完整诊断」（含跨术语 O(n²) 冲突分析）的文本长度上限。
 * 超过此长度降级为 fast 模式，避免大术语库在编辑时卡死页面。
 */
export const TERMS_FULL_DIAGNOSTICS_MAX_CHARS = 2000;

/**
 * 带占位符的 i18n 取值。
 *
 * ⚠️ 本项目的 `i18n(key, defaultText)` **只有两个参数，且不做插值**——
 * 第二个参数是"缺省文案"而非参数对象（见 hooks/I18n.js:13-15）。
 * 若把对象当第二参传入，会静默退化成原始模板文本（如字面显示 `共 {count} 条`）。
 */
function i18nParams(i18n, key, params = {}) {
  let text = i18n(key);
  Object.entries(params).forEach(([name, value]) => {
    text = text.split(`{${name}}`).join(String(value));
  });
  return text;
}

/** 单张库卡片 */
function LibraryCard({
  lib,
  index,
  isDefault,
  entryCount,
  author,
  selected,
  isDragging,
  isDragOver,
  onClick,
  onEdit,
  onDelete,
  onToggle,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  canMoveUp,
  canMoveDown,
  i18n,
}) {
  const displayName = isDefault
    ? i18n("terms_library_default_name")
    : lib.name || i18n("terms_library_untitled");

  // 订阅库不可编辑（人类决策：要看内容去订阅的地方看，不在客户端展示）。
  // 用编辑按钮的亮/灭把"可否编辑"编码进 UI，而不是让用户点进去才发现只读。
  const editable = lib.source?.type !== "subscription";

  return (
    <ListItem
      className="kt-terms-list__item"
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDrop={onDrop}
      sx={{ px: 0, py: 0.5 }}
    >
      <Paper
        variant="outlined"
        className="kt-terms-list__card"
        sx={{
          width: "100%",
          opacity: isDragging ? 0.5 : 1,
          borderColor: isDragOver
            ? "primary.main"
            : selected
              ? "primary.main"
              : "divider",
          borderStyle: isDragOver ? "dashed" : "solid",
          borderWidth: isDragOver ? 2 : 1,
          bgcolor: selected ? "action.selected" : "background.paper",
          transition: "background-color .15s, border-color .15s",
        }}
      >
        <ListItemButton
          selected={selected}
          onClick={onClick}
          sx={{ alignItems: "flex-start", gap: 1, py: 1.25 }}
        >
          {/* 点阵与序号成组：组内垂直居中，组的高度锚定库名首行，
              避免两个元素各自 mt 导致上下错位（用户反馈：点阵偏上） */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexShrink: 0, height: 22 }}
          >
          {/* 竖排两列点阵：所有库都显示（视觉统一，且提示这里可交互）。
              只有点阵可拖 —— 整卡拖拽容易与"点选"误触。
              默认库的点阵不可拖（人类决策 D1：不可调整位置）。 */}
          <Tooltip
            title={isDefault ? i18n("terms_library_fixed") : i18n("terms_drag_to_reorder")}
          >
            <Box
              className="kt-terms-list__grip"
              {...(isDefault
                ? {}
                : {
                    draggable: true,
                    onDragStart,
                    onDragEnd,
                  })}
              onClick={(e) => e.stopPropagation()}
              sx={{
                cursor: isDefault ? "default" : "grab",
                display: "grid",
                gridTemplateColumns: "repeat(2, 4px)",
                gridTemplateRows: "repeat(3, 4px)",
                gap: "4px",
                // 与序号 Chip 同高（24px 的 small Chip → 内容盒 20px），
                // 使两者在卡片首行垂直居中后基线一致
                height: 20,
                alignContent: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: isDefault ? "text.disabled" : "text.secondary",
                "&:active": { cursor: isDefault ? "default" : "grabbing" },
              }}
            >
              {/* 两列 × 三行圆点，即常见的拖拽把手 */}
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <Box
                  key={n}
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    bgcolor: "currentColor",
                  }}
                />
              ))}
            </Box>
          </Tooltip>

          {/* 只读序号：让用户看得见加载顺序 */}
          <Chip
            label={`#${index}`}
            size="small"
            variant="outlined"
            sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
          />
          </Stack>

          <Box sx={{ minWidth: 0, flex: 1, opacity: lib.enabled ? 1 : 0.5 }}>
            <Typography
              sx={{ fontSize: 14, fontWeight: 650, overflowWrap: "anywhere" }}
            >
              {displayName}
            </Typography>
            {/* 简介：有则显示，无则不渲染该行（人类决策：description 可选） */}
            {lib.description ? (
              <Typography
                color="text.secondary"
                sx={{ mt: 0.25, fontSize: 12, overflowWrap: "anywhere" }}
              >
                {lib.description}
              </Typography>
            ) : null}
              <Typography
              color="text.secondary"
              sx={{ mt: 0.25, fontSize: 11 }}
              component="div"
            >
              {i18nParams(i18n, "terms_count", { count: entryCount })}
              {/* 署名：仅订阅库且能取到时显示（人类决策：author 可选） */}
              {author ? ` · ${author}` : ""}
              {!isDefault && lib.enabled === false
                ? ` · ${i18n("terms_disabled")}`
                : ""}
            </Typography>
          </Box>

          {/* 上下移动（触屏/键盘友好）；默认库不显示 */}
          {!isDefault && (
            <Stack direction="row" sx={{ flexShrink: 0 }}>
              <IconButton
                size="small"
                disabled={!canMoveUp}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(-1);
                }}
                aria-label={i18n("terms_move_up")}
              >
                <KeyboardArrowUpIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                disabled={!canMoveDown}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(1);
                }}
                aria-label={i18n("terms_move_down")}
              >
                <KeyboardArrowDownIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}

          {/* 编辑入口：点击卡片只做选中，进入编辑走这里。
              订阅库的编辑按钮**彻底禁用**（人类决策：要看内容去订阅的地方看）。 */}
          <Tooltip
            title={
              editable
                ? i18n("terms_edit_library")
                : i18n("terms_subscription_not_editable")
            }
          >
            <span>
              <IconButton
                size="small"
                disabled={!editable}
                data-testid={`terms-edit-${lib.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label={i18n("terms_edit_library")}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          {/* 删除入口：默认库不可删（人类决策 D1：默认库固定在最前）。
              订阅库可删 —— 删除仅移除本地库与缓存，不动远端订阅文件。 */}
          {!isDefault && (
            <Tooltip title={i18n("terms_delete_library")}>
              <IconButton
                size="small"
                color="error"
                data-testid={`terms-delete-${lib.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label={i18n("terms_delete_library")}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* 开关：默认库常开且不可调（人类决策：不想用别在里面加术语即可） */}
          <Tooltip
            title={isDefault ? i18n("terms_default_always_on") : ""}
            disableHoverListener={!isDefault}
          >
            <span>
              <Switch
                size="small"
                checked={lib.enabled !== false}
                disabled={isDefault}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggle(e.target.checked)}
                inputProps={{ "aria-label": displayName }}
              />
            </span>
          </Tooltip>
        </ListItemButton>
      </Paper>
    </ListItem>
  );
}

export default function TerminologyLibrary() {
  const i18n = useI18n();
  const alert = useAlert();
  const confirm = useConfirm();
  const {
    libraries,
    addLibrary,
    removeLibrary,
    updateLibrary,
    setLibraryTerms,
    appendLibraryTerms,
    reorderLibraries,
    moveLibrary,
    isLoading,
  } = useTerms();
  const { addSubTerms, delSubTerms, syncOne } = useSubTerms();
  // 合成预览的第 ③ 层（规则 terms）沿用既有订阅规则选择
  const { selectedRules } = useSubRules();

  // 详情页：null = 在列表页
  const [openId, setOpenId] = useState(null);
  const [newSubUrl, setNewSubUrl] = useState("");
  const [syncingId, setSyncingId] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dragOverId, setDragOverId] = useState("");
  // 多选（为批量启用/禁用/更新订阅预留；人类已确认现在就要可用）
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Shift 范围选的锚点：上次**普通点击**的那张卡
  const [anchorId, setAnchorId] = useState("");
  // 订阅库的元信息与条数从缓存读（正文不在 libraries[] 内）
  const [subMeta, setSubMeta] = useState({}); // url -> {entries, meta, author}

  /**
   * 卡片点击 = 选中/取消选中（不再进详情页）。
   *
   * - 普通点击：切换该卡片的选中态，并把它记为 Shift 范围锚点
   * - Shift+点击：从锚点到当前卡片**之间**全部选中（替换式范围选）
   * - Ctrl/Cmd+点击：切换该卡片（跳跃式复选）
   *
   * 不做 Shift+Ctrl 组合（人类决策：与输入法切换快捷键冲突）。
   */
  const handleCardClick = useCallback(
    (lib, event) => {
      const id = lib.id;
      const shift = event?.shiftKey;
      const toggle = event?.ctrlKey || event?.metaKey;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && anchorId) {
          // 范围选：替换为锚点到当前之间的全部
          const from = libraries.findIndex((l) => l.id === anchorId);
          const to = libraries.findIndex((l) => l.id === id);
          if (from >= 0 && to >= 0) {
            const [lo, hi] = from <= to ? [from, to] : [to, from];
            return new Set(libraries.slice(lo, hi + 1).map((l) => l.id));
          }
        }
        if (toggle) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        // 普通点击：只选中这一个（再次点击取消）
        if (next.size === 1 && next.has(id)) return new Set();
        return new Set([id]);
      });

      if (!shift) setAnchorId(id);
    },
    [anchorId, libraries]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId("");
  }, []);

  /** 选中的库中，非默认项（默认库可选中，但不参与批量操作 —— 人类决策） */
  const actionableSelected = useMemo(
    () =>
      libraries.filter(
        (lib) => selectedIds.has(lib.id) && lib.id !== DEFAULT_TERMS_LIBRARY_ID
      ),
    [libraries, selectedIds]
  );

  /** 批量启用/禁用（默认库不参与） */
  const handleBulkToggle = useCallback(
    async (enabled) => {
      for (const lib of actionableSelected) {
        await updateLibrary(lib.id, { enabled });
      }
      clearSelection();
    },
    [actionableSelected, updateLibrary, clearSelection]
  );

  /** 批量更新订阅（只更新选中的订阅库；无选中时更新全部 —— 人类决策） */
  const handleBulkSync = useCallback(async () => {
    const targets =
      selectedIds.size === 0
        ? libraries.filter((lib) => lib.source?.type === "subscription")
        : actionableSelected.filter((lib) => lib.source?.type === "subscription");
    let ok = 0;
    let failed = 0;
    for (const lib of targets) {
      const url = lib.source?.url;
      if (!url) continue;
      try {
        const r = await syncOne(url);
        if (r.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    // 刷新缓存元信息，让卡片上的条数/署名更新
    const next = {};
    for (const lib of libraries) {
      const url = lib.source?.url;
      if (lib.source?.type !== "subscription" || !url) continue;
      try {
        const cached = await getSubTerms(url);
        if (cached) {
          next[url] = {
            entries: cached.entries || 0,
            meta: cached.meta || null,
            author: cached.author || "",
          };
        }
      } catch {
        // 忽略单个读缓存失败
      }
    }
    setSubMeta(next);
    if (failed > 0) {
      alert.error(
        i18nParams(i18n, "terms_sync_summary_failed", { ok, failed })
      );
    } else if (ok > 0) {
      alert.success(i18nParams(i18n, "terms_sync_summary_ok", { ok }));
    }
    clearSelection();
  }, [selectedIds, libraries, actionableSelected, syncOne, alert, i18n, clearSelection]);

  /** 选中集合里有可更新的订阅库吗（无选中时视为"全部"，只要存在订阅库即可） */
  const hasSyncableTarget = useMemo(() => {
    if (selectedIds.size === 0) {
      return libraries.some((lib) => lib.source?.type === "subscription");
    }
    return actionableSelected.some(
      (lib) => lib.source?.type === "subscription"
    );
  }, [selectedIds, libraries, actionableSelected]);

  // 加载所有订阅库的缓存元信息（用于卡片显示条数与署名）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const lib of libraries) {
        const url = lib.source?.url;
        if (lib.source?.type !== "subscription" || !url) continue;
        try {
          const cached = await getSubTerms(url);
          if (cached) {
            next[url] = {
              entries: cached.entries || 0,
              meta: cached.meta || null,
              author: cached.author || "",
            };
          }
        } catch {
          // 读缓存失败不影响列表渲染
        }
      }
      if (!cancelled) setSubMeta(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [libraries]);

  const openLib = useMemo(
    () => libraries.find((lib) => lib.id === openId) || null,
    [libraries, openId]
  );

  const entryCountOf = useCallback(
    (lib) => {
      if (lib.source?.type === "subscription") {
        return subMeta[lib.source.url]?.entries || 0;
      }
      if (!lib.terms) return 0;
      return parseTerms(lib.terms, { fullDiagnostics: false }).terms.length;
    },
    [subMeta]
  );

  const authorOf = useCallback(
    (lib) =>
      lib.source?.type === "subscription"
        ? subMeta[lib.source.url]?.author || ""
        : "",
    [subMeta]
  );

  // --- 列表页交互 ---

  const handleAddLibrary = useCallback(async () => {
    const id = await addLibrary({ name: "" });
    setOpenId(id); // 新建后直接进详情页命名，符合"先建库再填词"的心智
  }, [addLibrary]);

  const handleAddSubscription = useCallback(async () => {
    const url = newSubUrl.trim();
    if (!url) return;
    // 追加到末尾（人类决策：新建/订阅统一往后放，不悄悄改变现有翻译结果）
    const id = await addSubTerms(url);
    if (id) {
      setNewSubUrl("");
      setOpenId(id);
      alert.success(i18n("terms_subscription_added"));
    }
  }, [newSubUrl, addSubTerms, alert, i18n]);

  const handleDelete = useCallback(
    async (lib) => {
      const ok = await confirm({
        message: i18n("terms_delete_confirm"),
        confirmText: i18n("delete"),
        cancelText: i18n("cancel"),
      });
      if (!ok) return;
      await removeLibrary(lib.id);
      if (lib.source?.type === "subscription" && lib.source.url) {
        await delSubTerms(lib.source.url);
      }
      setOpenId(null);
    },
    [confirm, i18n, removeLibrary, delSubTerms]
  );

  const handleSyncOne = useCallback(
    async (lib) => {
      const url = lib.source?.url;
      if (!url) return;
      setSyncingId(lib.id);
      try {
        const r = await syncOne(url);
        if (r.ok) {
          alert.success(
            i18nParams(i18n, "terms_sync_ok", {
              count: r.parsed?.entries ?? 0,
            })
          );
          const cached = await getSubTerms(url);
          if (cached) {
            setSubMeta((prev) => ({
              ...prev,
              [url]: {
                entries: cached.entries || 0,
                meta: cached.meta || null,
                author: cached.author || "",
              },
            }));
          }
        } else {
          alert.error(String(r.error?.message || r.error));
        }
      } finally {
        setSyncingId("");
      }
    },
    [syncOne, alert, i18n]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId("");
    setDragOverId("");
  }, []);

  const handleDrop = useCallback(
    (targetId) => {
      if (draggingId && draggingId !== targetId) {
        reorderLibraries(draggingId, targetId);
      }
      handleDragEnd();
    },
    [draggingId, reorderLibraries, handleDragEnd]
  );

  // --- 详情页 ---

  if (openLib) {
    return (
      <LibraryDetail
        lib={openLib}
        isDefault={openLib.id === DEFAULT_TERMS_LIBRARY_ID}
        i18n={i18n}
        alert={alert}
        onBack={() => setOpenId(null)}
        onDelete={() => handleDelete(openLib)}
        onSync={() => handleSyncOne(openLib)}
        syncing={syncingId === openLib.id}
        updateLibrary={updateLibrary}
        setLibraryTerms={setLibraryTerms}
        appendLibraryTerms={appendLibraryTerms}
        subCache={subMeta[openLib.source?.url] || null}
        selectedRules={selectedRules}
        allLibraries={libraries}
        libraries={libraries}
      />
    );
  }

  return (
    <Box>
      {/* 页面标题与描述由 Layout.js 统一渲染，此处不重复 */}

      {isLoading ? (
        <Typography color="text.secondary">{i18n("loading")}</Typography>
      ) : (
        <>
          {/* 默认库上方的说明：点击卡片 = 选中；进编辑走 ✏️ */}
          <Alert severity="info" sx={{ mb: 2 }} data-testid="terms-intro">
            {i18n("terms_library_intro")}
          </Alert>

          {/* 批量工具条：常显（无选中时"更新订阅"默认更新全部 —— 人类决策） */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 1.5, minHeight: 40 }}
            data-testid="terms-bulk-bar"
          >
            <Chip
              size="small"
              color={selectedIds.size > 0 ? "primary" : "default"}
              label={i18nParams(i18n, "terms_selected_count", {
                count: selectedIds.size,
              })}
            />
            <Button
              size="small"
              variant="outlined"
              disabled={actionableSelected.length === 0}
              onClick={() => handleBulkToggle(true)}
            >
              {i18n("terms_bulk_enable")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={actionableSelected.length === 0}
              onClick={() => handleBulkToggle(false)}
            >
              {i18n("terms_bulk_disable")}
            </Button>
            <Tooltip
              title={
                hasSyncableTarget
                  ? i18n("terms_bulk_sync_helper")
                  : i18n("terms_bulk_sync_no_target")
              }
            >
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  disabled={!hasSyncableTarget}
                  onClick={handleBulkSync}
                >
                  {i18n("terms_bulk_sync")}
                </Button>
              </span>
            </Tooltip>
            {selectedIds.size > 0 && (
              <Button size="small" onClick={clearSelection}>
                {i18n("terms_clear_selection")}
              </Button>
            )}
          </Stack>

          <List className="kt-terms-list" sx={{ py: 0 }}>
            {libraries.map((lib, index) => {
              const isDefault = lib.id === DEFAULT_TERMS_LIBRARY_ID;
              return (
                <LibraryCard
                  key={lib.id}
                  lib={lib}
                  index={index}
                  isDefault={isDefault}
                  selected={selectedIds.has(lib.id)}
                  entryCount={entryCountOf(lib)}
                  author={authorOf(lib)}
                  isDragging={draggingId === lib.id}
                  isDragOver={dragOverId === lib.id}
                  i18n={i18n}
                  onClick={(e) => handleCardClick(lib, e)}
                  onEdit={() => setOpenId(lib.id)}
                  onDelete={() => handleDelete(lib)}
                  onToggle={(checked) =>
                    updateLibrary(lib.id, { enabled: checked })
                  }
                  onDragStart={() => setDraggingId(lib.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => {
                    if (isDefault) return;
                    e.preventDefault();
                    setDragOverId(lib.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(lib.id);
                  }}
                  onMove={(dir) => moveLibrary(lib.id, dir)}
                  canMoveUp={index > 1}
                  canMoveDown={index < libraries.length - 1}
                />
              );
            })}
          </List>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddLibrary}
            >
              {i18n("terms_new_library")}
            </Button>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {i18n("terms_add_subscription")}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1 }}
              data-testid="terms-sub-helper"
            >
              {i18n("terms_add_subscription_helper")}
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
                placeholder="https://example.com/terms.json"
                inputProps={{ "data-testid": "terms-sub-url-input" }}
              />
              <Button variant="outlined" onClick={handleAddSubscription}>
                {i18n("add")}
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}

/** 库详情页：编辑元信息与正文（订阅库正文只读） */
function LibraryDetail({
  lib,
  isDefault,
  i18n,
  alert,
  onBack,
  onDelete,
  onSync,
  syncing,
  updateLibrary,
  setLibraryTerms,
  appendLibraryTerms,
  subCache,
  selectedRules,
  allLibraries,
}) {
  const isSubscription = lib.source?.type === "subscription";
  const [draftName, setDraftName] = useState(lib.name || "");
  const [draftDesc, setDraftDesc] = useState(lib.description || "");
  const [draftTerms, setDraftTerms] = useState(lib.terms || "");

  // 切换库时重置草稿
  useEffect(() => {
    setDraftName(lib.name || "");
    setDraftDesc(lib.description || "");
    setDraftTerms(lib.terms || "");
  }, [lib.id, lib.name, lib.description, lib.terms]);

  const parsed = useMemo(
    () =>
      parseTerms(draftTerms, {
        fullDiagnostics:
          draftTerms.length <= TERMS_FULL_DIAGNOSTICS_MAX_CHARS,
      }),
    [draftTerms]
  );

  const overLimit = parsed.terms.length > TERMS_LIBRARY_MAX_ENTRIES;

  // 订阅库正文来自缓存（只读展示）
  const subscriptionText = subCache ? subCache.entries : 0;

  // 合成预览：按加载顺序（前覆盖后）
  const composed = useMemo(() => {
    const sources = allLibraries
      .filter((l) => l.enabled !== false)
      .map((l) => ({
        id: l.id,
        name: l.id === DEFAULT_TERMS_LIBRARY_ID ? i18n("terms_library_default_name") : l.name,
        text:
          l.id === lib.id
            ? draftTerms
            : l.source?.type === "subscription"
              ? "" // 订阅正文从缓存读取，此处由页面外部提供；列表页预览不展开
              : l.terms,
      }));
    // 当前正在编辑的库用草稿值，保证预览实时
    if (!sources.some((s) => s.id === lib.id)) {
      sources.push({ id: lib.id, name: lib.name, text: draftTerms });
    }
    return composeSources(sources);
  }, [allLibraries, draftTerms, lib.id, lib.name, i18n]);

  const handleImport = useCallback(
    async (file) => {
      const text =
        typeof file === "string" ? file : await file.text?.() ?? String(file);
      const format = resolveFormat(file?.name, text);
      const result = parseImport(text, format);
      if (!result.ok) {
        alert.error(
          i18nParams(i18n, "terms_import_partial", {
            count: result.errors?.length || 0,
          })
        );
        return;
      }
      await appendLibraryTerms(lib.id, result.text);
      setDraftTerms((prev) => (prev ? `${prev}\n${result.text}` : result.text));
      alert.success(
        i18nParams(i18n, "terms_import_ok", { count: result.entries })
      );
    },
    [appendLibraryTerms, lib.id, alert, i18n]
  );

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
        {i18n("terms_back_to_list")}
      </Button>

      <Stack spacing={2}>
        {/* 库名：默认库名固定由 i18n 提供，不可改 */}
        <TextField
          label={i18n("terms_library_name")}
          size="small"
          fullWidth
          value={isDefault ? i18n("terms_library_default_name") : draftName}
          disabled={isDefault}
          required
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => updateLibrary(lib.id, { name: draftName })}
          inputProps={{ "data-testid": "terms-lib-name" }}
        />

        <TextField
          label={i18n("terms_library_description")}
          size="small"
          fullWidth
          multiline
          minRows={1}
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          onBlur={() => updateLibrary(lib.id, { description: draftDesc })}
          inputProps={{ "data-testid": "terms-lib-desc" }}
        />

        {isSubscription && (
          <Alert severity="info">
            <Typography variant="body2">
              {i18n("terms_subscription_readonly")}
            </Typography>
            {lib.source?.url && (
              <Typography
                variant="caption"
                sx={{ wordBreak: "break-all", display: "block", mt: 0.5 }}
              >
                {lib.source.url}
              </Typography>
            )}
            {subCache?.author && (
              <Typography variant="caption" sx={{ display: "block" }}>
                {subCache.author}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                disabled={syncing}
                onClick={onSync}
              >
                {i18n("sync_now")}
              </Button>
            </Stack>
          </Alert>
        )}

        {!isSubscription && (
          <>
            <TextField
              label={i18n("terms_custom")}
              multiline
              minRows={8}
              fullWidth
              value={draftTerms}
              onChange={(e) => setDraftTerms(e.target.value)}
              onBlur={() => setLibraryTerms(lib.id, draftTerms)}
              inputProps={{ "data-testid": "terms-custom-input" }}
            />

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <UploadButton
                size="small"
                onFile={handleImport}
                fileExts={[".txt", ".csv", ".json"]}
              >
                {i18n("import")}
              </UploadButton>
              <DownloadButton
                size="small"
                data={draftTerms}
                filename={`${lib.name || "terms"}.txt`}
              >
                {i18n("export")}
              </DownloadButton>
            </Stack>

            {/* 按钮缺说明会让人不知道能导什么、导入后发生什么 */}
            <Typography
              variant="caption"
              color="text.secondary"
              data-testid="terms-io-helper"
            >
              {i18n("terms_import_helper")}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              data-testid="terms-export-helper"
            >
              {i18n("terms_export_helper")}
            </Typography>
          </>
        )}

        {!isSubscription && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={i18nParams(i18n, "terms_count", {
                count: parsed.terms.length,
              })}
            />
            {overLimit && (
              <Alert severity="warning" sx={{ py: 0 }}>
                {i18nParams(i18n, "terms_over_limit", {
                  max: TERMS_LIBRARY_MAX_ENTRIES,
                })}
              </Alert>
            )}
          </Stack>
        )}

        {isSubscription && (
          <Chip
            size="small"
            label={i18nParams(i18n, "terms_count", {
              count: subscriptionText,
            })}
          />
        )}

        {!isSubscription && parsed.invalid.length > 0 && (
          <Alert severity="error">
            {i18nParams(i18n, "terms_invalid", {
              count: parsed.invalid.length,
            })}
          </Alert>
        )}

        {!isSubscription && parsed.metaWarnings.length > 0 && (
          <Alert severity="warning">
            {i18nParams(i18n, "terms_meta_warning", {
              count: parsed.metaWarnings.length,
            })}
          </Alert>
        )}

        {/* 跨库被覆盖条目：让用户看到"为什么某个词没生效" */}
        {composed.shadowed.length > 0 && (
          <Alert severity="info">
            <Typography variant="body2">
              {i18nParams(i18n, "terms_shadowed", {
                count: composed.shadowed.length,
              })}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {i18n("terms_shadowed_helper")}
            </Typography>
          </Alert>
        )}

        {/* 同库内冲突 */}
        {composed.sameLayerConflicts.length > 0 && (
          <Alert severity="error">
            {i18nParams(i18n, "terms_same_layer_conflict", {
              count: composed.sameLayerConflicts.length,
            })}
          </Alert>
        )}

        {/* 被更高优先级库覆盖而退出文本的同库冲突（parseTerms 看不到） */}
        {composed.evictedSameLayerConflicts?.length > 0 && (
          <Alert severity="warning">
            {i18nParams(i18n, "terms_evicted_conflict", {
              count: composed.evictedSameLayerConflicts.length,
            })}
          </Alert>
        )}

        {/* 删除：默认库不可删（人类决策 D1） */}
        {!isDefault && (
          <Box>
            <Button
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={onDelete}
            >
              {i18n("terms_delete_library")}
            </Button>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
