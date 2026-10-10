import { ExtractionLayoutClient } from "./_components/extraction-layout-client";

export default function ExtractionLayoutPage() {
    return (
        <div className="space-y-4 p-4">
            <h1 className="text-2xl font-semibold">Extraction Layout</h1>
            <ExtractionLayoutClient />
        </div>
    );
}