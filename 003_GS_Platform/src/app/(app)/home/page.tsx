import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Home } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
            <CardHeader>
                <div className="flex justify-center mb-4">
                    <Home className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>Welcome to Gene Synthesis</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">
                    Your gene synthesis journey starts here.
                </p>
            </CardContent>
        </Card>
    </div>
  );
}
