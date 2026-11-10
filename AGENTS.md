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
- Duplicate expense checks share the same-date/same-cent rule in finance.ts; web saves recheck the caller's sheet and Telegram confirmations keep expiring, chat/user-bound drafts in that sheet's Settings with stable transaction IDs. Why: require explicit consent without a parallel financial store or retry duplicates.
- Dashboard market quotes use independent, public read-only server fetches with short-lived memory caching; never write them to Sheets or include them in finance totals. Why: informational prices must not slow or alter personal financial data.
- Google Sheets (via the Lovable connector gateway, server-only in `src/lib/sheets.server.ts`) is the single source of truth for financial data; Lovable Cloud is used only for sign-in. Why: user requirement — no parallel finance database.
- Columns are resolved by header name and records are upserted by a client-generated stable ID. Why: tolerate column reordering and make retries idempotent (no duplicates).
- Access: the first signed-in user owns the master spreadsheet (`OwnerUserId` in its Settings tab); other users need their email in master `AllowedEmails` and each gets a separate spreadsheet mapped as `Sheet:<userId>`; server functions resolve the spreadsheet per caller. Why: per-user data isolation without a finance database.
- Pure finance calculations live in `src/lib/finance.ts` with tests in `src/test/finance.test.ts`. Why: dashboard rules must be verifiable.
- Expense photos are stored in a Google Drive folder of the connected account (server-only `src/lib/receipts.functions.ts`); transactions keep `drive:<fileId>` in the Attachment column and reads check the file's appProperties.userId. Why: keep all data in the Google account, per-user isolation.
- Telegram quick-entry: webhook `src/routes/api/public/telegram/webhook.ts` (secret header derived from TELEGRAM_API_KEY); link codes `TgCode:<code>` and chat links `Telegram:<chatId>` live in master Settings; parsing in `src/lib/telegram.ts`. Why: no extra database, retries idempotent via `tg-<chat>-<update>` IDs.
- Telegram photos/PDFs are read by AI in server-only `src/lib/receipt-ai.server.ts` (Lovable AI Gateway SDK) and saved as expenses with the file in the Drive receipts folder. Why: quick receipt capture without a database.
- Telegram media downloads go directly to api.telegram.org when TELEGRAM_BOT_TOKEN is set (gateway /file/ as fallback) and are rejected if the byte size differs from getFile's file_size. Why: the gateway file path (photos/file_0.jpg) is not unique across bots and served another bot's image.
