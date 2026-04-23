import { Suspense } from "react";

import { DemoTerminal } from "../../../components/DemoTerminal";

export default function TerminalDemoPage() {
  return (
    <Suspense fallback={null}>
      <DemoTerminal />
    </Suspense>
  );
}
