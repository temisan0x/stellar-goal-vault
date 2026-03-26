import { OpenIssue } from "../types/campaign";

interface IssueBacklogProps {
  issues: OpenIssue[];
  isLoading?: boolean;
}
export function IssueBacklog({ issues, isLoading }: IssueBacklogProps) {
  return (
    <section className="card">
      <div className="section-heading">
        <h2>Contribution backlog</h2>
        <p className="muted">Ready-to-open issue ideas for your public repo after you push it.</p>
      </div>

      <div className="issue-list">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <article key={idx} className="issue-item">
              <div className="issue-topline">
                <div className="skeleton skeleton-line" style={{ width: 180 }} />
                <div className="skeleton skeleton-line" style={{ width: 48, height: 20 }} />
              </div>
              <div className="skeleton skeleton-line" style={{ width: '100%', height: 36, marginTop: 8 }} />
              <div className="chip-row" style={{ marginTop: 8 }}>
                <div className="skeleton skeleton-line" style={{ width: 80, height: 28 }} />
                <div className="skeleton skeleton-line" style={{ width: 80, height: 28 }} />
              </div>
            </article>
          ))
        ) : (
          issues.map((issue) => (
            <article key={issue.id} className="issue-item">
              <div className="issue-topline">
                <strong>{issue.title}</strong>
                <span className="badge badge-neutral">{issue.points} pts</span>
              </div>
              <p>{issue.summary}</p>
              <div className="chip-row">
                {issue.labels.map((label) => (
                  <span key={label} className="chip">
                    {label}
                  </span>
                ))}
                <span className="chip-emphasis">{issue.complexity}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
