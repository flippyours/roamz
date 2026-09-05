export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { x_handle, wallet_address, comment_url } = req.body;

    if (!x_handle || !wallet_address || !comment_url) {
      return res.status(400).json({ error: "Complete all fields." });
    }

    const handle = x_handle.replace("@", "").trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) {
      return res.status(400).json({ error: "Invalid X handle." });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address.trim())) {
      return res.status(400).json({ error: "Invalid wallet address." });
    }

    let url;

    try {
      url = new URL(comment_url);
    } catch {
      return res.status(400).json({ error: "Invalid X URL." });
    }

    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) {
      return res.status(400).json({ error: "Use an X post URL." });
    }

    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length < 3 || parts[1] !== "status") {
      return res.status(400).json({ error: "Invalid X post URL." });
    }

    if (parts[0].toLowerCase() !== handle) {
      return res.status(400).json({
        error: "X handle must match the comment URL."
      });
    }

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/whitelist`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          x_handle: "@" + handle,
          wallet_address: wallet_address.trim().toLowerCase(),
          comment_url,
          review_status: "pending"
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();

      if (response.status === 409) {
        return res.status(409).json({
          error: "Wallet or comment already submitted."
        });
      }

      console.error(text);
      return res.status(500).json({ error: "Could not save entry." });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error." });
  }
}
