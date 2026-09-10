type LayoutOpts = {
  title: string;
  body: string;
  authed?: boolean;
  banner?: string;
  bannerKind?: "error" | "info" | "warn";
  /** Unstable-looking chrome id for hostility */
  chromeId?: string;
};

export function layout(opts: LayoutOpts): string {
  const chrome = opts.chromeId ?? `ui_${Math.floor(Math.random() * 90000) + 10000}`;
  const banner =
    opts.banner != null
      ? `<tr><td colspan="2" class="banner banner-${opts.bannerKind ?? "info"}" role="alert">${escapeHtml(opts.banner)}</td></tr>`
      : "";

  const nav = opts.authed
    ? `<a href="/home" aria-label="Home">Home</a>
       &nbsp;|&nbsp;
       <a href="/inject" aria-label="Injection controls">Inject</a>
       &nbsp;|&nbsp;
       <a href="/logout" aria-label="Log out">Log out</a>`
    : `<span>Core Banking Console</span>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <table class="shell" id="${chrome}" role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr class="topbar">
      <td class="brand">Northlake CU — Core Servicing</td>
      <td class="nav" align="right">${nav}</td>
    </tr>
    ${banner}
    <tr>
      <td colspan="2" class="content">
        ${opts.body}
      </td>
    </tr>
    <tr>
      <td colspan="2" class="footer">demo-core · synthetic data only · no test IDs</td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function moneyCell(label: string, value: string): string {
  return `<tr>
    <td class="lbl"><label>${escapeHtml(label)}</label></td>
    <td class="val"><span aria-label="${escapeHtml(label)}">${escapeHtml(value)}</span></td>
  </tr>`;
}
