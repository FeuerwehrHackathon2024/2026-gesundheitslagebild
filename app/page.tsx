import { Header } from '@/components/panels/Header';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { TimelineStrip } from '@/components/panels/TimelineStrip';
import { MapContainer } from '@/components/map/MapContainer';
import { SimEngine } from '@/components/SimEngine';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';

export default function HomePage() {
  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden">
      <SimEngine />
      <KeyboardShortcuts />
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <LeftPanel />
        <MapContainer />
        <RightPanel />
      </div>
      <TimelineStrip />
    </main>
  );
}
