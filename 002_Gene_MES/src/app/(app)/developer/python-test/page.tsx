'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { runPythonScript } from '@/app/actions';
import { Play, Loader2, Code2 } from 'lucide-react';

export default function PythonTestPage() {
    const [input, setInput] = useState('{"test": "data", "items": [1, 2, 3]}');
    const [output, setOutput] = useState<any>(null);
    const [isPending, startTransition] = useTransition();

    const handleRunScript = () => {
        startTransition(async () => {
            try {
                const jsonData = JSON.parse(input);
                const result = await runPythonScript('process_data.py', jsonData) as any;
                setOutput(result);
            } catch (e: any) {
                setOutput({ success: false, message: 'Invalid JSON input or script error: ' + e.message });
            }
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Code2 className="w-6 h-6" /> Python Integration Test
                    </CardTitle>
                    <CardDescription>
                        Test calling a Python script from the Node.js backend. This script resides in the `/scripts` directory.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">JSON Input to Script</label>
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            rows={5}
                            className="font-mono"
                        />
                    </div>
                    <Button onClick={handleRunScript} disabled={isPending}>
                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Run Python Script
                    </Button>

                    {output && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Output</label>
                            <pre className="p-4 rounded-md bg-muted overflow-auto max-h-[400px] text-xs">
                                {JSON.stringify(output, null, 2)}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>How it works</CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                    <p>
                        The application uses the <code>child_process.spawn</code> method to execute Python scripts on the server.
                        Data is passed to the script as a JSON string via command-line arguments (or could be via stdin for larger datasets).
                    </p>
                    <p>
                        <strong>Advantages:</strong>
                    </p>
                    <ul>
                        <li>Keep your existing Python logic (Pandas, OpenPyXL, etc.).</li>
                        <li>No need to rewrite complex algorithms in JavaScript.</li>
                        <li>Leverage the best of both worlds: React/Next.js for the UI and Python for data science.</li>
                    </ul>
                    <p>
                        <strong>Note:</strong> Ensure <code>python3</code> is installed in the environment where the app is running.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
