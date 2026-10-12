import { ArrowDownRight, ArrowUpRight, CalendarClock, Clock3, Flag } from "lucide-react";
import type { ResearchReport } from "@/lib/supabase";

export function formatHorizon(report: ResearchReport) {
  if (report.horizon_length === null || !report.horizon_unit) return "Not specified";
  return `${report.horizon_length} ${report.horizon_unit.replaceAll("_", " ")}`;
}

export function formatAllocation(value: number | null) {
  return value === null ? "Not specified" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatReviewDate(value: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export default function ReviewCheckpoints({ report }: { report: ResearchReport }) {
  const deadline = new Date(report.review_deadline_utc);
  const validDeadline = Number.isFinite(deadline.getTime());
  const hasCheckpoints = report.price_triggers.length > 0 || report.event_triggers.length > 0;

  return (
    <section className="review-panel" aria-label="Review checkpoints">
      <header className="review-header">
        <div><span className="review-kicker">THESIS MONITOR</span><h2>Review checkpoints</h2></div>
        <span className="review-label"><CalendarClock size={15} aria-hidden="true" /> Review plan</span>
      </header>
      <div className="review-facts">
        <div><span>Proposed allocation</span><strong>{formatAllocation(report.position_pct)}</strong><small>Model plan · share of portfolio</small></div>
        <div><span>Investment horizon</span><strong>{formatHorizon(report)}</strong><small>Expected thesis timeframe</small></div>
        <div><span>Review by</span><strong>{formatReviewDate(report.review_deadline_utc)}</strong>
          <small>{validDeadline ? `${deadline.toISOString().slice(11, 16)} UTC` : "No deadline in this report"}</small></div>
        <div><span>Maximum review interval</span><strong>{report.reassessment_max_wait_hours === null ? "Not specified" : `${report.reassessment_max_wait_hours} hours`}</strong><small>Reassess sooner if a condition occurs</small></div>
      </div>
      {report.reassessment_rationale && <p className="review-rationale"><Clock3 size={17} aria-hidden="true" /><span>{report.reassessment_rationale}</span></p>}
      {hasCheckpoints ? (
        <div className="checkpoint-columns">
          <div>
            <h3>Price checkpoints <span>{report.price_triggers.length}</span></h3>
            {report.price_triggers.length ? <ul className="checkpoint-list">
              {report.price_triggers.map((trigger, index) => {
                const above = trigger.direction === "crosses_above";
                const below = trigger.direction === "crosses_below";
                const Icon = above ? ArrowUpRight : below ? ArrowDownRight : Flag;
                return <li key={index}>
                  <span className="checkpoint-marker"><Icon size={17} aria-hidden="true" /></span>
                  <div><div className="checkpoint-condition"><strong>{above ? "Crosses above" : below ? "Crosses below" : trigger.direction.replaceAll("_", " ") || "Price level"} {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(trigger.price)}</strong></div>
                    {trigger.confirmation && <span className="checkpoint-confirmation">{trigger.confirmation === "daily_close" ? "Confirm at daily close" : trigger.confirmation.replaceAll("_", " ")}</span>}
                    {trigger.rationale && <p>{trigger.rationale}</p>}
                  </div>
                </li>;
              })}
            </ul> : <p className="checkpoint-empty">No price conditions specified.</p>}
          </div>
          <div>
            <h3>Event checkpoints <span>{report.event_triggers.length}</span></h3>
            {report.event_triggers.length ? <ul className="checkpoint-list">
              {report.event_triggers.map((trigger, index) => <li key={index}>
                <span className="checkpoint-marker"><Flag size={16} aria-hidden="true" /></span>
                <div><strong>{trigger.condition}</strong>{trigger.rationale && <p>{trigger.rationale}</p>}</div>
              </li>)}
            </ul> : <p className="checkpoint-empty">No event conditions specified.</p>}
          </div>
        </div>
      ) : <p className="checkpoint-empty">This report does not specify price or event checkpoints.</p>}
      {hasCheckpoints && <footer className="review-footer">Conditions to revisit the thesis. Trigger occurrence has not been checked.</footer>}
    </section>
  );
}
