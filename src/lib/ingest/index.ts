import { directUpload } from "./direct";
import { urlImport } from "./url";
import type { IngestMethod } from "./types";

/** Register new ingest methods here (e.g. FTP drop, resolved Drive/Dropbox links). */
export const ingestMethods: Record<string, IngestMethod<any, any>> = {
  DIRECT: directUpload,
  URL: urlImport,
};

export { finalizeIngest, failVideo } from "./finalize";
