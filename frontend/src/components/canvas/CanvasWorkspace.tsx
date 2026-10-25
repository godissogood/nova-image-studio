"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderOpen, Layers, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CanvasEditor } from "./CanvasEditor";
import { CanvasThumbnail } from "./components/canvas-thumbnail";
import { useCanvasStore } from "./stores/use-canvas-store";
import { exportCanvasProjects, importCanvasProjectsFromZip } from "./utils/canvas-export";

type CanvasWorkspaceProps = {
  wideMode?: boolean;
  onConfigureApiKey: () => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  showPromptGallery?: boolean;
};

type SortMode = "updated" | "created" | "name";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "updated", label: "最近修改" },
  { value: "created", label: "创建时间" },
  { value: "name", label: "名称" },
];

/** 宽屏：4 列 × 2 行 = 8 / 页；非宽屏：3 列 × 3 行 = 9 / 页。超出翻页。 */
const WIDE_PAGE_SIZE = 8;
const NARROW_PAGE_SIZE = 9;

export function CanvasWorkspace({ wideMode, onConfigureApiKey, showToast, showPromptGallery }: CanvasWorkspaceProps) {
  const hydrated = useCanvasStore((state) => state.hydrated);
  const projects = useCanvasStore((state) => state.projects);
  const createProject = useCanvasStore((state) => state.createProject);
  const renameProject = useCanvasStore((state) => state.renameProject);
  const deleteProjects = useCanvasStore((state) => state.deleteProjects);
  const importProject = useCanvasStore((state) => state.importProject);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [pageIndex, setPageIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const sortedProjects = useMemo(() => {
    const list = [...projects];
    if (sortMode === "name") list.sort((a, b) => a.title.localeCompare(b.title, "zh"));
    else if (sortMode === "created") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [projects, sortMode]);

  const pageSize = wideMode ? WIDE_PAGE_SIZE : NARROW_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sortedProjects.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageProjects = sortedProjects.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize);
  const showPager = sortedProjects.length > pageSize;

  if (activeProjectId) {
    return (
      <div className="relative h-[min(70dvh,52rem)] min-h-96 w-full overflow-hidden rounded-2xl border border-border bg-card">
        <CanvasEditor projectId={activeProjectId} onBack={() => setActiveProjectId(null)} onRequireApiKey={onConfigureApiKey} showToast={showToast} showPromptGallery={showPromptGallery} />
      </div>
    );
  }

  const handleImport = async (file: File) => {
    try {
      const imported = await importCanvasProjectsFromZip(file);
      imported.forEach((project) => importProject(project));
      showToast(`已导入 ${imported.length} 个画布`, "success");
    } catch {
      showToast("导入失败，请确认是导出的画布 zip", "error");
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", wideMode && "h-full flex-1")}>
      {projects.length > 0 && (
        <div className="flex shrink-0 items-center justify-start">
          <Select
            value={sortMode}
            onValueChange={setSortMode}
            options={SORT_OPTIONS}
            size="sm"
            className="w-auto min-w-[7.5rem] focus-visible:ring-1"
            contentClassName="min-w-32"
            ariaLabel="画布排序"
          />
        </div>
      )}

      <div className={cn(wideMode ? "min-h-0 flex-1" : "w-full")}>
        {!mounted || !hydrated ? (
          <div className={cn("grid place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground", wideMode ? "h-full" : "py-16")}>加载中…</div>
        ) : projects.length === 0 ? (
          <div className={cn("grid place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground", wideMode ? "h-full" : "py-16")}>
            <div className="flex flex-col items-center gap-2 leading-relaxed">
              <Layers className="size-8" />
              还没有画布，可在下方新建
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3",
              // 宽屏：4×2=8/页；非宽屏：一行 3 个，满 9 个一页，第 10 个起翻页
              wideMode ? "h-full grid-cols-4 grid-rows-2" : "grid-cols-3"
            )}
          >
            {pageProjects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40",
                  wideMode && "h-full min-h-0"
                )}
              >
                <button
                  type="button"
                  className="mb-2 block w-full shrink-0 overflow-hidden"
                  aria-label="打开画布"
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <CanvasThumbnail nodes={project.nodes} className="aspect-[3/2]" />
                </button>

                <div className={cn("flex shrink-0 flex-col gap-1", wideMode && "mt-auto")}>
                  {editingId === project.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        renameProject(project.id, editingTitle);
                        setEditingId(null);
                      }}
                    >
                      <Input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => { renameProject(project.id, editingTitle); setEditingId(null); }} />
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-md text-left transition-colors hover:text-primary"
                      title="点击重命名"
                      onClick={() => { setEditingId(project.id); setEditingTitle(project.title); }}
                    >
                      <span className="line-clamp-1 text-sm font-medium leading-5">{project.title}</span>
                    </button>
                  )}

                  <p className="line-clamp-1 text-[11px] leading-4 text-muted-foreground">
                    {project.nodes.length} 个节点 · {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>

                  <div className="flex items-center gap-1">
                    <Button variant="secondary" size="sm" className="h-7 flex-1 text-xs" onClick={() => setActiveProjectId(project.id)}>
                      <FolderOpen className="size-3.5" />
                      打开
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="size-7" aria-label="导出" onClick={() => void exportCanvasProjects([project], project.title || "无限画布")}>
                      <Download className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="size-7" aria-label="删除" onClick={() => setDeleteId(project.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cn("flex shrink-0 items-center justify-center py-1", wideMode && "mt-auto")}>
        <input ref={importInputRef} type="file" accept=".zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImport(file); event.target.value = ""; }} />
        <div className={cn("flex w-full max-w-3xl items-center", showPager ? "justify-between gap-8" : "justify-center gap-4")}>
          {showPager && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-12 shrink-0 rounded-full border-primary/30 bg-background text-primary shadow-md hover:border-primary hover:bg-primary/5 disabled:opacity-35"
              disabled={safePageIndex <= 0}
              aria-label="上一页画布"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="size-6" />
            </Button>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-11 min-w-32 rounded-full border-primary/30 bg-background px-5 text-sm shadow-sm hover:border-primary hover:bg-primary/5"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="size-4" />
              导入
            </Button>
            {showPager && (
              <span className="min-w-20 px-1 text-center text-sm tabular-nums text-muted-foreground">
                {safePageIndex + 1}/{pageCount} · {sortedProjects.length}个
              </span>
            )}
            <Button
              size="lg"
              className="h-11 min-w-36 rounded-full px-6 text-sm shadow-md"
              onClick={() => setActiveProjectId(createProject())}
            >
              <Plus className="size-4" />
              新建画布
            </Button>
          </div>

          {showPager && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-12 shrink-0 rounded-full border-primary/30 bg-background text-primary shadow-md hover:border-primary hover:bg-primary/5 disabled:opacity-35"
              disabled={safePageIndex >= pageCount - 1}
              aria-label="下一页画布"
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
            >
              <ChevronRight className="size-6" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除画布</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">删除后无法恢复（未被其他画布引用的图片和媒体会从本地清理）。确定删除该画布吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteId) deleteProjects([deleteId]);
                setDeleteId(null);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
