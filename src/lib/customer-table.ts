import { cache } from "react";
import { findPublicTable } from "@/lib/domain/queries";

/** Mesa por token, memoizada por request (layout, metadata y página la piden). */
export const getCustomerTable = cache((token: string) => findPublicTable(token));
