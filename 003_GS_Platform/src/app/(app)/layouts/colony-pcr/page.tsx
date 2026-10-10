import { ColonyPcrLayoutClient } from "./_components/colony-pcr-layout-client";

export default function ColonyPcrLayoutPage() {
    return (
        <div className="space-y-4 p-4">
            <h1 className="text-2xl font-semibold">Colony PCR Layout</h1>
            <ColonyPcrLayoutClient />
        </div>
    );
}