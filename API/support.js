/**
 * Brightcell Support Email API
 *
 * Customer:
 * index.html
 *      ↓
 * /api/support
 *      ↓
 * Existing Brightcell Worker
 *      ↓
 * Resend
 *      ↓
 * brightcell.support@gmail.com
 */

const WORKER_API =
  "https://brightcell-support-api.parshuram843121.workers.dev";

const SUPPORT_EMAIL =
  "brightcell.support@gmail.com";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(res, status, body) {
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {

  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      success: false,
      error: "Method not allowed."
    });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error(
      "RESEND_API_KEY is not configured."
    );

    return json(res, 500, {
      success: false,
      error:
        "Support email service is not configured."
    });
  }

  const body = req.body || {};

  const requestData = {
    product: String(
      body.product || ""
    ).trim(),

    name: String(
      body.name || ""
    ).trim(),

    email: String(
      body.email || ""
    ).trim().toLowerCase(),

    category: String(
      body.category || ""
    ).trim(),

    subject: String(
      body.subject || ""
    ).trim(),

    message: String(
      body.message || ""
    ).trim()
  };

  if (
    !requestData.product ||
    !requestData.name ||
    !requestData.email ||
    !requestData.category ||
    !requestData.subject ||
    requestData.message.length < 10
  ) {
    return json(res, 400, {
      success: false,
      error:
        "Please complete all required support fields."
    });
  }

  /*
   * Create ticket in the existing
   * Brightcell Support Worker.
   */

  let workerResponse;

  try {

    workerResponse = await fetch(
      WORKER_API + "/",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(
          requestData
        )
      }
    );

  } catch (error) {

    console.error(
      "Worker request failed:",
      error
    );

    return json(res, 502, {
      success: false,
      error:
        "Unable to reach the support server."
    });
  }

  let workerData;

  try {

    workerData =
      await workerResponse.json();

  } catch {

    return json(res, 502, {
      success: false,
      error:
        "The support server returned an invalid response."
    });
  }

  if (
    !workerResponse.ok ||
    !workerData.success
  ) {

    return json(
      res,
      workerResponse.status || 500,
      {
        success: false,
        error:
          workerData.error ||
          "Unable to create the support ticket."
      }
    );
  }

  const ticketId =
    workerData.ticketId ||
    workerData.ticket_id ||
    "Unknown";

  /*
   * Send email notification using Resend.
   */

  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    "Brightcell Support <onboarding@resend.dev>";

  const safe = {

    ticketId:
      escapeHtml(ticketId),

    product:
      escapeHtml(
        requestData.product
      ),

    name:
      escapeHtml(
        requestData.name
      ),

    email:
      escapeHtml(
        requestData.email
      ),

    category:
      escapeHtml(
        requestData.category
      ),

    subject:
      escapeHtml(
        requestData.subject
      ),

    message:
      escapeHtml(
        requestData.message
      )
  };

  const emailHtml = `
<!doctype html>

<html>

<body
  style="
    font-family:Arial,sans-serif;
    line-height:1.6;
    color:#18181b;
  "
>

<h2>
  New Brightcell Support Request
</h2>

<p>
  <strong>Ticket ID:</strong>
  ${safe.ticketId}
</p>

<hr>

<p>
  <strong>Product:</strong>
  ${safe.product}
</p>

<p>
  <strong>Name:</strong>
  ${safe.name}
</p>

<p>
  <strong>Email:</strong>
  ${safe.email}
</p>

<p>
  <strong>Category:</strong>
  ${safe.category}
</p>

<p>
  <strong>Subject:</strong>
  ${safe.subject}
</p>

<h3>
  Customer Message
</h3>

<div
  style="
    white-space:pre-wrap;
    background:#f4f4f5;
    padding:16px;
    border-radius:10px;
  "
>
${safe.message}
</div>

</body>

</html>
`;

  let emailResponse;

  try {

    emailResponse =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${process.env.RESEND_API_KEY}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            from: fromEmail,

            to: [
              SUPPORT_EMAIL
            ],

            reply_to:
              requestData.email,

            subject:
              `[${ticketId}] ${requestData.subject}`,

            html:
              emailHtml
          })
        }
      );

  } catch (error) {

    console.error(
      "Resend request failed:",
      error
    );

    return json(res, 200, {

      success: true,

      ticketId,

      emailSent: false

    });
  }

  if (!emailResponse.ok) {

    const resendError =
      await emailResponse.text();

    console.error(
      "Resend error:",
      resendError
    );

    return json(res, 200, {

      success: true,

      ticketId,

      emailSent: false

    });
  }

  return json(res, 200, {

    success: true,

    ticketId,

    emailSent: true

  });
};
