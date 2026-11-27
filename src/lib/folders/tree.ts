export interface FolderNodeInput {
  id: string;
  parentId: string | null;
  name: string;
}

/**
 * Checks whether moving `folderId` under `nextParentId` creates a cycle in the hierarchy
 * (including self-parenting or assigning any descendant of `folderId` as its parent).
 */
export function wouldCreateFolderCycle(
  folders: ReadonlyArray<{ id: string; parentId: string | null }>,
  folderId: string,
  nextParentId: string | null
): boolean {
  if (!nextParentId) return false;
  if (nextParentId === folderId) return true;

  const parentMap = new Map<string, string | null>();
  for (const f of folders) {
    parentMap.set(f.id, f.parentId);
  }

  const visited = new Set<string>([folderId]);
  let cursor: string | null | undefined = nextParentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parentMap.get(cursor) ?? null;
  }
  return false;
}

export type FolderTreeNode<T extends FolderNodeInput> = T & {
  children: Array<FolderTreeNode<T>>;
};

/** Builds a deterministically sorted folder hierarchy tree (roots ordered alphabetically). */
export function buildFolderTree<T extends FolderNodeInput>(
  folders: ReadonlyArray<T>
): Array<FolderTreeNode<T>> {
  const map = new Map<string, FolderTreeNode<T>>();
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  const roots: Array<FolderTreeNode<T>> = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (list: Array<FolderTreeNode<T>>) => {
    list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    for (const item of list) sortRec(item.children);
  };
  sortRec(roots);
  return roots;
}
