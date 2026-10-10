import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GitFork } from "lucide-react";

export default function PipelinesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
            <CardHeader>
                <div className="flex justify-center mb-4">
                    <GitFork className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>Pipelines</CardTitle>
                <CardDescription>Define and manage your automated workflows.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">
                    This is where you will be able to chain your modular steps together to create powerful, automated pipelines for your lab experiments.
                </p>
                <p className="mt-4 font-semibold text-primary">
                    This feature is coming soon!
                </p>
            </CardContent>
        </Card>
    </div>
  );
}
