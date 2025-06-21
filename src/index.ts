import PostalMime from "postal-mime";
import { convert } from "html-to-text";

export interface Env {
  API_ENDPOINT: string;
  API_TOKEN: string;
  ALLOWED_EMAILS: string;
}

export interface ForwardableEmailMessage {
  from: string;
  headers: Headers;
  raw: string | ReadableStream<Uint8Array>;
}

function isEmailAllowed(senderEmail: string, allowedEmails: string): boolean {
  const allowedList = allowedEmails.split(',').map(email => email.trim().toLowerCase());
  const sender = senderEmail.toLowerCase();
  return allowedList.some(allowed => {
    if (allowed.startsWith('@')) return sender.endsWith(allowed);
    return sender === allowed;
  });
}

const parseContent = (text?: string, html?: string): string => {
  // Extract body (prefer plain text, fallback to HTML conversion)
  let body = text;
  if (!body && html) {
    body = convert(html, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' }
      ]
    });
  }

  if (!body) {
    return "(No text content found)";
  }

  return body.trim();
};

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      if (!isEmailAllowed(message.from, env.ALLOWED_EMAILS)) {
        console.log(`Rejected email from unauthorized sender: ${message.from}`);
        return;
      }

      // Parse email with postal-mime
      const email = await PostalMime.parse(message.raw);

      // Extract and convert content
      const body = parseContent(email.text, email.html);

      console.log("Email parsed successfully");
      console.log("From:", email.from?.name || "Unknown", `<${email.from?.address || message.from}>`);
      console.log("Subject:", email.subject || "No subject");
      console.log("Body length:", body.length);
      console.log("First 300 chars:", body.slice(0, 300));

      const emailData = {
        sender: message.from,
        subject: email.subject || "",
        date: message.headers.get("Date") || "",
        body: body,
      };

      const response = await fetch(env.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Token": env.API_TOKEN,
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        console.error(`Failed to forward email: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error("Error Response Body:", errorText);
      } else {
        console.log("Email successfully forwarded to API");
      }
    } catch (error) {
      console.error("Error processing email:", error);
    }
  },
};