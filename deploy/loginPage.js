export function loginPage(nonce, destination, error) {
  const action = '/login?' + new URLSearchParams({ next: destination })
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 · GPT Image Playground</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      font: 16px/1.5 system-ui, "Microsoft YaHei", sans-serif;
      --background: #f9fafb;
      --text: #111827;
      --field: #fff;
      --border: #9ca3af;
      --button: #111827;
      --button-text: #fff;
      --focus: #2563eb;
      --error: #b91c1c;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --background: #030712;
        --text: #f3f4f6;
        --field: #111827;
        --border: #6b7280;
        --button: #f3f4f6;
        --button-text: #111827;
        --focus: #93c5fd;
        --error: #fca5a5;
      }
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      min-height: 100svh;
      margin: 0;
      padding: 28px 24px;
      display: grid;
      place-items: center;
      background: var(--background);
      color: var(--text);
    }
    main { width: min(100%, 360px); }
    h1 { margin: 0 0 28px; font-size: 26px; line-height: 1.25; }
    form, label { display: grid; }
    form { gap: 16px; }
    label { gap: 6px; font-size: 14px; font-weight: 600; }
    input, button { width: 100%; min-height: 44px; padding: 8px 12px; border-radius: 8px; font: inherit; }
    input { background: var(--field); color: var(--text); border: 1px solid var(--border); }
    button { border: 0; background: var(--button); color: var(--button-text); font-weight: 600; cursor: pointer; }
    button:hover { opacity: .88; }
    :focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
    .error { margin: 0; color: var(--error); font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>GPT Image Playground</h1>
    <form method="post" action="${action}">
      <label>账号<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
      ${error ? `<p class="error" role="alert">${error}</p>` : ''}
      <button type="submit">登录</button>
    </form>
  </main>
  <script nonce="${nonce}">
    navigator.serviceWorker?.getRegistration('/').then((registration) => registration?.update()).catch(() => {})
  </script>
</body>
</html>`
}
