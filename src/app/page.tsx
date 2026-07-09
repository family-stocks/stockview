import ReportTable from "@/components/ReportTable";

export default function DashboardPage() {
  return (
    <div className="container dashboard-page">
      <header className="dashboard-hero">
        <div>
          <span className="eyebrow">Live equity research terminal</span>
          <h1>Research Dashboard</h1>
          <p>
            Scan model-generated equity calls, compare trade plans, and open the full report when a ticker needs deeper work.
          </p>
        </div>
        <div className="hero-terminal-card" aria-hidden="true">
          <span>SCANNER</span>
          <strong>Latest agent reports</strong>
          <small>Targets, stops, filings, and full thesis links in one workflow.</small>
        </div>
      </header>

      <ReportTable />
    </div>
  );
}
