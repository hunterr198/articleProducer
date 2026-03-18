import { marked } from "marked";

/**
 * Convert Markdown to WeChat-compatible HTML with inline CSS.
 * WeChat strips <style> tags, so every element must carry its own style attribute.
 */
export async function markdownToWechat(markdown: string): Promise<string> {
  // Parse Markdown → HTML
  const rawHtml = await marked(markdown);

  // Apply inline styles via regex replacements
  let html = rawHtml
    // h1
    .replace(
      /<h1([^>]*)>/g,
      '<h1$1 style="font-size:24px;font-weight:bold;margin:24px 0 12px;color:#1a1a1a;line-height:1.4;">'
    )
    // h2
    .replace(
      /<h2([^>]*)>/g,
      '<h2$1 style="font-size:20px;font-weight:bold;margin:20px 0 10px;color:#1a1a1a;line-height:1.4;">'
    )
    // h3
    .replace(
      /<h3([^>]*)>/g,
      '<h3$1 style="font-size:17px;font-weight:bold;margin:16px 0 8px;color:#1a1a1a;line-height:1.4;">'
    )
    // p
    .replace(
      /<p([^>]*)>/g,
      '<p$1 style="font-size:15px;line-height:1.8;margin:0 0 12px;color:#333333;">'
    )
    // strong / b
    .replace(
      /<strong([^>]*)>/g,
      '<strong$1 style="font-weight:bold;color:#1a1a1a;">'
    )
    // a
    .replace(
      /<a([^>]*)>/g,
      '<a$1 style="color:#576b95;text-decoration:none;">'
    )
    // blockquote
    .replace(
      /<blockquote([^>]*)>/g,
      '<blockquote$1 style="border-left:4px solid #576b95;background:#f9f9f9;margin:12px 0;padding:10px 16px;color:#555555;">'
    )
    // code (inline) — must come before pre>code
    .replace(
      /<code([^>]*)>/g,
      '<code$1 style="background:#f4f4f4;padding:2px 5px;border-radius:3px;font-size:13px;font-family:Menlo,Monaco,Consolas,\'Courier New\',monospace;color:#c7254e;">'
    )
    // pre — override code style inside pre
    .replace(
      /<pre([^>]*)>/g,
      '<pre$1 style="background:#f4f4f4;padding:14px 16px;border-radius:4px;overflow-x:auto;margin:12px 0;line-height:1.6;">'
    )
    // ul
    .replace(
      /<ul([^>]*)>/g,
      '<ul$1 style="padding-left:1.5em;margin:0 0 12px;">'
    )
    // ol
    .replace(
      /<ol([^>]*)>/g,
      '<ol$1 style="padding-left:1.5em;margin:0 0 12px;">'
    )
    // li
    .replace(
      /<li([^>]*)>/g,
      '<li$1 style="font-size:15px;line-height:1.8;margin-bottom:4px;color:#333333;">'
    )
    // hr
    .replace(
      /<hr([^>]*)\/?>/g,
      '<hr$1 style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;">'
    )
    // img
    .replace(
      /<img([^>]*)>/g,
      '<img$1 style="max-width:100%;height:auto;display:block;margin:12px auto;">'
    );

  // Fix code inside pre: pre already sets a different bg; reset inline-code colour
  html = html.replace(
    /(<pre[^>]*>)([\s\S]*?)(<\/pre>)/g,
    (_, openPre, content, closePre) => {
      const fixedContent = content.replace(
        /style="background:#f4f4f4;padding:2px 5px;border-radius:3px;font-size:13px;font-family:Menlo,Monaco,Consolas,'Courier New',monospace;color:#c7254e;"/g,
        'style="background:transparent;padding:0;border-radius:0;font-size:13px;font-family:Menlo,Monaco,Consolas,\'Courier New\',monospace;color:#333333;"'
      );
      return `${openPre}${fixedContent}${closePre}`;
    }
  );

  // Wrap in a container section
  return `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:15px;color:#333333;line-height:1.8;word-break:break-word;padding:0 4px;">${html}</section>`;
}
