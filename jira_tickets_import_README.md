# Jira ticket import — prepped from bug_fixes_2026-07-16.md

`jira_tickets_import.csv` (in this same directory) has all **169 currently-open** items from `bug_fixes_2026-07-16.md`, ready for Jira's native CSV importer. Fixed items were excluded — only what's still actionable.

## Columns

| Column | Notes |
|---|---|
| Summary | Short title (median ~54 chars, max 65), every one prefixed with a short area tag — `[BE]` Backend, `[Web]` Website Frontend, `[Admin]` Admin Panel, `[DB]` Supabase, `[Store]` Store-owner App, `[Rider]` Rider App, `[Cust]` Customer App, `[Infra]` Build/Test/Lint. Full detail lives in Description, not the title. |
| Description | Full detail — file:line references, root cause, impact. Copied near-verbatim from the tracking doc. |
| Issue Type | Always `Bug`. |
| Priority | Mapped from the doc's severity: Critical → **Highest**, High → **High**, Medium → **Medium**, Low → **Low**. |
| Component/s | One of: Backend, Website Frontend, Admin Panel, Supabase, Store-owner App, Rider App, Customer App, Build-Test-Lint Infra. Map this to a Jira Component (or Epic/Label if your project doesn't use Components) during import. |
| Labels | Space-separated tags (e.g. `security auth`, `qa-audit money`). Common ones: `security`, `money`, `pii`, `qa-audit` (found during the QA-audit cross-check pass rather than the original deep-dive), `performance`, `tech-debt`, `testing`, `infra`. |

## How to import

1. In Jira: **Project settings → Import** (or the global `⚙ → System → External System Import → CSV`).
2. Upload `jira_tickets_import.csv`.
3. Map columns: Summary → Summary, Description → Description, Issue Type → Issue Type, Priority → Priority, Component/s → Component (or Label if you'd rather not use Components), Labels → Labels.
   - Jira's CSV importer splits a space-separated Labels cell into multiple labels automatically when mapped to the Labels field — no extra formatting needed.
4. Run the import. 169 bugs land as individual tickets.

## Counts

- By area: Backend 34, Website Frontend 29, Customer App 25, Store-owner App 23, Admin Panel 21, Rider App 21, Build/Test/Lint Infra 8, Supabase 8.
- By priority: Highest 17, High 36, Medium 80, Low 36.

## Before importing, worth deciding

- **169 is a lot of tickets for one import.** If you'd rather not flood the backlog, consider importing just Highest+High first (53 tickets — the security/money-impacting ones), and hold Medium/Low for a second batch or a dedicated cleanup epic.
- **Component mapping**: if your Jira project doesn't have Components matching the 8 areas above, either create them first, or remap that column to Labels/Epic Link during import instead.
- This file will go stale as bugs get fixed — it's a snapshot of `bug_fixes_2026-07-16.md` as of the day it was generated. Re-run against the doc later if you want an updated batch rather than reconciling by hand.
