import { LigationLayoutClient } from "./_components/ligation-layout-client";

export default function LigationLayoutPage() {
    return (
        <div className="space-y-4 p-4">
            <h1 className="text-2xl font-semibold">Ligation Layout</h1>
            <LigationLayoutClient />
        </div>
    );
}