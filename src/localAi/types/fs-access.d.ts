interface FileSystemFileHandle {
  move(newName: string): Promise<void>;
  move(
    destinationDirectory: FileSystemDirectoryHandle,
    newName?: string
  ): Promise<void>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}
