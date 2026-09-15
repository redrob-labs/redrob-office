import si from "systeminformation";

export interface DiskAvailability {
  mount: string;
  freeBytes: number;
  totalBytes: number;
}

/**
 * Free space on the volume that will hold models.
 * Uses systeminformation so Windows drive letters work.
 */
export async function detectFreeDisk(targetPath?: string): Promise<DiskAvailability> {
  const sizes = await si.fsSize();
  if (sizes.length === 0) {
    throw new Error("Unable to read filesystem sizes for model pack planning");
  }

  const normalized = (targetPath ?? process.cwd()).replaceAll("\\", "/").toLowerCase();
  const match =
    sizes.find((entry) => {
      const mount = entry.mount.replaceAll("\\", "/").toLowerCase();
      return normalized.startsWith(mount.replace(/\/$/, ""));
    }) ?? sizes[0];

  if (!match) {
    throw new Error("No filesystem mount available for model pack planning");
  }

  return {
    mount: match.mount,
    freeBytes: match.available,
    totalBytes: match.size,
  };
}
