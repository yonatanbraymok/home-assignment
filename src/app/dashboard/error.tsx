"use client"; // error boundaries must be Client Components

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Shown instead of Next's whole-page error screen when loading dashboard data fails, e.g. a
// short database outage. The dashboard only reads, so nothing can be half-changed.
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Couldn&apos;t load your data</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>This is usually a short hiccup reaching the database. Nothing was changed.{error.digest && ` (Reference: ${error.digest})`}</p>
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
