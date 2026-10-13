<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Google Sheets (via the Lovable connector gateway, server-only in `src/lib/sheets.server.ts`) is the single source of truth for financial data; Lovable Cloud is used only for sign-in. Why: user requirement — no parallel finance database.
- Columns are resolved by header name and records are upserted by a client-generated stable ID. Why: tolerate column reordering and make retries idempotent (no duplicates).
- Access is private: the first signed-in user is stored as `OwnerUserId` in the Settings tab and every server function rejects other users. Why: single-owner app without a roles table.
- Pure finance calculations live in `src/lib/finance.ts` with tests in `src/test/finance.test.ts`. Why: dashboard rules must be verifiable.
