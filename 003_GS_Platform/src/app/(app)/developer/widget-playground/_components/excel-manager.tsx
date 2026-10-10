"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function ExcelManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Excel Integration</CardTitle>
        <CardDescription>
          Import data by uploading an Excel file or export your current plate layout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
            <h3 className="font-medium">Export Layout</h3>
            <Button variant="outline" disabled>
                <Download className="h-4 w-4" />
                Export to Excel (Coming soon)
            </Button>
        </div>

      </CardContent>
    </Card>
  );
}
