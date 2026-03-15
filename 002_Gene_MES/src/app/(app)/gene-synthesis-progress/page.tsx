import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function GeneSynthesisProgressPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
            <CardHeader>
                <div className="flex justify-center mb-4">
                    <FileText className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>Gene Tracker</CardTitle>
                <CardDescription>Track your gene orders.</CardDescription>
            </CardHeader>
             <CardContent>
                <p className="text-muted-foreground">
                    This page is under construction.
                </p>
            </CardContent>
        </Card>
    </div>
  );
}
